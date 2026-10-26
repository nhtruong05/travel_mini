import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, formatDate, formatTime, formatVND } from "../../api";
import "../../css/bus-booking.css";
import { QRCodeSVG } from "qrcode.react";

const STATUS = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
  CANCELLATION_REQUESTED: "Đang xét yêu cầu hủy",
  CANCELLED_REFUND_PENDING: "Chờ hoàn tiền",
  PAYMENT_REVIEW: "Đang đối soát thanh toán",
};

const PAYMENT_MESSAGES = {
  vnpay_success: { type: "success", text: "VNPay đã xác nhận thanh toán. Kiểm tra thông tin vé điện tử bên dưới." },
  vnpay_failed: { type: "error", text: "Giao dịch VNPay chưa thành công. Nếu lượt giữ chỗ còn hạn, mày có thể thử thanh toán lại." },
  vnpay_review_refund: { type: "error", text: "VNPay báo đã thanh toán nhưng ghế không còn được xác nhận. Đơn được chuyển sang đối soát/hoàn tiền; vui lòng liên hệ hỗ trợ." },
  vnpay_invalid_amount: { type: "error", text: "Số tiền trả về từ VNPay không khớp đơn hàng. Đơn chưa được xác nhận; liên hệ hỗ trợ." },
  vnpay_invalid_signature: { type: "error", text: "Không xác minh được chữ ký trả về từ VNPay. Đơn chưa được xác nhận." },
  vnpay_order_not_found: { type: "error", text: "Không tìm được giao dịch VNPay tương ứng. Vui lòng liên hệ hỗ trợ." },
  vnpay_processing: { type: "info", text: "Giao dịch đang được đối soát. Hãy tải lại trang sau ít phút để kiểm tra trạng thái." },
};

