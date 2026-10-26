import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { busApi, formatDate, formatTime, formatVND, getBusSessionId } from "../config/busApi";
import "../css/bus-booking.css";
import "../css/bus-origin-search.css";

export default function BusCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const holdId = query.get("holdId") || "";
  const tripId = query.get("tripId") || "";

  const [hold, setHold] = useState(null);
  const [trip, setTrip] = useState(null);
  const [seats, setSeats] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [promotionCode, setPromotionCode] = useState("");
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(sessionStorage.getItem("access_token")));
  const formRef = useRef(null);

  const loginUrl = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      if (!holdId || !tripId) {
        setError("Thiếu thông tin giữ chỗ. Hãy quay lại chọn chuyến và giữ chỗ mới.");
        setLoading(false);
        return;
      }
      try {
        const [holdData, tripData, seatData] = await Promise.all([
          busApi(`/api/bus/seat-holds/${encodeURIComponent(holdId)}?sessionId=${encodeURIComponent(getBusSessionId())}`),
          busApi(`/api/bus/trips/${encodeURIComponent(tripId)}`),
          busApi(`/api/bus/trips/${encodeURIComponent(tripId)}/seats`),
        ]);
        if (cancelled) return;
        if (holdData.hold?.tripId !== tripId) throw new Error("Lượt giữ chỗ không khớp chuyến xe.");
        if (!["ACTIVE", "CHECKOUT"].includes(holdData.hold?.status)) throw new Error("Lượt giữ chỗ không còn hiệu lực. Hãy quay lại chọn ghế.");
        setHold(holdData.hold);
        setTrip(tripData.trip);
        setSeats(seatData.items || []);
        const heldSeatIds = holdData.hold.seatIds || [];
        setPassengers(heldSeatIds.map((seatId) => ({ seatId, fullName: "", phone: "", email: "" })));
      } catch (e) {
        if (!cancelled) setError(e.message || "Không tải được thông tin đặt vé.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [holdId, tripId]);

  useEffect(() => {
    if (!hold?.expiresAt) return undefined;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [hold]);

  const seatNames = useMemo(() => new Map(seats.map((seat) => [seat.id, seat.seatNumber])), [seats]);

  function updatePassenger(index, key, value) {
    setPassengers((previous) => previous.map((passenger, i) => i === index ? { ...passenger, [key]: value } : passenger));
  }

  async function submitBooking(event) {
    event.preventDefault();
    setError("");

    const token = sessionStorage.getItem("access_token");
    if (!token) {
      setIsLoggedIn(false);
      setError("Mày cần đăng nhập để tạo đơn và quản lý vé.");
      return;
    }
    if (secondsLeft <= 0) {
      setError("Thời gian giữ chỗ đã hết. Quay lại chọn ghế mới.");
      return;
    }
    if (!passengers.length || passengers.some((p) => !p.fullName.trim() || !p.phone.trim())) {
      setError("Vui lòng nhập họ tên và số điện thoại cho tất cả hành khách.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await busApi("/api/bus/bookings", {
        method: "POST",
        body: JSON.stringify({
          holdId,
          sessionId: getBusSessionId(),
          passengers: passengers.map((p) => ({ ...p, fullName: p.fullName.trim(), phone: p.phone.trim(), email: p.email.trim() })),
          promotionCode: promotionCode.trim(),
        }),
      });
      setBooking(data.booking);
      setError("");
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem("access_token");
        setIsLoggedIn(false);
        setError("Phiên đăng nhập đã hết hạn. Bấm Đăng nhập để tiếp tục; thông tin hành khách vẫn còn trên trang.");
      } else {
        setError(e.message || "Không tạo được đơn đặt vé.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function payVnpay() {
    if (!booking?.bookingCode) return;
    if (secondsLeft <= 0) {
      setError("Lượt giữ chỗ đã hết hạn. Đơn có thể đã hết hiệu lực; hãy kiểm tra trạng thái đơn trước khi đặt lại.");
      return;
    }
    const token = sessionStorage.getItem("access_token");
    if (!token) {
      setIsLoggedIn(false);
      setError("Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await busApi(`/api/bus/bookings/${encodeURIComponent(booking.bookingCode)}/payments`, {
        method: "POST",
        body: JSON.stringify({ provider: "VNPAY" }),
      });
      const paymentUrl = created.payment?.paymentUrl;
      if (!paymentUrl) throw new Error("Backend chưa trả về đường dẫn thanh toán VNPay. Kiểm tra cấu hình sandbox trong backend/.env.");
      window.location.assign(paymentUrl);
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem("access_token");
        setIsLoggedIn(false);
        setError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi kiểm tra trạng thái đơn trước khi thanh toán.");
      } else {
        setError(e.message || "Không thể khởi tạo thanh toán VNPay.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="bus-page">
      <header className="bus-header">
        <Link className="bus-brand" to="/"><span className="bus-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span></Link>
        <nav className="bus-nav"><Link to="/">Trang chủ</Link><Link className="active" to="/bus/search">Tìm vé xe</Link><Link to="/bus/bookings">Đơn của tôi</Link></nav>
        <div className="bus-header-actions"><Link className="bus-button bus-button-outline" to={isLoggedIn ? "/profile" : "/login"}>{isLoggedIn ? "Tài khoản" : "Đăng nhập"}</Link></div>
      </header>

      <main className="bus-checkout-main">
        <Link className="bus-back-link" to={`/bus/trips/${encodeURIComponent(tripId)}/seats`}>← Quay lại sơ đồ ghế</Link>
        <section className="bus-results-heading">
          <div><span className="bus-eyebrow">BƯỚC 3/4</span><h1>Thông tin hành khách</h1><p>Nhập thông tin chính xác cho từng ghế/giường đã chọn.</p></div>
          {hold && secondsLeft > 0 && <div className="bus-countdown compact"><small>Giữ chỗ còn</small><strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>}
        </section>

        {loading && <div className="bus-state-panel"><span className="bus-spinner" /><p>Đang kiểm tra lượt giữ chỗ…</p></div>}
        {error && <div className="bus-alert bus-alert-error" role="alert">{error}{!isLoggedIn && <div className="bus-checkout-login-action"><Link className="bus-button bus-button-primary" to={loginUrl}>Đăng nhập để tiếp tục</Link></div>}</div>}
        {!loading && hold && secondsLeft <= 0 && !booking && <div className="bus-alert bus-alert-error">Thời gian giữ chỗ đã hết. <Link to={`/bus/trips/${encodeURIComponent(tripId)}/seats`}>Quay lại chọn ghế mới</Link>.</div>}

        {!loading && trip && hold && (
          <div className="bus-checkout-grid">
            <form ref={formRef} className="bus-checkout-form" onSubmit={submitBooking}>
              {!isLoggedIn && <div className="bus-login-notice"><b>Đăng nhập trước khi đặt vé</b><p>Đơn và vé sẽ được gắn với tài khoản của mày để xem lại trong lịch sử.</p><Link className="bus-button bus-button-primary" to={loginUrl}>Đăng nhập để tiếp tục</Link></div>}

              {passengers.map((passenger, index) => (
                <section className="bus-passenger-panel" key={passenger.seatId}>
                  <div className="bus-passenger-title"><span>{String(index + 1).padStart(2, "0")}</span><div><h2>Hành khách {index + 1}</h2><p>Chỗ: <b>{seatNames.get(passenger.seatId) || passenger.seatId}</b></p></div></div>
                  <div className="bus-form-grid">
                    <label>Họ và tên<input required minLength={2} maxLength={120} value={passenger.fullName} onChange={(e) => updatePassenger(index, "fullName", e.target.value)} placeholder="Nhập họ tên" /></label>
                    <label>Số điện thoại<input required minLength={8} maxLength={30} value={passenger.phone} onChange={(e) => updatePassenger(index, "phone", e.target.value)} placeholder="Ví dụ: 09xxxxxxxx" /></label>
                    <label>Email (không bắt buộc)<input type="email" maxLength={120} value={passenger.email} onChange={(e) => updatePassenger(index, "email", e.target.value)} placeholder="ten@example.com" /></label>
                  </div>
                </section>
              ))}

              <section className="bus-passenger-panel"><h2>Mã giảm giá</h2><p className="bus-muted">Nhập mã nếu có. Hệ thống sẽ xác minh khi tạo đơn.</p><div className="bus-promo-row"><input value={promotionCode} onChange={(e) => setPromotionCode(e.target.value.toUpperCase())} placeholder="Ví dụ: TM10BUS" maxLength={40} disabled={Boolean(booking)} /><span>Đơn demo có thể dùng TM10BUS</span></div></section>

              {!booking && <div className="bus-checkout-actions"><button className="bus-button bus-button-primary bus-full-button bus-checkout-submit" type="button" disabled={submitting || loading || secondsLeft <= 0} onClick={(event) => { event.preventDefault(); if (!formRef.current?.reportValidity()) return; void submitBooking(event); }}>{submitting ? "Đang tạo đơn…" : "Xác nhận thông tin và tạo đơn"}</button><small>Kiểm tra thông tin hành khách trước khi tạo đơn. Chỗ chỉ được giữ trong 10 phút.</small></div>}

              {booking && <section className="bus-payment-panel"><div className="bus-success-icon">✓</div><h2>Đã tạo đơn {booking.bookingCode}</h2><p>Đơn đang ở trạng thái {booking.status || "chờ thanh toán"}. Nhấn nút bên dưới để chuyển sang VNPay Sandbox; các phương thức như VNPAY-QR sẽ phụ thuộc cổng thanh toán.</p><div className="bus-payment-amount">Tổng thanh toán <strong>{formatVND(booking.finalAmount)}</strong></div><button className="bus-button bus-button-primary bus-full-button bus-checkout-submit" type="button" disabled={submitting || secondsLeft <= 0} onClick={payVnpay}>{submitting ? "Đang kết nối VNPay…" : "Thanh toán qua VNPay"}</button><small>Đây là môi trường sandbox. Chưa có giao dịch tiền thật.</small></section>}
            </form>

            <aside className="bus-order-summary"><span className="bus-eyebrow">TÓM TẮT CHUYẾN</span>{trip && <><h2>{trip.provider}</h2><p>{trip.originCity} → {trip.destinationCity}</p><div className="bus-summary-route"><div><small>Khởi hành</small><b>{formatTime(trip.departureAt)}</b><span>{trip.originName}</span><small>{formatDate(trip.departureAt)}</small></div><div><small>Đến nơi</small><b>{formatTime(trip.arrivalAt)}</b><span>{trip.destinationName}</span></div></div><div className="bus-summary-line-items"><div><span>Giá vé × số chỗ</span><b>{formatVND(Number(trip.price || 0) * passengers.length)}</b></div>{booking && <div><span>Giảm giá</span><b>− {formatVND(booking.discountAmount)}</b></div>}</div><div className="bus-order-total"><span>Tổng thanh toán</span><strong>{formatVND(booking?.finalAmount ?? Number(trip.price || 0) * passengers.length)}</strong></div><div className="bus-summary-seats"><b>Chỗ đã giữ</b><div>{(hold.seatIds || []).map((id) => <span key={id}>{seatNames.get(id) || id}</span>)}</div></div></>}</aside>
          </div>
        )}
      </main>
      <footer className="bus-footer">© {new Date().getFullYear()} Travel Mini · Hoàn tất trước khi lượt giữ chỗ hết hạn.</footer>
    </div>
  );
}
