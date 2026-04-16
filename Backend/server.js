const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const app = express();
const PORT = process.env.PORT || 4001;
const MONGODB_URI = process.env.MONGODB_URI;
const SERIAL_PORT_PATH = process.env.SERIAL_PORT || "";
const SERIAL_BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE || 115200);
const SERIAL_DEBUG = String(process.env.SERIAL_DEBUG || "false").toLowerCase() === "true";
const DEFAULT_DURATION_MINUTES = Number(process.env.DEFAULT_SESSION_DURATION_MINUTES || 120);

const mongoReadyStateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
};

const KNOWN_STUDENTS = {
    E376F802: { studentName: "Haneen", studentId: "E376F802" },
    "21636DA3": { studentName: "Sama", studentId: "21636DA3" },
    "7C797800": { studentName: "Mariam", studentId: "7C797800" }
};

const COURSES = {
    CSE101: {
        courseId: "CSE101",
        courseName: "IT Attendance",
        students: Object.values(KNOWN_STUDENTS)
    }
};

const serialStatus = {
    enabled: Boolean(SERIAL_PORT_PATH),
    port: SERIAL_PORT_PATH || null,
    baudRate: SERIAL_BAUD_RATE,
    connected: false,
    lastLine: null,
    lastUid: null,
    parsedLines: 0,
    successfulScans: 0,
    errors: 0,
    lastError: null
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!MONGODB_URI) {
    console.error("Missing MONGODB_URI environment variable.");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch((err) => console.error("Connection error:", err));

const scanSchema = new mongoose.Schema({
    uid: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    source: { type: String, default: "api", trim: true },
    message: { type: String, default: "", trim: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const lectureSessionSchema = new mongoose.Schema({
    courseId: { type: String, required: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    status: { type: String, enum: ["Running", "Ended"], default: "Running" },
    presentStudentIds: { type: [String], default: [] },
    scans: { type: [scanSchema], default: [] },
    reportGeneratedAt: { type: Date, default: null }
}, { timestamps: true });

const LectureSession = mongoose.model("LectureSession", lectureSessionSchema);

const normalizeUid = (uid) => String(uid || "").trim().toUpperCase();

const getCourse = (courseId) => COURSES[courseId] || COURSES.CSE101;

const buildSessionReport = (sessionDoc) => {
    const course = getCourse(sessionDoc.courseId);
    const allStudents = course.students;
    const presentSet = new Set(sessionDoc.presentStudentIds || []);
    const presentStudents = allStudents.filter((student) => presentSet.has(student.studentId));
    const absentStudents = allStudents.filter((student) => !presentSet.has(student.studentId));

    return {
        sessionId: sessionDoc._id,
        courseId: sessionDoc.courseId,
        courseName: sessionDoc.courseName,
        startTime: sessionDoc.startTime,
        endTime: sessionDoc.endTime,
        status: sessionDoc.status,
        totalStudents: allStudents.length,
        presentCount: presentStudents.length,
        absentCount: absentStudents.length,
        presentStudents,
        absentStudents
    };
};

const buildStudentAttendanceSummary = async (studentId) => {
    const normalizedStudentId = normalizeUid(studentId);
    const student = KNOWN_STUDENTS[normalizedStudentId];
    if (!student) return null;

    const sessions = await LectureSession.find({
        status: { $in: ["Running", "Ended"] }
    }).sort({ startTime: -1 });
    const subjectsMap = {};

    sessions.forEach((session) => {
        const key = session.courseId;
        if (!subjectsMap[key]) {
            subjectsMap[key] = {
                subjectName: session.courseName,
                subjectCode: session.courseId,
                presentCount: 0,
                absentCount: 0
            };
        }

        const present = (session.presentStudentIds || []).includes(normalizedStudentId);
        if (session.status === "Running") {
            if (present) {
                subjectsMap[key].presentCount += 1;
            }
            return;
        }

        if (present) {
            subjectsMap[key].presentCount += 1;
        } else {
            subjectsMap[key].absentCount += 1;
        }
    });

    const subjects = Object.values(subjectsMap).map((item) => {
        const total = item.presentCount + item.absentCount;
        const attendancePercentage = total === 0 ? 0 : Math.round((item.presentCount / total) * 100);
        return { ...item, attendancePercentage };
    });

    const presentDays = subjects.reduce((sum, s) => sum + s.presentCount, 0);
    const absentDays = subjects.reduce((sum, s) => sum + s.absentCount, 0);
    const totalDays = presentDays + absentDays;
    const totalAttendancePercentage = totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100);

    return {
        studentId: normalizedStudentId,
        studentName: student.studentName,
        totalAttendancePercentage,
        presentDays,
        absentDays,
        subjects
    };
};

const getActiveSession = async () => {
    const now = new Date();
    let session = await LectureSession.findOne({ status: "Running" }).sort({ startTime: -1 });
    if (!session) return null;

    if (session.endTime <= now) {
        session.status = "Ended";
        session.reportGeneratedAt = new Date();
        await session.save();
        return null;
    }
    return session;
};

const processRfidScan = async (uid, source = "api") => {
    const normalizedUid = normalizeUid(uid);
    if (!normalizedUid) {
        return { statusCode: 400, payload: { success: false, message: "Card UID is required" } };
    }

    const session = await getActiveSession();
    if (!session) {
        return { statusCode: 400, payload: { success: false, message: "No active lecture session" } };
    }

    const student = KNOWN_STUDENTS[normalizedUid];
    if (!student) {
        return {
            statusCode: 404,
            payload: {
                success: false,
                sessionId: session._id,
                uid: normalizedUid,
                status: "Denied",
                message: "Access denied: unknown card"
            }
        };
    }

    if (session.presentStudentIds.includes(student.studentId)) {
        return {
            statusCode: 200,
            payload: {
                success: true,
                sessionId: session._id,
                uid: normalizedUid,
                name: student.studentName,
                id: student.studentId,
                status: "Present",
                message: "Already marked present"
            }
        };
    }

    session.presentStudentIds.push(student.studentId);
    session.scans.push({
        uid: normalizedUid,
        studentId: student.studentId,
        studentName: student.studentName,
        status: "Present",
        source,
        message: `Welcome ${student.studentName}, attendance marked`
    });
    await session.save();

    serialStatus.successfulScans += 1;
    serialStatus.lastUid = normalizedUid;
    return {
        statusCode: 201,
        payload: {
            success: true,
            sessionId: session._id,
            uid: normalizedUid,
            name: student.studentName,
            id: student.studentId,
            status: "Present",
            message: `Welcome ${student.studentName}, attendance marked`
        }
    };
};

const startSerialListener = () => {
    if (!SERIAL_PORT_PATH) {
        console.log("Serial/Bluetooth listener disabled. Set SERIAL_PORT (for example COM6) in .env.");
        return;
    }

    try {
        const serial = new SerialPort({ path: SERIAL_PORT_PATH, baudRate: SERIAL_BAUD_RATE });
        const parser = serial.pipe(new ReadlineParser({ delimiter: "\n" }));

        serial.on("open", () => {
            serialStatus.connected = true;
            console.log(`Serial listener connected on ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD_RATE}`);
        });

        serial.on("error", (err) => {
            serialStatus.errors += 1;
            serialStatus.lastError = err.message;
            console.error("Serial port error:", err.message);
        });

        serial.on("close", () => {
            serialStatus.connected = false;
            console.log("Serial listener disconnected.");
        });

        parser.on("data", async (line) => {
            const text = String(line || "").trim();
            if (!text) return;
            serialStatus.lastLine = text;
            serialStatus.parsedLines += 1;
            if (SERIAL_DEBUG) console.log(`[SERIAL] ${text}`);

            const match = text.match(/(?:Scanned ID:\s*|UID:?\s*)([0-9A-F]+)/i);
            if (!match) return;

            try {
                await processRfidScan(match[1], "serial");
            } catch (err) {
                serialStatus.errors += 1;
                serialStatus.lastError = err.message;
                console.error("Failed to process serial RFID scan:", err.message);
            }
        });
    } catch (err) {
        serialStatus.errors += 1;
        serialStatus.lastError = err.message;
        console.error("Failed to start serial listener:", err.message);
    }
};

app.post("/session/start", async (req, res) => {
    try {
        const running = await getActiveSession();
        if (running) {
            return res.status(409).json({ success: false, message: "A lecture session is already running", sessionId: running._id });
        }

        const courseId = String(req.body.courseId || "CSE101");
        const course = getCourse(courseId);
        const durationMinutes = Number(req.body.durationMinutes || DEFAULT_DURATION_MINUTES);
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        const session = await LectureSession.create({
            courseId: course.courseId,
            courseName: course.courseName,
            startTime,
            endTime,
            durationMinutes,
            status: "Running"
        });

        return res.status(201).json({ success: true, message: "Lecture session started", sessionId: session._id, startTime, endTime });
    } catch (err) {
        console.error("Failed to start session:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.post("/session/end", async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const session = sessionId
            ? await LectureSession.findById(sessionId)
            : await LectureSession.findOne({ status: "Running" }).sort({ startTime: -1 });

        if (!session) {
            return res.status(404).json({ success: false, message: "No session found to end" });
        }

        session.status = "Ended";
        session.endTime = new Date();
        session.reportGeneratedAt = new Date();
        await session.save();

        return res.status(200).json({
            success: true,
            message: "Lecture session ended",
            report: buildSessionReport(session)
        });
    } catch (err) {
        console.error("Failed to end session:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.post("/attendance/scan-rfid", async (req, res) => {
    try {
        const result = await processRfidScan(req.body.uid, "api");
        return res.status(result.statusCode).json(result.payload);
    } catch (err) {
        console.error("Failed to scan RFID:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/session/:id/report", async (req, res) => {
    try {
        const session = await LectureSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found" });
        }
        return res.status(200).json({ success: true, report: buildSessionReport(session) });
    } catch (err) {
        console.error("Failed to load session report:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/session/history", async (req, res) => {
    try {
        const sessions = await LectureSession.find({}).sort({ startTime: -1 }).limit(50);
        const history = sessions.map((session) => {
            const report = buildSessionReport(session);
            return {
                sessionId: session._id,
                date: session.startTime,
                courseName: session.courseName,
                courseId: session.courseId,
                status: session.status,
                presentCount: report.presentCount,
                absentCount: report.absentCount
            };
        });
        return res.status(200).json({ success: true, sessions: history });
    } catch (err) {
        console.error("Failed to fetch history:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/session/active", async (req, res) => {
    try {
        const activeSession = await getActiveSession();
        if (!activeSession) {
            return res.status(200).json({ success: true, active: null });
        }
        return res.status(200).json({ success: true, active: buildSessionReport(activeSession) });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/dashboard/overview", async (req, res) => {
    try {
        const course = getCourse("CSE101");
        const activeSession = await getActiveSession();
        const report = activeSession ? buildSessionReport(activeSession) : null;

        return res.status(200).json({
            success: true,
            courseId: course.courseId,
            courseName: course.courseName,
            totalStudents: course.students.length,
            activeLectureStatus: activeSession ? "Running" : "Ended",
            presentCount: report ? report.presentCount : 0,
            absentCount: report ? report.absentCount : course.students.length
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/students", (req, res) => {
    const students = Object.values(KNOWN_STUDENTS).map((item) => ({
        studentId: item.studentId,
        studentName: item.studentName
    }));
    return res.status(200).json({ success: true, students });
});

app.get("/student/:id/profile", async (req, res) => {
    const summary = await buildStudentAttendanceSummary(req.params.id);
    if (!summary) {
        return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.status(200).json({
        success: true,
        profile: {
            studentId: summary.studentId,
            studentName: summary.studentName
        }
    });
});

app.get("/student/:id/attendance-summary", async (req, res) => {
    const summary = await buildStudentAttendanceSummary(req.params.id);
    if (!summary) {
        return res.status(404).json({ success: false, message: "Student not found" });
    }
    return res.status(200).json({ success: true, summary });
});

app.post("/api/rfid/scan", async (req, res) => {
    try {
        const result = await processRfidScan(req.body.uid, "api");
        return res.status(result.statusCode).json(result.payload);
    } catch (err) {
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get("/health", (req, res) => {
    return res.status(200).json({
        ok: true,
        port: PORT,
        mongoState: mongoReadyStateMap[mongoose.connection.readyState] || "unknown",
        serial: {
            enabled: serialStatus.enabled,
            connected: serialStatus.connected,
            port: serialStatus.port
        }
    });
});

app.get("/api/debug/serial-status", async (req, res) => {
    try {
        const availablePorts = await SerialPort.list();
        return res.status(200).json({
            serial: serialStatus,
            mongoState: mongoReadyStateMap[mongoose.connection.readyState] || "unknown",
            availablePorts: availablePorts.map((item) => ({
                path: item.path,
                manufacturer: item.manufacturer || null,
                friendlyName: item.friendlyName || null
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get("/", (req, res) => {
    return res.status(200).json({ message: "RFID attendance backend is running" });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    startSerialListener();
});