export default function BusTicket() {
  const { bookingCode } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [messageDismissed, setMessageDismissed] = useState(false);

  const paymentResult = new URLSearchParams(location.search).get("payment");
  const paymentMessage = paymentResult ? PAYMENT_MESSAGES[paymentResult] : null;

  async function loadBooking(cancelledCheck = () => false) {
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/bus/bookings/${encodeURIComponent(bookingCode)}`);
      if (!cancelledCheck()) setBooking(data.booking);
    } catch (e) {
      if (!cancelledCheck()) setError(e.message || "Không tải được đơn đặt vé.");
    } finally {
      if (!cancelledCheck()) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadBooking(() => cancelled);
    return () => { cancelled = true; };
    // loadBooking intentionally depends only on the booking code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingCode]);

  async function retryVnpayPayment() {
    setRetryingPayment(true);
    setPaymentError("");
    try {
      const data = await api(`/api/bus/bookings/${encodeURIComponent(bookingCode)}/payments`, {
        method: "POST",
        body: JSON.stringify({ provider: "VNPAY" }),
      });
      if (!data.payment?.paymentUrl) throw new Error("Backend chưa trả về đường dẫn thanh toán VNPay.");
      window.location.assign(data.payment.paymentUrl);
    } catch (e) {
      setPaymentError(e.message || "Không thể khởi tạo lại thanh toán VNPay.");
      setRetryingPayment(false);
    }
  }

  return <div className="bus-page">
    <header className="bus-header">
      <Link className="bus-brand" to="/">
        <span className="bus-brand-mark">TM</span>
        <span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span>
      </Link>
      <nav className="bus-nav">
        <Link to="/">Trang chủ</Link>
        <Link to="/bus/search"></Link>
        <Link to="/bus/bookings">Đơn của tôi</Link>
      </nav>
      <div className="bus-header-actions">
        <Link className="bus-button bus-button-outline" to="/bus/bookings">Lịch sử đặt vé</Link>
      </div>
    </header>

    <main className="bus-ticket-main">
      <Link className="bus-back-link" to="/bus/bookings">← Quay lại lịch sử đặt vé</Link>
      {!messageDismissed && paymentMessage && (
        <div className={`bus-alert bus-alert-${paymentMessage.type}`} role="status">
          {paymentMessage.text}
          <button type="button" onClick={() => setMessageDismissed(true)} aria-label="Đóng thông báo">×</button>
        </div>
      )}
      {loading && <div className="bus-state-panel"><span className="bus-spinner"/><p>Đang tải thông tin vé…</p></div>}
      {error && <div className="bus-alert bus-alert-error">{error}</div>}
      {paymentError && <div className="bus-alert bus-alert-error">{paymentError}</div>}

      {booking && <>
        <section className="bus-ticket-heading">
          <div>
            <span className="bus-eyebrow">CHI TIẾT ĐƠN ĐẶT VÉ</span>
            <h1>{booking.bookingCode}</h1>
            <p>{STATUS[booking.status] || booking.status}</p>
          </div>
          <span className={`bus-status-pill status-${String(booking.status).toLowerCase()}`}>
            {STATUS[booking.status] || booking.status}
          </span>
        </section>

        <section className="bus-ticket-route-card">
          <div className="bus-ticket-provider">
            <div className="bus-provider-avatar">TM</div>
            <div><b>{booking.provider}</b><small>{booking.trip?.vehicleType}</small></div>
          </div>
          <div className="bus-ticket-route">
            <div>
              <small>Điểm khởi hành</small>
              <strong>{formatTime(booking.trip?.departureAt)}</strong>
              <b>{booking.trip?.originName}</b>
              <span>{booking.trip?.originCity}</span>
              <small>{formatDate(booking.trip?.departureAt)}</small>
            </div>
            <div className="bus-route-arrow">→</div>
            <div>
              <small>Điểm trả</small>
              <strong>{formatTime(booking.trip?.arrivalAt)}</strong>
              <b>{booking.trip?.destinationName}</b>
              <span>{booking.trip?.destinationCity}</span>
            </div>
          </div>
          <div className="bus-order-total">
            <span>Tổng thanh toán</span>
            <strong>{formatVND(booking.finalAmount)}</strong>
          </div>
        </section>

        {booking.status === "PAID" || booking.status === "COMPLETED" ? (
          <section className="bus-e-tickets-section">
            <div>
              <span className="bus-eyebrow">VÉ ĐIỆN TỬ</span>
              <h2>{booking.tickets?.length || 0} vé đã phát hành</h2>
              <p>QR ở đây là mã xác minh vé khi lên xe; nó khác QR thanh toán của VNPay.</p>
            </div>
            {(booking.tickets || []).map((ticket) => (
              <article className="bus-e-ticket" key={ticket.ticketCode}>
                <div className="bus-e-ticket-top">
                  <span>TRAVEL MINI · BUS TICKET</span>
                  <span className="bus-status-pill status-paid">ĐÃ PHÁT HÀNH</span>
                </div>
                <div className="bus-e-ticket-main">
                  <div>
                    <small>HÀNH KHÁCH</small><b>{ticket.passenger?.fullName}</b>
                    <small>SỐ ĐIỆN THOẠI</small><span>{ticket.passenger?.phone}</span>
                  </div>
                  <div>
                    <small>MÃ VÉ</small><strong>{ticket.ticketCode}</strong>
                    <small>GHẾ / GIƯỜNG</small><b>{ticket.seatNumber || ticket.passenger?.seatNumber || "—"}</b>
                  </div>
                  <div className="bus-qr-placeholder bus-qr-real">
                    {ticket.qrDataUrl
                      ? <img src={ticket.qrDataUrl} alt={`QR vé ${ticket.ticketCode}`} />
                      : <QRCodeSVG value={ticket.qrPayload || ticket.ticketCode} size={104} level="M" marginSize={1} />}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="bus-alert bus-alert-info">
            Đơn chưa phát hành vé điện tử. Trạng thái hiện tại: {STATUS[booking.status] || booking.status}.
            {booking.status === "PENDING_PAYMENT" && (
              <button className="bus-button bus-button-primary" type="button" disabled={retryingPayment} onClick={retryVnpayPayment}>
                {retryingPayment ? "Đang kết nối VNPay…" : "Thanh toán lại qua VNPay"}
              </button>
            )}
          </div>
        )}

        <section className="bus-passenger-list-card">
          <h2>Thông tin hành khách</h2>
          {(booking.passengers || []).map((passenger, index) => (
            <div className="bus-passenger-row" key={`${passenger.seatId}-${index}`}>
              <span>{index + 1}</span>
              <div><b>{passenger.fullName}</b><small>{passenger.phone}</small></div>
              <strong>{passenger.seatNumber || "—"}</strong>
            </div>
          ))}
        </section>
      </>}
    </main>
    <footer className="bus-footer">© {new Date().getFullYear()} Travel Mini</footer>
  </div>;
}
