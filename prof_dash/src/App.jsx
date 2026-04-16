import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  GraduationCap,
  History,
  LayoutDashboard,
  Play,
  Radio,
  ScanLine,
  Square,
  UserCheck,
  UserX,
  Users
} from "lucide-react";
import { api } from "./api";

function Layout({ children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <GraduationCap size={22} strokeWidth={2} />
          </div>
          <div className="brand-text">
            <strong>Dr. Aida Nasr</strong>
            <span>IT Attendance</span>
          </div>
        </div>
        <nav>
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} end>
            <LayoutDashboard size={20} strokeWidth={2} />
            Dashboard
          </NavLink>
          <NavLink to="/live" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <Radio size={20} strokeWidth={2} />
            Live attendance
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <History size={20} strokeWidth={2} />
            Session history
          </NavLink>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone = "accent", mono = false }) {
  const wrapClass =
    tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "neutral" ? "neutral" : "accent";
  return (
    <div className="stat-card">
      <div className="stat-top">
        <p className="card-title">{title}</p>
        <div className={`icon-wrap ${wrapClass}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      </div>
      <h3 className={mono ? "stat-value-mono" : undefined}>{value}</h3>
    </div>
  );
}

function DashboardHome() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await api.getOverview();
        if (mounted) {
          setOverview(data);
          setError("");
        }
      } catch (err) {
        if (mounted) setError(err.message);
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!overview) {
    return (
      <>
        <div className="page-header">
          <p className="eyebrow">Overview</p>
          <h2>Dashboard</h2>
        </div>
        <p className="loading-line">{error || "Loading dashboard…"}</p>
      </>
    );
  }

  const live = overview.activeLectureStatus === "Running";

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">Overview</p>
        <h2>Dashboard</h2>
        <p className="sub">Course metrics and live lecture status refresh automatically.</p>
      </div>
      <div className="card-grid">
        <StatCard title="Course" value={overview.courseName} icon={BookOpen} tone="accent" />
        <StatCard title="Total students" value={overview.totalStudents} icon={Users} tone="neutral" />
        <StatCard
          title="Lecture status"
          value={overview.activeLectureStatus}
          icon={live ? CircleDot : CalendarClock}
          tone={live ? "success" : "neutral"}
        />
        <StatCard title="Present" value={overview.presentCount} icon={UserCheck} tone="success" />
        <StatCard title="Absent" value={overview.absentCount} icon={UserX} tone="danger" />
      </div>
      {error ? (
        <div className="alert error">
          <span>{error}</span>
        </div>
      ) : null}
    </>
  );
}

function LiveAttendance() {
  const [active, setActive] = useState(null);
  const [uid, setUid] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadActive = async () => {
    try {
      const data = await api.getActiveSession();
      setActive(data.active);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadActive();
    const timer = setInterval(loadActive, 3000);
    return () => clearInterval(timer);
  }, []);

  const startSession = async () => {
    setLoading(true);
    try {
      await api.startSession(120);
      setMessage("Lecture session started");
      await loadActive();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    if (!active?.sessionId) return;
    setLoading(true);
    try {
      await api.endSession(active.sessionId);
      setMessage("Lecture session ended");
      await loadActive();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const manualScan = async (event) => {
    event.preventDefault();
    if (!uid.trim()) return;
    setLoading(true);
    try {
      const result = await api.scanRfid(uid.trim());
      setMessage(result.message);
      setUid("");
      await loadActive();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const presentMap = useMemo(() => {
    const map = new Map();
    (active?.presentStudents || []).forEach((student) => map.set(student.studentId, "Present"));
    (active?.absentStudents || []).forEach((student) => map.set(student.studentId, "Not yet scanned"));
    return map;
  }, [active]);

  const allStudents = useMemo(
    () => [...(active?.presentStudents || []), ...(active?.absentStudents || [])],
    [active]
  );

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">Session</p>
        <h2>Live attendance</h2>
        <p className="sub">Start a lecture, then RFID scans from the reader appear here in real time.</p>
      </div>

      <div className="toolbar">
        <button className="btn success" type="button" onClick={startSession} disabled={loading || Boolean(active)}>
          <Play size={18} />
          Start session
        </button>
        <button className="btn danger" type="button" onClick={endSession} disabled={loading || !active}>
          <Square size={16} />
          End session
        </button>
        <span className={`status-chip${active ? " live" : " idle"}`}>
          {active ? <CircleDot size={16} /> : <CalendarClock size={16} />}
          {active ? "Session running" : "No active session"}
        </span>
      </div>

      <form className="scan-form" onSubmit={manualScan}>
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="Test UID (e.g. E376F802)"
          aria-label="RFID UID for testing"
        />
        <button className="btn primary" type="submit" disabled={loading || !active}>
          <ScanLine size={18} />
          Scan RFID
        </button>
      </form>

      {message ? (
        <div className="alert success">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="alert error">
          <span>{error}</span>
        </div>
      ) : null}

      {active ? (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allStudents.map((student) => (
                <tr key={student.studentId}>
                  <td>{student.studentName}</td>
                  <td className="mono">{student.studentId}</td>
                  <td>
                    <span
                      className={
                        presentMap.get(student.studentId) === "Present" ? "badge success" : "badge muted"
                      }
                    >
                      {presentMap.get(student.studentId) === "Present" ? (
                        <CheckCircle2 size={14} />
                      ) : null}
                      {presentMap.get(student.studentId)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-card empty-state">No active session. Start a lecture to record attendance.</div>
      )}
    </>
  );
}

function SessionHistory() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getHistory();
        setSessions(data.sessions || []);
      } catch (err) {
        setError(err.message);
      }
    };
    load();
  }, []);

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">Archive</p>
        <h2>Session history</h2>
        <p className="sub">Past lecture sessions with attendance summaries.</p>
      </div>
      {error ? (
        <div className="alert error">
          <span>{error}</span>
        </div>
      ) : null}
      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Course</th>
              <th>Present</th>
              <th>Absent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId}>
                <td>{new Date(session.date).toLocaleString()}</td>
                <td>{session.courseName}</td>
                <td>{session.presentCount}</td>
                <td>{session.absentCount}</td>
                <td>
                  <Link className="btn ghost small" to={`/sessions/${session.sessionId}`}>
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            {!sessions.length ? (
              <tr>
                <td colSpan="5">
                  <div className="empty-state" style={{ padding: "32px 16px" }}>
                    No sessions yet.
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SessionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getSessionReport(id);
        setReport(data.report);
      } catch (err) {
        setError(err.message);
      }
    };
    load();
  }, [id]);

  return (
    <>
      <button className="btn ghost small" type="button" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} />
        Back
      </button>
      <div className="page-header">
        <p className="eyebrow">Report</p>
        <h2>Session details</h2>
      </div>
      {error ? (
        <div className="alert error">
          <span>{error}</span>
        </div>
      ) : null}
      {!report ? (
        <p className="loading-line">Loading…</p>
      ) : (
        <div className="split">
          <div className="panel">
            <h3>
              <UserCheck size={18} color="var(--success)" />
              Present ({report.presentCount})
            </h3>
            <ul>
              {report.presentStudents.map((student) => (
                <li key={student.studentId}>
                  <div className="name">{student.studentName}</div>
                  <div className="id">{student.studentId}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <h3>
              <UserX size={18} color="var(--danger)" />
              Absent ({report.absentCount})
            </h3>
            <ul>
              {report.absentStudents.map((student) => (
                <li key={student.studentId}>
                  <div className="name">{student.studentName}</div>
                  <div className="id">{student.studentId}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/live" element={<LiveAttendance />} />
        <Route path="/history" element={<SessionHistory />} />
        <Route path="/sessions/:id" element={<SessionDetails />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
