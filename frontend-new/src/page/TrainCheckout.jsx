import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../css/train.css';

const money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));
const TRAIN_COUPONS = {
  TMWELCOME75: { kind: 'fixed', amount: 75000, minimum: 500000, label: 'Giảm 75.000đ cho đơn từ 500.000đ' },
  TMTRAIN50: { kind: 'fixed', amount: 50000, minimum: 200000, label: 'Giảm 50.000đ vé tàu cho đơn từ 200.000đ' },
};
const STANDARD_CLASSES = [
  { value: 'hard_seat', label: 'Ghế ngồi cứng', multiplier: 0.65, note: 'Tiết kiệm' },
  { value: 'soft_seat', label: 'Ghế ngồi mềm', multiplier: 1, note: 'Phổ biến' },
  { value: 'sleeper_6', label: 'Giường nằm khoang 6', multiplier: 1.45, note: 'Nghỉ ngơi thoải mái' },
  { value: 'sleeper_4', label: 'Giường nằm khoang 4', multiplier: 1.85, note: 'Không gian riêng tư' },
];
const HIGH_SPEED_CLASSES = [
  { value: 'hs_standard', label: 'Ghế tiêu chuẩn', multiplier: 1, note: 'Thoải mái cho chặng ngắn' },
  { value: 'hs_business', label: 'Ghế thương gia', multiplier: 1.8, note: 'Không gian rộng hơn' },
];

function parseApiResponse(response) {
  return response.text().then(text => {
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`Máy chủ trả về phản hồi không phải JSON (HTTP ${response.status}). Kiểm tra Flask và Vite proxy.`); }
    if (!response.ok || data.success === false) throw new Error(data.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
    return data;
  });
}
function calculateDiscount(code, subtotal) {
  const key = String(code || '').trim().toUpperCase();
  const item = TRAIN_COUPONS[key];
  if (!key) return { ok: false, message: 'Nhập mã giảm giá trước khi áp dụng.' };
  if (!item) return { ok: false, message: 'Mã giảm giá không hợp lệ cho vé tàu hỏa.' };
  if (subtotal < item.minimum) return { ok: false, message: `Đơn hàng cần tối thiểu ${money(item.minimum)} để dùng mã này.` };
  return { ok: true, code: key, amount: Math.min(subtotal, item.amount), message: `Đã áp dụng ${key}: ${item.label}.` };
}

