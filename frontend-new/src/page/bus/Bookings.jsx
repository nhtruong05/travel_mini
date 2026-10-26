import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatDate, formatTime, formatVND } from "../../api";
import "../../css/bus-booking.css";


const STATUS = { PENDING_PAYMENT: "Chờ thanh toán", PAID: "Đã thanh toán", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy", EXPIRED: "Hết hạn", CANCELLATION_REQUESTED: "Đang xét hủy", CANCELLED_REFUND_PENDING: "Chờ hoàn tiền" };

export default function BusBookings() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingCode, setWorkingCode] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const data = await api("/api/bus/bookings?limit=50"); setItems(data.items || []); }
    catch (e) { setError(e.message || "Không tải được lịch sử đặt vé."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (sessionStorage.getItem("access_token")) load(); else setLoading(false); }, []);

  async function cancelBooking(code, status) {
    const promptText = status === "PENDING_PAYMENT" ? "Hủy đơn chưa thanh toán và giải phóng chỗ này?" : "Gửi yêu cầu hủy/hoàn vé để nhà xe xem xét?";
    if (!window.confirm(promptText)) return;
    setWorkingCode(code); setError(""); setNotice("");
    try { const data = await api(`/api/bus/bookings/${encodeURIComponent(code)}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Khách yêu cầu hủy từ lịch sử đặt vé" }) }); setNotice(data.message || "Đã cập nhật yêu cầu."); await load(); }
    catch (e) { setError(e.message || "Không hủy được đơn."); }
    finally { setWorkingCode(""); }
  }

  const loggedIn = Boolean(sessionStorage.getItem("access_token"));
  return <div className="bus-page"><header className="bus-header"><Link className="bus-brand" to="/"><span className="bus-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span></Link><nav className="bus-nav"><Link to="/">Trang chủ</Link><Link to="/bus/search"></Link><Link className="active" to="/bus/bookings">Đơn của tôi</Link></nav><div className="bus-header-actions"><Link className="bus-button bus-button-outline" to={loggedIn ? "/profile" : "/login"}>{loggedIn ? "Tài khoản" : "Đăng nhập"}</Link></div></header>
    <main className="bus-bookings-main"><section className="bus-results-heading"><div><span className="bus-eyebrow">QUẢN LÝ VÉ</span><h1>Lịch sử đặt vé</h1><p>Tra cứu đơn, xem vé điện tử hoặc gửi yêu cầu hủy/hoàn.</p></div><Link className="bus-button bus-button-primary" to="/bus/search">Tìm chuyến mới</Link></section>
      {!loggedIn && <div className="bus-state-panel"><h2>Đăng nhập để xem đơn</h2><p>Lịch sử đặt vé được gắn với tài khoản.</p><Link className="bus-button bus-button-primary" to="/login">Đăng nhập</Link></div>}
      {loading && loggedIn && <div className="bus-state-panel"><span className="bus-spinner"/><p>Đang tải lịch sử…</p></div>}
      {error && <div className="bus-alert bus-alert-error">{error}</div>}{notice && <div className="bus-alert bus-alert-success">{notice}</div>}
      {!loading && loggedIn && !error && items.length === 0 && <div className="bus-state-panel"><span className="bus-empty-symbol">▤</span><h2>Chưa có đơn đặt vé</h2><p>Khi đặt vé xe thành công, đơn sẽ hiển thị tại đây.</p><Link className="bus-button bus-button-primary" to="/bus/search"></Link></div>}
      <div className="bus-booking-list">{items.map((item) => <article className="bus-booking-card" key={item.id}><div className="bus-booking-card-header"><div><span className="bus-eyebrow">MÃ ĐƠN</span><h2>{item.bookingCode}</h2></div><span className={`bus-status-pill status-${String(item.status).toLowerCase()}`}>{STATUS[item.status] || item.status}</span></div><div className="bus-booking-route"><div><small>Điểm đi</small><b>{item.trip?.originName || "—"}</b><span>{formatTime(item.trip?.departureAt)}</span></div><span className="bus-route-arrow">→</span><div><small>Điểm đến</small><b>{item.trip?.destinationName || "—"}</b><span>{formatDate(item.trip?.departureAt)}</span></div></div><div className="bus-booking-bottom"><div><small>Nhà xe</small><b>{item.provider || "—"}</b><small>Tổng tiền</small><strong>{formatVND(item.finalAmount)}</strong></div><div className="bus-booking-actions"><button className="bus-button bus-button-outline" type="button" onClick={() => navigate(`/bus/bookings/${encodeURIComponent(item.bookingCode)}`)}>Chi tiết / vé</button>{["PENDING_PAYMENT", "PAID", "CANCELLATION_REQUESTED"].includes(item.status) && <button className="bus-button bus-button-danger-outline" type="button" disabled={workingCode === item.bookingCode || item.status === "CANCELLATION_REQUESTED"} onClick={() => cancelBooking(item.bookingCode, item.status)}>{workingCode === item.bookingCode ? "Đang xử lý…" : item.status === "PENDING_PAYMENT" ? "Hủy đơn" : "Yêu cầu hủy/hoàn"}</button>}</div></div></article>)}</div>
    </main><footer className="bus-footer">© {new Date().getFullYear()} Travel Mini</footer></div>;
}
