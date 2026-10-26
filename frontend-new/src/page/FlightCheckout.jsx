import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../css/flight.css';

const money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));
const FLIGHT_COUPONS = {
  TMWELCOME75: { kind: 'fixed', amount: 75000, minimum: 500000, label: 'Giảm 75.000đ cho đơn từ 500.000đ' },
  TMFLIGHT10: { kind: 'percent', rate: 0.10, maximum: 200000, minimum: 500000, label: 'Giảm 10% vé máy bay, tối đa 200.000đ' },
};

function parseApiResponse(response) {
  return response.text().then(text => {
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`Máy chủ trả về phản hồi không phải JSON (HTTP ${response.status}). Kiểm tra API Flask và Vite proxy.`); }
    if (!response.ok || data.success === false) throw new Error(data.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
    return data;
  });
}

function calcDiscount(code, subtotal) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return { ok: false, message: 'Nhập mã giảm giá trước khi áp dụng.' };
  const coupon = FLIGHT_COUPONS[key];
  if (!coupon) return { ok: false, message: 'Mã giảm giá không hợp lệ cho vé máy bay.' };
  if (subtotal < coupon.minimum) return { ok: false, message: `Đơn hàng cần tối thiểu ${money(coupon.minimum)} để dùng mã này.` };
  const amount = coupon.kind === 'fixed' ? coupon.amount : Math.min(Math.floor(subtotal * coupon.rate), coupon.maximum);
  return { ok: true, code: key, amount: Math.min(subtotal, amount), message: `Đã áp dụng ${key}: ${coupon.label}.` };
}

