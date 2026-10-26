import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../css/flight.css';

const money = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));
const duration = (n) => `${Math.floor(n / 60)} giờ ${n % 60} phút`;

export default function FlightResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const origin = query.get('origin') || '';
  const destination = query.get('destination') || '';
  const date = query.get('date') || '';
  const passengers = Math.max(1, Math.min(9, Number(query.get('passengers') || 1)));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('price');

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ origin, destination, date, passengers: String(passengers) });
    fetch(`/api/flights/search?${qs}`)
      .then(async r => { const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.message || 'Không tìm được chuyến bay.'); return d; })
      .then(d => alive && setItems(d.items || []))
      .catch(e => alive && setError(`${e.message} Nếu chưa có dữ liệu, hãy chạy seed_flight_demo.py.`))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [origin, destination, date, passengers]);

  const sorted = [...items].sort((a, b) => sort === 'departure' ? a.departureTime.localeCompare(b.departureTime) : sort === 'duration' ? a.durationMinutes - b.durationMinutes : a.basePrice - b.basePrice);

  return <main className="flight-page">
    <header className="flight-topbar"><Link to="/" className="flight-brand">Travel Mini</Link><nav><Link to="/">Trang chủ</Link><Link to="/flight/search">Tìm chuyến bay</Link><Link to="/flight/bookings">Tra cứu vé</Link></nav></header>
    <section className="flight-results-header"><Link to="/flight/search" className="flight-back">← Sửa tìm kiếm</Link><h1>{origin} <span>→</span> {destination}</h1><p>{date} · {passengers} hành khách · {items.length} chuyến bay</p><div className="flight-demo-notice"><strong>Chế độ demo:</strong> dữ liệu lịch bay và giá vé chỉ để kiểm thử, không phải giá vé thực tế.</div></section>
    <div className="flight-sort"><label>Sắp xếp <select value={sort} onChange={e => setSort(e.target.value)}><option value="price">Giá thấp nhất</option><option value="departure">Giờ khởi hành</option><option value="duration">Thời lượng</option></select></label></div>
    {loading && <div className="flight-empty">Đang tìm chuyến bay…</div>}
    {error && <div className="flight-error flight-empty">{error}</div>}
    {!loading && !error && sorted.length === 0 && <div className="flight-empty"><h2>Chưa có chuyến bay mẫu phù hợp</h2><p>Hãy chọn tuyến bay khác hoặc kiểm tra dữ liệu demo đã được seed chưa.</p><Link className="flight-primary inline" to="/flight/search">Tìm lại</Link></div>}
    <section className="flight-list">{sorted.map(f => <article className="flight-card" key={f.flightCode}>
      <div className="flight-airline"><div className="flight-airline-logo">{f.airlineCode}</div><div><strong>{f.airline}</strong><small>{f.flightNumber} · Dữ liệu demo</small></div></div>
      <div className="flight-times"><div><strong>{f.departureTime}</strong><b>{f.originCode}</b><small>{f.departureDate}</small></div><div className="flight-duration"><small>{duration(f.durationMinutes)}</small><span></span><small>{f.stops === 0 ? 'Bay thẳng' : `${f.stops} điểm dừng`}</small></div><div><strong>{f.arrivalTime}</strong><b>{f.destinationCode}</b><small>{f.arrivalDate}</small></div></div>
      <div className="flight-price"><small>Còn {f.availableSeats} chỗ demo</small><strong>{money(f.basePrice)}<small>/khách</small></strong><button className="flight-primary" onClick={() => navigate(`/flight/checkout?flightCode=${encodeURIComponent(f.flightCode)}&passengers=${passengers}`)}>Chọn chuyến</button></div>
    </article>)}</section>
  </main>;
}

