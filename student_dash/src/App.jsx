import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Loader2,
  Percent,
  ShieldCheck,
  UserRound,
  XCircle
} from "lucide-react";
import { getDefaultStudentId, studentApi } from "./api";

function StatCard({ title, value, icon: Icon, tone = "accent" }) {
  const wrap = tone === "danger" ? "danger" : tone === "success" ? "success" : "accent";
  return (
    <div className="stat-card">
      <div className="stat-top">
        <p className="label">{title}</p>
        <div className={`icon-wrap ${wrap}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      <h3>{value}</h3>
    </div>
  );
}

export default function App() {
  const [studentId, setStudentId] = useState(() => getDefaultStudentId());
  const [students, setStudents] = useState([]);
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [profileResponse, summaryResponse] = await Promise.all([
        studentApi.getProfile(studentId),
        studentApi.getAttendanceSummary(studentId)
      ]);
      setProfile(profileResponse.profile);
      setSummary(summaryResponse.summary);
      setError("");
    } catch (err) {
      setProfile(null);
      setSummary(null);
      setError(
        err.message === "Failed to fetch"
          ? "Cannot reach the server. Use http://localhost:5174 and ensure the backend runs on http://localhost:4001 (set VITE_API_BASE if needed)."
          : err.message
      );
    }
  }, [studentId]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const data = await studentApi.getStudents();
        setStudents(data.students || []);
      } catch {
        setStudents([]);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const onSelectStudent = (id) => {
    setStudentId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    window.history.replaceState({}, "", url);
  };

  if (!profile || !summary) {
    return (
      <main className="wrap">
        <div className="app-header-bar">
          <div className="logo-mark">
            <GraduationCap size={22} strokeWidth={2} />
          </div>
          <div className="logo-text">
            <strong>Student portal</strong>
            <span>Attendance overview</span>
          </div>
        </div>
        {students.length > 0 ? (
          <label className="field">
            <span className="label">Student</span>
            <select value={studentId} onChange={(e) => onSelectStudent(e.target.value)}>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.studentName} ({s.studentId})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="muted">
          Tip: use <code>?id=E376F802</code> or pick a student above.
        </p>
        <div className="loading-screen">
          {!error ? (
            <>
              <div className="spinner-wrap">
                <Loader2 size={32} className="spin" strokeWidth={2} />
              </div>
              <p className="muted">Loading your dashboard…</p>
            </>
          ) : (
            <p className="error error-block">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="app-header-bar">
        <div className="logo-mark">
          <GraduationCap size={22} strokeWidth={2} />
        </div>
        <div className="logo-text">
          <strong>Student portal</strong>
          <span>Attendance overview</span>
        </div>
      </div>

      <header className="topbar">
        <div>
          <h1>
            <UserRound className="title-icon" size={28} strokeWidth={2} />
            {profile.studentName}
          </h1>
          <p className="muted">ID <code>{profile.studentId}</code></p>
        </div>
        <div className="pill">
          <ShieldCheck size={16} strokeWidth={2} />
          Read-only
        </div>
      </header>

      {students.length > 0 ? (
        <label className="field inline">
          <span className="label">View as</span>
          <select value={studentId} onChange={(e) => onSelectStudent(e.target.value)}>
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.studentName} ({s.studentId})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="grid">
        <StatCard title="Attendance %" value={`${summary.totalAttendancePercentage}%`} icon={Percent} />
        <StatCard title="Present days" value={summary.presentDays} icon={CalendarDays} tone="success" />
        <StatCard title="Absent days" value={summary.absentDays} icon={XCircle} tone="danger" />
        <StatCard title="Subjects" value={summary.subjects.length} icon={BookOpen} />
      </section>

      <p className="small">
        Finished lectures count toward present/absent. During a live session, your scan counts as present for that
        course until the lecture ends.
      </p>

      <section className="table-wrap">
        <h2>
          <BookOpen size={20} strokeWidth={2} color="var(--accent)" />
          Subjects
        </h2>
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Attendance %</th>
              <th>Present</th>
              <th>Absent</th>
            </tr>
          </thead>
          <tbody>
            {summary.subjects.map((subject) => (
              <tr key={subject.subjectCode}>
                <td>{subject.subjectName}</td>
                <td>
                  <strong>{subject.attendancePercentage}%</strong>
                </td>
                <td>{subject.presentCount}</td>
                <td>{subject.absentCount}</td>
              </tr>
            ))}
            {!summary.subjects.length ? (
              <tr>
                <td colSpan="4" className="muted" style={{ padding: "28px 12px", textAlign: "center" }}>
                  No rows yet. After sessions run and end, your stats appear here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