export default function TrainCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const code = query.get('trainCode') || '';
  const count = Math.max(1, Math.min(8, Number(query.get('passengers') || 1)));
  const [trip, setTrip] = useState(null);
  const [method, setMethod] = useState('demo');
  const [pendingBookingCode, setPendingBookingCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [people, setPeople] = useState(Array.from({ length: count }, () => ({ fullName: '', documentNumber: '' })));
  const [seatClass, setSeatClass] = useState('soft_seat');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponError, setCouponError] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const classOptions = trip?.trainType === 'HIGH_SPEED_DEMO' ? HIGH_SPEED_CLASSES : STANDARD_CLASSES;
  const selectedClass = classOptions.find(item => item.value === seatClass) || classOptions[0];
  const unitPrice = Math.round(Number(trip?.basePrice || 0) * selectedClass.multiplier);
  const subtotal = unitPrice * count;
  const discount = coupon ? Math.min(subtotal, coupon.amount) : 0;
  const total = Math.max(0, subtotal - discount);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/trains/trips/' + encodeURIComponent(code))
      .then(parseApiResponse)
      .then(data => {
        if (!alive) return;
        setTrip(data.item);
        setSeatClass(data.item?.trainType === 'HIGH_SPEED_DEMO' ? 'hs_standard' : 'soft_seat');
      })
      .catch(e => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    // If the customer changes seat class, do not silently retain a coupon which no longer meets the minimum.
    if (coupon) {
      const result = calculateDiscount(coupon.code, subtotal);
      if (!result.ok) { setCoupon(null); setCouponMessage(result.message); setCouponError(true); }
      else setCoupon({ code: result.code, amount: result.amount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatClass, count, trip]);

  const applyCoupon = () => {
    const result = calculateDiscount(couponInput, subtotal);
    setCouponError(!result.ok);
    setCouponMessage(result.message);
    setCoupon(result.ok ? { code: result.code, amount: result.amount } : null);
  };
  const removeCoupon = () => { setCoupon(null); setCouponInput(''); setCouponMessage('Đã bỏ mã giảm giá.'); setCouponError(false); };

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (couponInput.trim() && !coupon) { setErr('Mã giảm giá đã nhập nhưng chưa được áp dụng. Hãy nhấn Áp dụng hoặc xóa mã.'); return; }
    setBusy(true);
    try {
      let bookingCode = pendingBookingCode;
      if (!bookingCode) {
        const createResponse = await fetch('/api/trains/bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trainCode: code, seatClass, passengerCount: count, passengers: people, contactName: name, contactEmail: email, contactPhone: phone, couponCode: coupon?.code || '' }),
        });
        const bookingData = await parseApiResponse(createResponse);
        bookingCode = bookingData.item.bookingCode;
        setPendingBookingCode(bookingCode);
      }
      const payResponse = await fetch('/api/trains/bookings/' + encodeURIComponent(bookingCode) + '/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method }),
      });
      const paymentData = await parseApiResponse(payResponse);
      if (paymentData.redirectUrl) { window.location.assign(paymentData.redirectUrl); return; }
      navigate('/train/ticket/' + encodeURIComponent(bookingCode) + '?payment=success');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="rail-wrap rail-checkout-page"><div className="rail-card rail-loading">Đang tải hành trình và giá vé…</div></main>;
  if (!trip) return <main className="rail-wrap rail-checkout-page"><div className="rail-card rail-error">{err || 'Không tìm thấy chuyến tàu.'}<p><Link to="/train/search">Quay lại tìm chuyến</Link></p></div></main>;

  return <main className="rail-wrap rail-checkout-page">
    <header className="rail-checkout-topbar"><Link to="/" className="rail-brand">Travel Mini</Link><nav><Link to="/train/search">Tìm tàu</Link><Link to="/train/bookings">Tra cứu vé</Link></nav></header>
    <Link className="rail-back" to="/train/results">← Quay lại kết quả</Link>
    <div className="rail-step-label">BƯỚC 2/3 · THÔNG TIN HÀNH KHÁCH</div>
    <h1 className="rail-page-title">Hoàn tất đặt vé tàu</h1>
    <p className="rail-page-subtitle">Kiểm tra hạng chỗ, nhập thông tin hành khách và áp dụng mã ưu đãi trước khi thanh toán.</p>

    <div className="rail-checkout-layout">
      <form className="rail-checkout-form" onSubmit={submit}>
        <section className="rail-card rail-form-card">
          <div className="rail-section-heading"><span className="rail-section-icon">01</span><div><h2>Hạng chỗ</h2><p>Giá thay đổi theo loại tàu và hạng chỗ đã chọn.</p></div></div>
          <div className="rail-class-options">
            {classOptions.map(item => {
              const active = seatClass === item.value;
              const price = Math.round(Number(trip.basePrice || 0) * item.multiplier) * count;
              return <label key={item.value} className={`rail-class-option ${active ? 'is-active' : ''}`}>
                <input type="radio" name="seatClass" value={item.value} checked={active} onChange={() => setSeatClass(item.value)} />
                <span className="rail-class-radio" />
                <span className="rail-class-copy"><strong>{item.label}</strong><small>{item.note}</small></span>
                <strong className="rail-class-price">{money(price)}</strong>
              </label>;
            })}
          </div>
        </section>

        <section className="rail-card rail-form-card">
          <div className="rail-section-heading"><span className="rail-section-icon">02</span><div><h2>Thông tin liên hệ</h2><p>Thông tin này được dùng để tra cứu booking.</p></div></div>
          <div className="rail-form-grid">
            <label>Họ tên người liên hệ<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required placeholder="Nguyễn Văn A" /></label>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="ten@example.com" /></label>
            <label className="rail-field-full">Số điện thoại<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" required placeholder="09xxxxxxxx" /></label>
          </div>
        </section>

        <section className="rail-card rail-form-card">
          <div className="rail-section-heading"><span className="rail-section-icon">03</span><div><h2>Hành khách</h2><p>Nhập đúng họ tên cho từng hành khách.</p></div></div>
          <div className="rail-passengers-grid">
            {people.map((person, index) => <fieldset className="rail-passenger-box" key={index}><legend>Hành khách {index + 1}</legend>
              <label>Họ và tên<input value={person.fullName} onChange={e => setPeople(old => old.map((item, i) => i === index ? { ...item, fullName: e.target.value } : item))} required placeholder="Họ tên như giấy tờ" /></label>
              <label>Số giấy tờ (không bắt buộc)<input value={person.documentNumber} onChange={e => setPeople(old => old.map((item, i) => i === index ? { ...item, documentNumber: e.target.value } : item))} placeholder="CCCD hoặc hộ chiếu" /></label>
            </fieldset>)}
          </div>
        </section>

        <section className="rail-card rail-form-card rail-coupon-card">
          <div className="rail-section-heading"><span className="rail-section-icon rail-coupon-icon">%</span><div><h2>Mã giảm giá</h2><p>Áp dụng mã giảm giá cho tổng tiền vé tàu.</p></div></div>
          <div className="rail-coupon-form"><input value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} disabled={Boolean(coupon)} placeholder="Nhập mã, ví dụ TMWELCOME75" aria-label="Mã giảm giá tàu hỏa"/><button type="button" className="rail-btn alt" onClick={coupon ? removeCoupon : applyCoupon}>{coupon ? 'Bỏ mã' : 'Áp dụng'}</button></div>
          <p className={`rail-coupon-message ${couponError ? 'is-error' : coupon ? 'is-success' : ''}`} role="status">{couponMessage || 'Mã demo: TMWELCOME75 giảm 75.000đ · TMTRAIN50 giảm 50.000đ.'}</p>
        </section>

        <section className="rail-card rail-form-card">
          <div className="rail-section-heading"><span className="rail-section-icon">04</span><div><h2>Phương thức thanh toán</h2><p>Chọn cách thanh toán cho booking mô phỏng.</p></div></div>
          <div className="rail-payment-options">
            <label className={`rail-payment-option ${method === 'demo' ? 'is-active' : ''}`}><input type="radio" name="paymentMethod" checked={method === 'demo'} onChange={() => setMethod('demo')}/><span><strong>Thanh toán mô phỏng</strong><small>Kiểm thử đồ án, không chuyển tiền thật.</small></span></label>
            <label className={`rail-payment-option ${method === 'vnpay' ? 'is-active' : ''}`}><input type="radio" name="paymentMethod" checked={method === 'vnpay'} onChange={() => setMethod('vnpay')}/><span><strong>VNPay Sandbox</strong><small>Chuyển sang VNPay nếu Merchant/website được phê duyệt.</small></span></label>
          </div>
          {err && <p className="rail-error" role="alert">{err}</p>}
          <button className="rail-btn rail-submit-btn" disabled={busy}>{busy ? 'Đang xử lý…' : method === 'vnpay' ? 'Đặt chỗ & thanh toán VNPay' : 'Xác nhận & thanh toán mô phỏng'}</button>
          {pendingBookingCode && <p className="rail-pending-booking">Booking đang chờ thanh toán: <strong>{pendingBookingCode}</strong>. Khi thử lại, hệ thống sẽ sử dụng booking này thay vì tạo đơn mới.</p>}
        </section>
      </form>

      <aside className="rail-summary-card">
        <div className="rail-summary-top"><span className="rail-summary-eyebrow">TÓM TẮT HÀNH TRÌNH</span><span className="rail-demo-badge">DEMO</span></div>
        <h2>{trip.trainTypeLabel}</h2><p className="rail-summary-service">{trip.operator} · {trip.serviceNumber}</p>
        <div className="rail-summary-route"><div><small>GA ĐI</small><strong>{trip.originCode}</strong><span>{trip.originName}</span><b>{trip.departureTime}</b></div><span className="rail-summary-arrow">→</span><div><small>GA ĐẾN</small><strong>{trip.destinationCode}</strong><span>{trip.destinationName}</span><b>{trip.arrivalTime}</b></div></div>
        <p className="rail-summary-date">{trip.departureDate} · {Math.floor(Number(trip.durationMinutes || 0) / 60)} giờ {Number(trip.durationMinutes || 0) % 60} phút</p>
        <div className="rail-summary-selected-class"><span>Hạng chỗ</span><strong>{selectedClass.label}</strong></div>
        <div className="rail-summary-price-lines"><div><span>{count} hành khách</span><strong>{money(subtotal)}</strong></div>{coupon && <div className="rail-discount-line"><span>Mã {coupon.code}</span><strong>−{money(discount)}</strong></div>}<div className="rail-summary-total"><span>Tổng thanh toán</span><strong>{money(total)}</strong></div></div>
        <div className="rail-summary-footnote">Lịch tàu, loại tàu, giá và tình trạng chỗ đều là dữ liệu mô phỏng, không phải lịch khai thác thật.</div>
      </aside>
    </div>
  </main>;
}

