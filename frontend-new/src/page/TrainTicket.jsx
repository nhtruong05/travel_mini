import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import '../css/train.css';

const money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));

export default function TrainTicket() {
  const { bookingCode } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch('/api/trains/bookings/' + encodeURIComponent(bookingCode)).then(async response => {
      const text = await response.text(); let data;
      try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Máy chủ trả về dữ liệu không hợp lệ.'); }
      if (!response.ok || !data.success) throw new Error(data.message || 'Không tải được booking.');
      return data.item;
    }).then(data => alive && setBooking(data)).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [bookingCode]);

  if (error) return <main className="rail-wrap rail-ticket-page"><div className="rail-card rail-error">{error}</div></main>;
  if (!booking) return <main className="rail-wrap rail-ticket-page"><div className="rail-card rail-loading">Đang tải vé tàu…</div></main>;
  const paid = ['PAID', 'PAID_DEMO'].includes(booking.paymentStatus);
  const demo = booking.paymentStatus === 'PAID_DEMO';
  const callback = new URLSearchParams(location.search).get('payment');
  return <main className="rail-wrap rail-ticket-page">
    <header className="rail-checkout-topbar"><Link to="/" className="rail-brand">Travel Mini</Link><nav><Link to="/train/search">Tìm tàu</Link><Link to="/train/bookings">Tra cứu vé</Link></nav></header>
    <section className="rail-ticket-card">
      <div className={`rail-ticket-status ${paid ? 'is-paid' : 'is-pending'}`}><span>{paid ? '✓' : '!'}</span><div><h1>{paid ? (demo ? 'Đặt vé thành công (DEMO)' : 'Thanh toán thành công') : booking.paymentStatus === 'FAILED' || callback === 'failed' ? 'Thanh toán chưa thành công' : 'Booking đang chờ thanh toán'}</h1><p>{paid ? (demo ? 'Vé điện tử mô phỏng, không có giá trị lên tàu.' : 'Trạng thái thanh toán đã được xác nhận.') : 'Vé chỉ được xác nhận sau khi có trạng thái thanh toán hợp lệ.'}</p></div></div>
      <div className="rail-ticket-code"><small>MÃ ĐẶT CHỖ</small><strong>{booking.bookingCode}</strong>{booking.ticketCode && <span>Mã vé: {booking.ticketCode}</span>}</div>
      <div className="rail-ticket-route"><div><small>GA ĐI</small><h2>{booking.originCode}</h2><p>{booking.originName}</p><strong>{booking.departureDate} · {booking.departureTime}</strong></div><span>🚆</span><div><small>GA ĐẾN</small><h2>{booking.destinationCode}</h2><p>{booking.destinationName}</p><strong>{booking.arrivalDate} · {booking.arrivalTime}</strong></div></div>
      <div className="rail-ticket-info">
        <div><small>Loại tàu</small><strong>{booking.trainTypeLabel} · {booking.serviceNumber}</strong></div>
        <div><small>Hạng chỗ</small><strong>{booking.seatClassLabel || booking.seatClass}</strong></div>
        <div><small>Hành khách</small><strong>{(booking.passengers || []).map(p => p.fullName).join(', ')}</strong></div>
        <div><small>Email liên hệ</small><strong>{booking.contactEmail}</strong></div>
        <div><small>Tạm tính</small><strong>{money(booking.subtotal ?? booking.totalAmount)}</strong></div>
        {Number(booking.discountAmount || 0) > 0 && <div><small>Mã giảm giá · {booking.couponCode}</small><strong className="rail-ticket-discount">−{money(booking.discountAmount)}</strong></div>}
        <div><small>Tổng thanh toán</small><strong className="rail-ticket-total">{money(booking.totalAmount)}</strong></div>
        <div><small>Trạng thái thanh toán</small><strong className={paid ? 'rail-paid-text' : 'rail-pending-text'}>{booking.paymentStatus}</strong></div>
      </div>
      {booking.qrPayload && <div className="rail-ticket-qr"><small>Dữ liệu QR vé demo</small><code>{booking.qrPayload}</code></div>}
      <div className="rail-ticket-actions"><button className="rail-btn" onClick={() => window.print()} disabled={!paid}>In vé</button><Link className="rail-btn alt" to="/train/search">Tìm chuyến khác</Link><Link className="rail-btn alt" to="/train/bookings">Tra cứu booking</Link></div>
    </section>
    <p className="rail-ticket-disclaimer">Lịch tàu, giá vé và mã vé trong module là dữ liệu demo, không có giá trị sử dụng cho chuyến tàu thật.</p>
  </main>;
}

