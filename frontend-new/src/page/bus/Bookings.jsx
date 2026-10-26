import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/bookings.css";

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0,
}).format(Number(value || 0));

const statusInfo = (value) => {
  const status = String(value || "PENDING_PAYMENT").toUpperCase();
  const map = {
    PAID: ["Đã thanh toán", "success"], ISSUED: ["Đã phát hành vé", "success"], SUCCESS: ["Thành công", "success"],
    PENDING: ["Chờ thanh toán", "pending"], PENDING_PAYMENT: ["Chờ thanh toán", "pending"],
    FAILED: ["Thanh toán thất bại", "danger"], CANCELLED: ["Đã hủy", "muted"], EXPIRED: ["Đã hết hạn", "muted"], REFUNDED: ["Đã hoàn tiền", "info"],
  };
  return map[status] || [String(value || "Chưa cập nhật"), "muted"];
};

export default function BusBookings() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  const hasToken = Boolean(sessionStorage.getItem("access_token"));

  async function loadBookings() {
    setLoading(true); setError("");
    try {
      if (!sessionStorage.getItem("access_token")) {
        navigate("/login", { state: { from: "/bus/bookings" } });
        return;
      }
      const data = await api("/api/bus/bookings?limit=50");
      setItems(Array.isArray(data.items) ? data.items : []);
      setLoaded(true);
    } catch (err) {
      if (err.status === 401) {
        setError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để xem lịch sử vé.");
      } else if (err.status === 403) {
        setError("Tài khoản hiện tại không có quyền xem danh sách đặt vé này.");
      } else {
        setError(err.message || "Không thể tải lịch sử đặt vé. Vui lòng thử lại.");
      }
      setItems([]);
    } finally { setLoading(false); }
  }

  return (
    <main className="tm-bookings-page">
      <header className="tm-bookings-topbar">
        <Link to="/" className="tm-bookings-brand"><span className="tm-bookings-brand-mark">TM</span><span>Travel Mini<small>Mỗi hành trình, dễ dàng hơn</small></span></Link>
        <nav className="tm-bookings-nav" aria-label="Điều hướng đặt chỗ"><Link className="active" to="/bus/bookings">Vé xe khách</Link><Link to="/flight/bookings">Vé máy bay</Link><Link to="/train/bookings">Vé tàu hỏa</Link></nav>
        <Link to="/bus/search" className="tm-bookings-new-search">Tìm chuyến xe <span>→</span></Link>
      </header>

      <section className="tm-bookings-hero tm-bookings-hero-bus">
        <div className="tm-bookings-hero-icon" aria-hidden="true">🚌</div>
        <p className="tm-bookings-eyebrow">CHUYẾN ĐI CỦA BẠN</p>
        <h1>Mọi hành trình xe, trong tầm tay.</h1>
        <p className="tm-bookings-hero-description">Xem lại các chuyến đã đặt, nhà xe, chỗ ngồi và trạng thái booking ngay tại đây.</p>
        <div className="tm-bookings-hero-points"><span>✓ Quản lý booking</span><span>✓ Thông tin ghế ngồi</span><span>✓ Vé điện tử demo</span></div>
      </section>

      <section className="tm-bookings-content">
        <div className="tm-bookings-search-panel tm-bookings-bus-panel">
          <div className="tm-bookings-panel-intro"><span className="tm-bookings-panel-icon">▤</span><div><h2>Lịch sử vé xe khách</h2><p>Danh sách đặt vé gắn với tài khoản đang đăng nhập.</p></div></div>
          {!hasToken && <div className="tm-bookings-alert">Bạn cần đăng nhập để xem lịch sử đặt vé xe khách. <Link to="/login">Đăng nhập ngay →</Link></div>}
          {error && <div className="tm-bookings-alert" role="alert">{error}</div>}
          <div className="tm-bookings-search-row tm-bookings-bus-actions">{!hasToken ? <Link to="/login" className="tm-bookings-primary">Đăng nhập <span>→</span></Link> : <button type="button" className="tm-bookings-primary" onClick={loadBookings} disabled={loading}>{loading ? <><span className="tm-bookings-spinner" /> Đang tải…</> : <>{loaded ? "Làm mới danh sách" : "Xem lịch sử đặt vé"} <span>→</span></>}</button>}<Link to="/bus/search" className="tm-bookings-secondary">Tìm chuyến xe mới</Link></div>
        </div>

        {loaded && !loading && !error && items.length === 0 && <div className="tm-bookings-empty"><span>🚌</span><h2>Chưa có chuyến xe nào</h2><p>Khi bạn đặt vé bằng tài khoản này, các booking sẽ xuất hiện ở đây.</p><Link to="/bus/search" className="tm-bookings-secondary">Tìm chuyến xe</Link></div>}

        {items.length > 0 && <section className="tm-bookings-results"><div className="tm-bookings-results-heading"><div><p className="tm-bookings-eyebrow">LỊCH SỬ CỦA BẠN</p><h2>Vé xe đã đặt</h2></div><span className="tm-bookings-count">{items.length} booking</span></div>
          <div className="tm-bookings-list">{items.map((booking) => {
            const trip = booking.trip || {};
            const [label, tone] = statusInfo(booking.status);
            return <article className="tm-booking-card" key={booking.bookingCode || booking.id}>
              <div className="tm-booking-card-top"><div className="tm-booking-code-wrap"><span className="tm-booking-muted-label">MÃ ĐẶT CHỖ</span><strong className="tm-booking-code">{booking.bookingCode || "—"}</strong></div><span className={`tm-booking-status ${tone}`}><i />{label}</span></div>
              <div className="tm-booking-route tm-booking-route-bus"><div className="tm-booking-station"><strong>{trip.originCode || trip.originStationCode || "Điểm đi"}</strong><span>{trip.originName || trip.origin || trip.pickupName || "Điểm xuất phát"}</span>{trip.departureAt && <small>{new Date(trip.departureAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</small>}</div><div className="tm-booking-route-line"><span>🚌</span><i /></div><div className="tm-booking-station destination"><strong>{trip.destinationCode || trip.destinationStationCode || "Điểm đến"}</strong><span>{trip.destinationName || trip.destination || trip.dropoffName || "Điểm đến"}</span>{trip.arrivalAt && <small>{new Date(trip.arrivalAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</small>}</div></div>
              <div className="tm-booking-card-bottom"><div className="tm-booking-meta"><span><small>Nhà xe</small><b>{booking.provider || trip.provider || "Theo booking"}</b></span><span><small>Chỗ đã chọn</small><b>{Array.isArray(booking.seatIds) && booking.seatIds.length ? booking.seatIds.join(", ") : `${(booking.passengers || []).length} hành khách`}</b></span><span><small>Tổng tiền</small><b className="tm-booking-amount">{money(booking.finalAmount)}</b></span></div><button type="button" className="tm-bookings-primary tm-booking-view-button" onClick={() => navigate(`/bus/bookings/${encodeURIComponent(booking.bookingCode)}`)}>Chi tiết <span>→</span></button></div>
            </article>;
          })}</div>
        </section>}
        {!loaded && !error && <div className="tm-bookings-hint"><span className="tm-bookings-hint-icon">i</span><p><b>Lịch sử riêng tư</b><br />Chỉ hiển thị những booking thuộc tài khoản đã đăng nhập.</p></div>}
      </section>
      <footer className="tm-bookings-footer">© {new Date().getFullYear()} Travel Mini <span>·</span> Lịch xe và giá vé là dữ liệu demo.</footer>
    </main>
  );
}
