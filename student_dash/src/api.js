const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4001";

function normalizeStudentId(id) {
  return String(id || "").trim().toUpperCase();
}

function studentIdFromUrl() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("id");
  return q ? normalizeStudentId(q) : null;
}

export function getDefaultStudentId() {
  return studentIdFromUrl() || import.meta.env.VITE_STUDENT_ID || "E376F802";
}

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(
      payload.message || payload.error || `Request failed (${response.status})`
    );
  }
  return payload;
}

export const studentApi = {
  getStudents: () => request("/students"),
  getProfile: (studentId) => request(`/student/${normalizeStudentId(studentId)}/profile`),
  getAttendanceSummary: (studentId) =>
    request(`/student/${normalizeStudentId(studentId)}/attendance-summary`)
};
