const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4001";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Request failed");
  }
  return payload;
}

export const api = {
  getOverview: () => request("/dashboard/overview"),
  getActiveSession: () => request("/session/active"),
  getHistory: () => request("/session/history"),
  getSessionReport: (id) => request(`/session/${id}/report`),
  startSession: (durationMinutes = 120, courseId = "CSE101") =>
    request("/session/start", {
      method: "POST",
      body: JSON.stringify({ durationMinutes, courseId })
    }),
  endSession: (sessionId) =>
    request("/session/end", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    }),
  scanRfid: (uid) =>
    request("/attendance/scan-rfid", {
      method: "POST",
      body: JSON.stringify({ uid })
    })
};
