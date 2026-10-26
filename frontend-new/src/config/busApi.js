// Use same-origin API paths. In local development, Vite proxies /api to Flask :5000.
// This also lets the ngrok URL serve the frontend and proxy API requests to Flask.
export const API_BASE_URL = "";

export function getBusSessionId() {
  let id = sessionStorage.getItem("travel_mini_bus_session_id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `bus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("travel_mini_bus_session_id", id);
  }
  return id;
}

export async function busApi(path, options = {}) {
  const token = sessionStorage.getItem("access_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.message || `Lỗi yêu cầu (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const formatVND = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0,
}).format(Number(value || 0));

export const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
};

export const formatTime = (value) => {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

export const durationText = (minutes = 0) => {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return `${hours} giờ${remainder ? ` ${remainder} phút` : ""}`;
};
