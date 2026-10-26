import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../css/flight.css';

const money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));

export default function FlightTicket() {
  const { bookingCode } = useParams();
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch(`/api/flights/bookings/${encodeURIComponent(bookingCode)}`).then(async r => {
      const text = await r.text(); let d;
      try { d = text ? JSON.parse(text) : {}; } catch { throw new Error('Máy chủ trả về dữ liệu không hợp lệ.'); }
      if (!r.ok || !d.success) throw new Error(d.message || 'Không tải được booking.');
      return d.item;
    }).then(d => alive && setBooking(d)).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [bookingCode]);

  if (error) return <main className="flight-page"><div className="flight-empty flight-error">{error}</div></main>;
  if (!booking) return <main className="flight-page"><div className="flight-empty">Đang tải booking…</div></main>;
  const paid = ['PAID_VNPAY', 'PAID_DEMO', 'PAID'].includes(booking.paymentStatus);
  const demo = booking.paymentStatus === 'PAID_DEMO';
  const callbackStatus = searchParams.get('payment') || '';
  const heading = paid ? (demo ? 'Đặt vé thành công (DEMO)' : 'Thanh toán VNPay thành công') : booking.paymentStatus === 'FAILED' ? 'Thanh toán chưa thành công' : 'Đơn đặt vé đang chờ thanh toán';
  const description = paid ? (demo ? 'Vé điện tử mô phỏng, không có giao dịch tiền thật.' : 'VNPay đã xác nhận thanh toán. Vé này thuộc dữ liệu chuyến bay mô phỏng, không dùng để lên máy bay.') : callbackStatus === 'vnpay_invalid_signature' ? 'Không xác minh được chữ ký phản hồi VNPay. Chưa phát hành vé.' : booking.paymentStatus === 'FAILED' ? 'Giao dịch bị từ chối hoặc chưa hoàn tất. Chưa phát hành vé.' : 'Booking đã tạo nhưng chưa có xác nhận thanh toán. Chưa phát hành vé.';
  return <main className="flight-page"><header className="flight-topbar"><Link className="flight-brand" to="/">Travel Mini</Link><nav><Link to="/flight/search">Tìm chuyến bay</Link><Link to="/flight/bookings">Tra cứu vé</Link></nav></header>
    <section className="flight-ticket-card"><div className="flight-ticket-success" style={{ background: paid ? '#ecfdf3' : '#fff7ed', borderColor: paid ? '#86efac' : '#fdba74' }}><span>{paid ? '✓' : '!'}</span><div><h1>{heading}</h1><p>{description}</p></div></div>
      <div className="flight-ticket-code"><small>MÃ ĐẶT CHỖ</small><strong>{booking.bookingCode}</strong><small>{paid ? `Mã vé: ${booking.ticketCode || 'Chưa phát hành'}` : 'Vé chỉ được phát hành sau khi xác nhận thanh toán'}</small></div>
      <div className="flight-ticket-route"><div><small>ĐIỂM ĐI</small><h2>{booking.originCode}</h2><p>{booking.originName}</p><strong>{booking.departureDate} · {booking.departureTime}</strong></div><div className="flight-ticket-plane">✈</div><div><small>ĐIỂM ĐẾN</small><h2>{booking.destinationCode}</h2><p>{booking.destinationName}</p><strong>{booking.arrivalDate} · {booking.arrivalTime}</strong></div></div>
      <div className="flight-ticket-info">
        <div><small>Hãng bay (demo)</small><strong>{booking.airline} · {booking.flightNumber}</strong></div>
        <div><small>Hành khách</small><strong>{(booking.passengers || []).map(p => p.fullName).join(', ')}</strong></div>
        <div><small>Email liên hệ</small><strong>{booking.contactEmail}</strong></div>
        <div><small>Ghế đã chọn</small><strong>{booking.seatNumbers?.length ? booking.seatNumbers.join(', ') : 'Không chọn ghế'}</strong></div>
        <div><small>Tạm tính</small><strong>{money(booking.subtotal ?? booking.totalAmount)}</strong></div>
        {Number(booking.discountAmount || 0) > 0 && <div><small>Mã giảm giá · {booking.couponCode}</small><strong className="flight-ticket-discount">−{money(booking.discountAmount)}</strong></div>}
        <div><small>Tổng tiền</small><strong>{money(booking.totalAmount)}</strong></div>
        <div><small>Phương thức</small><strong>{booking.paymentProvider || 'Chưa chọn'}</strong></div>
        <div><small>Trạng thái thanh toán</small><strong className="flight-status">{booking.paymentStatus}</strong></div>
      </div>
      {paid && <div className="flight-qr-text"><small>Dữ liệu QR vé {demo ? 'demo' : ''}</small><code>{booking.qrPayload || 'Chưa phát hành'}</code></div>}
      <div className="flight-ticket-actions"><button className="flight-secondary" onClick={() => window.print()} disabled={!paid}>In vé</button><Link className="flight-primary inline" to="/flight/search">Tìm chuyến bay khác</Link><Link className="flight-secondary inline" to="/flight/bookings">Tra cứu booking</Link></div>
    </section><p className="flight-footnote">Lịch bay, hãng bay, sơ đồ ghế, giá vé và mã ưu đãi là dữ liệu mô phỏng. Vé không có giá trị đi máy bay.</p>
  </main>;
}

