import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/bookings.css";

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0,
}).format(Number(value || 0));

const statusInfo = (value) => {
  const status = String(value || "PENDING").toUpperCase();
  const map = {
    PAID: ["Đã thanh toán", "success"],
    ISSUED: ["Đã phát hành vé", "success"],
    SUCCESS: ["Thành công", "success"],
    PENDING: ["Chờ thanh toán", "pending"],
    PENDING_PAYMENT: ["Chờ thanh toán", "pending"],
    FAILED: ["Thanh toán thất bại", "danger"],
    CANCELLED: ["Đã hủy", "muted"],
    EXPIRED: ["Đã hết hạn", "muted"],
    REFUNDED: ["Đã hoàn tiền", "info"],
  };
  return map[status] || [String(value || "Chưa cập nhật"), "muted"];
};

export default function FlightBookings() {
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setItems([]);
    setSearched(false);
    try {
      const response = await fetch(`/api/flights/bookings?email=${encodeURIComponent(email.trim())}`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `Không thể tra cứu vé (HTTP ${response.status}).`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setSearched(true);
    } catch (err) {
      setError(err.message || "Không thể kết nối đến hệ thống. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tm-bookings-page">
      <header className="tm-bookings-topbar">
        <Link to="/" className="tm-bookings-brand"><span className="tm-bookings-brand-mark">TM</span><span>Travel Mini<small>Mỗi hành trình, dễ dàng hơn</small></span></Link>
        <nav className="tm-bookings-nav" aria-label="Điều hướng đặt chỗ">
          <Link to="/bus/bookings">Vé xe khách</Link>
          <Link className="active" to="/flight/bookings">Vé máy bay</Link>
          <Link to="/train/bookings">Vé tàu hỏa</Link>
        </nav>
        <Link to="/flight/search" className="tm-bookings-new-search">Tìm chuyến bay <span>→</span></Link>
      </header>

      <section className="tm-bookings-hero tm-bookings-hero-flight">
        <div className="tm-bookings-hero-icon" aria-hidden="true">✈</div>
        <p className="tm-bookings-eyebrow">CHUYẾN ĐI CỦA BẠN</p>
        <h1>Đặt chỗ, sẵn sàng cất cánh.</h1>
        <p className="tm-bookings-hero-description">Tra cứu lại thông tin đặt vé máy bay và theo dõi trạng thái hành trình trong một nơi.</p>
        <div className="tm-bookings-hero-points"><span>✓ Tra cứu nhanh</span><span>✓ Thông tin booking rõ ràng</span><span>✓ Vé điện tử demo</span></div>
      </section>

      <section className="tm-bookings-content">
        <form className="tm-bookings-search-panel" onSubmit={submit}>
          <div className="tm-bookings-panel-intro"><span className="tm-bookings-panel-icon">⌕</span><div><h2>Tra cứu vé máy bay</h2><p>Nhập email liên hệ đã sử dụng khi đặt vé.</p></div></div>
          <div className="tm-bookings-search-row">
            <label className="tm-bookings-input-group" htmlFor="flight-bookings-email"><span>Email liên hệ</span><input id="flight-bookings-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.com" autoComplete="email" required /></label>
            <button className="tm-bookings-primary" type="submit" disabled={loading}>{loading ? <><span className="tm-bookings-spinner" /> Đang tra cứu…</> : <>Tra cứu booking <span>→</span></>}</button>
          </div>
          {error && <div className="tm-bookings-alert" role="alert">{error}</div>}
        </form>

        {searched && !loading && !error && items.length === 0 && <div className="tm-bookings-empty"><span>🧾</span><h2>Chưa tìm thấy booking</h2><p>Không có vé máy bay gắn với email này. Hãy kiểm tra lại email đã dùng khi đặt vé.</p><Link to="/flight/search" className="tm-bookings-secondary">Tìm chuyến bay mới</Link></div>}

        {items.length > 0 && <section className="tm-bookings-results"><div className="tm-bookings-results-heading"><div><p className="tm-bookings-eyebrow">LỊCH SỬ CỦA BẠN</p><h2>Vé máy bay đã đặt</h2></div><span className="tm-bookings-count">{items.length} booking</span></div>
          <div className="tm-bookings-list">{items.map((booking) => {
            const [label, tone] = statusInfo(booking.paymentStatus || booking.status);
            return <article className="tm-booking-card" key={booking.bookingCode}>
              <div className="tm-booking-card-top"><div className="tm-booking-code-wrap"><span className="tm-booking-muted-label">MÃ ĐẶT CHỖ</span><strong className="tm-booking-code">{booking.bookingCode || "—"}</strong></div><span className={`tm-booking-status ${tone}`}><i />{label}</span></div>
              <div className="tm-booking-route">
                <div className="tm-booking-station"><strong>{booking.originCode || "---"}</strong><span>{booking.originName || "Sân bay đi"}</span>{booking.departureTime && <small>{booking.departureTime}</small>}</div>
                <div className="tm-booking-route-line"><span>✈</span><i /></div>
                <div className="tm-booking-station destination"><strong>{booking.destinationCode || "---"}</strong><span>{booking.destinationName || "Sân bay đến"}</span>{booking.arrivalTime && <small>{booking.arrivalTime}</small>}</div>
              </div>
              <div className="tm-booking-card-bottom"><div className="tm-booking-meta"><span><small>Ngày khởi hành</small><b>{booking.departureDate || "Chưa cập nhật"}</b></span><span><small>Hành khách</small><b>{Number(booking.passengerCount || 0)} người</b></span><span><small>Tổng tiền</small><b className="tm-booking-amount">{money(booking.totalAmount)}</b></span></div><button type="button" className="tm-bookings-primary tm-booking-view-button" onClick={() => navigate(`/flight/ticket/${encodeURIComponent(booking.bookingCode)}`)}>Xem vé <span>→</span></button></div>
            </article>;
          })}</div>
        </section>}

        {!searched && <div className="tm-bookings-hint"><span className="tm-bookings-hint-icon">i</span><p><b>Mẹo nhỏ</b><br />Dùng chính xác email đã nhập tại bước thanh toán để tìm booking.</p></div>}
      </section>
      <footer className="tm-bookings-footer">© {new Date().getFullYear()} Travel Mini <span>·</span> Thông tin chuyến bay sử dụng dữ liệu demo.</footer>
    </main>
  );
}
