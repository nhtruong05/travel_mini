// Đường dẫn /api đi qua proxy của Vite tới Flask :5000 (cả localhost lẫn ngrok).

export function getSessionId() {
  const key = "travel_mini_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function api(path, options = {}) {
  const token = sessionStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message || `Lỗi yêu cầu (${res.status}).`), {
      status: res.status,
      data,
    });
  }
  return data;
}

// ---- Định dạng hiển thị ----
const toDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d : null;
};

export const formatVND = (v) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(v || 0));

export const formatDate = (v) =>
  toDate(v)?.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) ?? "—";

export const formatTime = (v) =>
  toDate(v)?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--";

export const durationText = (minutes = 0) => {
  const total = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} giờ${m ? ` ${m} phút` : ""}`;
};
// Alias cho API đặt vé xe khách
export const busApi = api;