export default function FlightCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const flightCode = query.get('flightCode') || '';
  const count = Math.max(1, Math.min(9, Number(query.get('passengers') || 1)));
  const [flight, setFlight] = useState(null);
  const [seatItems, setSeatItems] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [passengers, setPassengers] = useState(Array.from({ length: count }, () => ({ fullName: '', documentNumber: '' })));
  const [contact, setContact] = useState({ contactName: '', contactEmail: '', contactPhone: '' });
  const [paymentMethod, setPaymentMethod] = useState('VNPAY');
  const [pendingBookingCode, setPendingBookingCode] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponError, setCouponError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const subtotal = useMemo(() => Number(flight?.basePrice || 0) * count, [flight, count]);
  const discount = coupon ? Math.min(subtotal, coupon.amount) : 0;
  const total = Math.max(0, subtotal - discount);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/flights/trips/${encodeURIComponent(flightCode)}`).then(parseApiResponse),
      fetch(`/api/flights/trips/${encodeURIComponent(flightCode)}/seats`).then(parseApiResponse),
    ])
      .then(([flightData, seatData]) => {
        if (!alive) return;
        setFlight(flightData.item);
        setSeatItems(seatData.items || []);
      })
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [flightCode]);

  const updatePassenger = (idx, key, value) => setPassengers(prev => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  const toggleSeat = (seat) => {
    if (!seat.available) return;
    setSelectedSeats(prev => prev.includes(seat.seatNumber)
      ? prev.filter(s => s !== seat.seatNumber)
      : prev.length >= count ? prev : [...prev, seat.seatNumber]);
  };
  const applyCoupon = () => {
    const result = calcDiscount(couponInput, subtotal);
    setCouponError(!result.ok);
    setCouponMessage(result.message);
    if (result.ok) setCoupon({ code: result.code, amount: result.amount });
    else setCoupon(null);
  };
  const removeCoupon = () => { setCoupon(null); setCouponInput(''); setCouponMessage('Đã bỏ mã giảm giá.'); setCouponError(false); };

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (couponInput.trim() && !coupon) {
      setError('Mã giảm giá đã nhập nhưng chưa được áp dụng. Hãy nhấn Áp dụng hoặc xóa mã.');
      return;
    }
    if (selectedSeats.length !== count) {
      setError(`Vui lòng chọn đủ ${count} ghế cho ${count} hành khách.`);
      return;
    }
    setSubmitting(true);
    try {
      let bookingCode = pendingBookingCode;
      if (!bookingCode) {
        const res = await fetch('/api/flights/bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightCode, passengerCount: count, passengers, seatNumbers: selectedSeats, couponCode: coupon?.code || '', ...contact }),
        });
        const data = await parseApiResponse(res);
        bookingCode = data.item.bookingCode;
        setPendingBookingCode(bookingCode);
      }

      if (paymentMethod === 'VNPAY') {
        const payRes = await fetch(`/api/flights/bookings/${encodeURIComponent(bookingCode)}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'VNPAY' }),
        });
        const payData = await parseApiResponse(payRes);
        const paymentUrl = payData.payment?.paymentUrl || payData.paymentUrl || payData.redirectUrl;
        if (!paymentUrl) throw new Error(payData.message || `Booking ${bookingCode} đã tạo nhưng phản hồi không có URL thanh toán.`);
        window.location.assign(paymentUrl);
        return;
      }

      const payRes = await fetch(`/api/flights/bookings/${encodeURIComponent(bookingCode)}/demo-payment`, { method: 'POST' });
      const paid = await parseApiResponse(payRes);
      if (!paid.success) throw new Error(paid.message || 'Thanh toán mô phỏng chưa hoàn tất.');
      navigate(`/flight/ticket/${encodeURIComponent(bookingCode)}`);
    } catch (e2) { setError(e2.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <main className="flight-page"><div className="flight-empty">Đang tải thông tin chuyến bay và sơ đồ ghế…</div></main>;
  if (!flight) return <main className="flight-page"><div className="flight-empty flight-error">{error || 'Không tìm thấy chuyến bay.'}<p><Link to="/flight/search">Quay lại tìm kiếm</Link></p></div></main>;
  const seatsByRow = [];
  for (let row = 1; row <= 16; row += 1) seatsByRow.push(seatItems.filter(s => s.row === row));

  return <main className="flight-page">
    <header className="flight-topbar"><Link to="/" className="flight-brand">Travel Mini</Link><nav><Link to="/flight/search">Tìm chuyến bay</Link><Link to="/flight/bookings">Tra cứu vé</Link></nav></header>
    <Link to="/flight/search" className="flight-back">← Quay lại tìm chuyến</Link>
    <div className="flight-checkout-layout flight-checkout-enhanced">
      <section className="flight-panel">
        <div className="flight-step-label">BƯỚC 2/3 · CHỌN GHẾ VÀ THÔNG TIN</div>
        <h1>Chọn ghế & thông tin hành khách</h1>
        <p className="flight-subtitle">Chọn đúng {count} ghế, sau đó nhập tên hành khách như trên giấy tờ bay. Đây là sơ đồ ghế mô phỏng.</p>
        <form onSubmit={submit}>
          <section className="flight-seat-section">
            <div className="flight-seat-heading"><div><h2>Sơ đồ ghế máy bay</h2><p>Đầu máy bay ở phía trên · lối đi nằm giữa C và D</p></div><span className="flight-seat-count">{selectedSeats.length}/{count} ghế đã chọn</span></div>
            <div className="flight-seat-legend"><span><i className="seat-legend available"/> Còn trống</span><span><i className="seat-legend selected"/> Đang chọn</span><span><i className="seat-legend taken"/> Đã có người</span></div>
            <div className="flight-plane-map">
              <div className="flight-plane-nose"><span>✈</span><strong>PHÍA TRƯỚC MÁY BAY</strong></div>
              <div className="flight-seat-column-labels"><span>A</span><span>B</span><span>C</span><b> </b><span>D</span><span>E</span><span>F</span></div>
              <div className="flight-seat-rows">
                {seatsByRow.map((rowSeats, rowIndex) => <div className="flight-seat-row" key={rowIndex}>
                  <small className="flight-row-number">{rowIndex + 1}</small>
                  {rowSeats.slice(0, 3).map(seat => <button type="button" key={seat.seatNumber} disabled={!seat.available} aria-label={`Ghế ${seat.seatNumber}${seat.available ? '' : ' đã có người'}`} title={`Ghế ${seat.seatNumber}`} className={`flight-seat ${selectedSeats.includes(seat.seatNumber) ? 'is-selected' : ''} ${!seat.available ? 'is-taken' : ''}`} onClick={() => toggleSeat(seat)}>{seat.seatNumber}</button>)}
                  <span className="flight-seat-aisle" aria-hidden="true"/>
                  {rowSeats.slice(3, 6).map(seat => <button type="button" key={seat.seatNumber} disabled={!seat.available} aria-label={`Ghế ${seat.seatNumber}${seat.available ? '' : ' đã có người'}`} title={`Ghế ${seat.seatNumber}`} className={`flight-seat ${selectedSeats.includes(seat.seatNumber) ? 'is-selected' : ''} ${!seat.available ? 'is-taken' : ''}`} onClick={() => toggleSeat(seat)}>{seat.seatNumber}</button>)}
                </div>)}
              </div>
            </div>
            <div className="flight-selected-seats"><strong>Ghế của hành khách:</strong> {selectedSeats.length ? selectedSeats.join(', ') : 'Chưa chọn ghế'}</div>
          </section>

          <h2>Thông tin hành khách</h2>
          {passengers.map((p, i) => <fieldset className="flight-passenger" key={i}><legend>Hành khách {i + 1}{selectedSeats[i] ? ` · Ghế ${selectedSeats[i]}` : ''}</legend><label className="flight-field"><span>Họ và tên</span><input required value={p.fullName} onChange={e => updatePassenger(i, 'fullName', e.target.value)} placeholder="Ví dụ: NGUYEN VAN A" autoComplete="name" /></label><label className="flight-field"><span>Số giấy tờ (tuỳ chọn trong bản demo)</span><input value={p.documentNumber} onChange={e => updatePassenger(i, 'documentNumber', e.target.value)} placeholder="CCCD hoặc hộ chiếu" /></label></fieldset>)}
          <h2>Thông tin liên hệ</h2>
          <div className="flight-contact-grid">
            <label className="flight-field"><span>Họ tên người liên hệ</span><input required value={contact.contactName} onChange={e => setContact({ ...contact, contactName: e.target.value })} autoComplete="name" /></label>
            <label className="flight-field"><span>Email</span><input type="email" required value={contact.contactEmail} onChange={e => setContact({ ...contact, contactEmail: e.target.value })} autoComplete="email" /></label>
            <label className="flight-field"><span>Số điện thoại</span><input required value={contact.contactPhone} onChange={e => setContact({ ...contact, contactPhone: e.target.value })} autoComplete="tel" /></label>
          </div>

          <section className="flight-coupon-card">
            <div className="flight-coupon-title"><span className="flight-coupon-icon">%</span><div><h2>Mã giảm giá</h2><p>Nhập mã ưu đãi cho vé máy bay của bạn.</p></div></div>
            <div className="flight-coupon-input-row"><input aria-label="Mã giảm giá vé máy bay" placeholder="Ví dụ: TMWELCOME75" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} disabled={Boolean(coupon)} /><button type="button" className="flight-secondary" onClick={coupon ? removeCoupon : applyCoupon}>{coupon ? 'Bỏ mã' : 'Áp dụng'}</button></div>
            <div className={`flight-coupon-message ${couponError ? 'is-error' : coupon ? 'is-success' : ''}`} role="status">{couponMessage || 'Mã dùng thử: TMWELCOME75 (giảm 75.000đ) · TMFLIGHT10 (giảm 10%, tối đa 200.000đ).'}</div>
          </section>

          <h2>Phương thức thanh toán</h2>
          <label className="flight-payment-option"><input type="radio" name="flightPayment" value="VNPAY" checked={paymentMethod === 'VNPAY'} onChange={() => setPaymentMethod('VNPAY')} /><span><strong>VNPay Sandbox</strong><small>Chuyển sang cổng VNPay để thanh toán thử nghiệm.</small></span></label>
          <label className="flight-payment-option"><input type="radio" name="flightPayment" value="DEMO" checked={paymentMethod === 'DEMO'} onChange={() => setPaymentMethod('DEMO')} /><span><strong>Thanh toán mô phỏng</strong><small>Chỉ dùng kiểm thử đồ án, không chuyển tiền thật.</small></span></label>
          {paymentMethod === 'VNPAY' && <div className="flight-demo-notice"><strong>Lưu ý:</strong> VNPay chỉ hoàn tất giao dịch khi Merchant và website được phê duyệt trong Sandbox.</div>}
          {error && <p className="flight-error" role="alert">{error}</p>}
          <button className="flight-primary" type="submit" disabled={submitting || selectedSeats.length !== count}>{submitting ? 'Đang xử lý…' : paymentMethod === 'VNPAY' ? 'Đặt chỗ & thanh toán VNPay' : 'Xác nhận & thanh toán demo'}</button>
          {pendingBookingCode && <p className="flight-tiny">Mã đặt chỗ đang chờ thanh toán: <strong>{pendingBookingCode}</strong>. Khi thử lại, hệ thống dùng booking này, không tạo booking mới.</p>}
        </form>
      </section>
      <aside className="flight-panel flight-summary flight-summary-enhanced">
        <span className="flight-summary-eyebrow">TÓM TẮT HÀNH TRÌNH</span><h2>{flight.airline}</h2><span className="flight-summary-airline">{flight.flightNumber} · Dữ liệu demo</span>
        <div className="flight-summary-route"><div><strong>{flight.departureTime}</strong><b>{flight.originCode}</b><small>{flight.departureDate}</small></div><span>→</span><div><strong>{flight.arrivalTime}</strong><b>{flight.destinationCode}</b><small>{flight.arrivalDate}</small></div></div>
        <div className="flight-summary-seatline"><span>Ghế đã chọn</span><strong>{selectedSeats.length ? selectedSeats.join(', ') : 'Chưa chọn'}</strong></div>
        <div className="flight-price-breakdown"><div><span>{count} hành khách</span><strong>{money(subtotal)}</strong></div>{coupon && <div className="flight-discount-line"><span>Mã {coupon.code}</span><strong>−{money(discount)}</strong></div>}<div className="flight-grand-total"><span>Tổng thanh toán</span><strong>{money(total)}</strong></div></div>
        <p className="flight-tiny">Chuyến bay, sơ đồ ghế và giá tiền đều là dữ liệu mô phỏng. Vé không có giá trị lên máy bay.</p>
      </aside>
    </div>
    <p className="flight-footnote">Sơ đồ ghế và ưu đãi là chức năng demo của Travel Mini.</p>
  </main>;
}

