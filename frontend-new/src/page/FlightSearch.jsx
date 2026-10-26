import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/search.css";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function FlightSearch() {
  const navigate = useNavigate();
  const [airports, setAirports] = useState([]);
  const [origin, setOrigin] = useState("SGN");
  const [destination, setDestination] = useState("HAN");
  const [date, setDate] = useState(localToday());
  const [passengers, setPassengers] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadAirports() {
      try {
        const response = await fetch("/api/flights/airports");
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Không tải được danh sách sân bay.");
        if (!cancelled) {
          const items = Array.isArray(data.items) ? data.items : [];
          setAirports(items);
          if (items.length && !items.some((item) => item.code === origin)) setOrigin(items[0].code);
          if (items.length > 1 && !items.some((item) => item.code === destination)) setDestination(items[1].code);
        }
      } catch (err) {
        if (!cancelled) setError(`${err.message} Hãy kiểm tra Flask và dữ liệu sân bay demo.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAirports();
    return () => { cancelled = true; };
  }, []); // load once on mount

  function submit(event) {
    event.preventDefault();
    setError("");
    if (!origin || !destination) return setError("Vui lòng chọn sân bay đi và sân bay đến.");
    if (origin === destination) return setError("Sân bay đi và sân bay đến phải khác nhau.");
    if (!date || date < localToday()) return setError("Ngày bay không được nằm trong quá khứ.");
    const params = new URLSearchParams({ origin, destination, date, passengers });
    navigate(`/flight/results?${params.toString()}`);
  }

  function swap() { setOrigin(destination); setDestination(origin); }

  return (
    <main className="tmsp-page tmsp-flight-page">
      <header className="tmsp-topbar"><Link to="/" className="tmsp-brand"><span className="tmsp-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Mỗi hành trình, dễ dàng hơn</small></span></Link><nav className="tmsp-nav"><Link to="/">Trang chủ</Link><Link to="/bus/search">Vé xe khách</Link><Link className="is-active" to="/flight/search">Vé máy bay</Link><Link to="/train/search">Vé tàu hỏa</Link></nav><Link className="tmsp-account" to={sessionStorage.getItem("access_token") ? "/profile" : "/login"}>{sessionStorage.getItem("access_token") ? "Tài khoản" : "Đăng nhập"}</Link></header>
      <section className="tmsp-hero tmsp-flight-hero"><div className="tmsp-hero-copy"><span className="tmsp-eyebrow"><i /> KHÁM PHÁ BẦU TRỜI</span><h1>Bay đến nơi bạn muốn,<br/><span>theo cách của bạn.</span></h1><p>Tìm hành trình bay, so sánh giờ khởi hành và giá vé mô phỏng trong một giao diện đơn giản.</p><div className="tmsp-trust-row"><span>✓ So sánh chuyến bay</span><span>✓ Chủ động chọn chỗ</span><span>✓ Vé điện tử demo</span></div></div><div className="tmsp-hero-art tmsp-flight-art" aria-hidden="true"><div className="tmsp-flight-cloud cloud-one"/><div className="tmsp-flight-cloud cloud-two"/><div className="tmsp-flight-sun"/><div className="tmsp-art-plane">✈</div><div className="tmsp-art-ticket">Fly your way<br/><b>Travel Mini</b></div></div></section>
      <section className="tmsp-search-section"><div className="tmsp-search-tabs"><Link to="/bus/search">🚌 <span>Xe khách</span></Link><Link className="is-active" to="/flight/search">✈️ <span>Máy bay</span></Link><Link to="/train/search">🚆 <span>Tàu hỏa</span></Link></div><form className="tmsp-search-card" onSubmit={submit}><div className="tmsp-card-heading"><div className="tmsp-card-heading-icon">✈</div><div><h2>Tìm chuyến bay</h2><p>Chọn sân bay khởi hành, điểm đến và thông tin hành khách.</p></div></div><div className="tmsp-search-grid tmsp-flight-form-grid"><div className="tmsp-field"><label htmlFor="flight-origin">Điểm khởi hành</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">⌖</span><select id="flight-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} disabled={loading || airports.length === 0} required><option value="">Chọn sân bay đi</option>{airports.map((a) => <option value={a.code} key={a.code}>{a.city} ({a.code}) — {a.name}</option>)}</select></div></div><button type="button" className="tmsp-swap tmsp-flight-swap" onClick={swap} disabled={!origin || !destination} aria-label="Đổi chiều bay" title="Đổi chiều bay">⇄</button><div className="tmsp-field"><label htmlFor="flight-destination">Điểm đến</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">⚑</span><select id="flight-destination" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={loading || airports.length === 0} required><option value="">Chọn sân bay đến</option>{airports.map((a) => <option value={a.code} key={a.code}>{a.city} ({a.code}) — {a.name}</option>)}</select></div></div><div className="tmsp-field"><label htmlFor="flight-date">Ngày khởi hành</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">▦</span><input id="flight-date" type="date" min={localToday()} value={date} onChange={(e) => setDate(e.target.value)} required/></div></div><div className="tmsp-field"><label htmlFor="flight-passengers">Hành khách</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">♙</span><select id="flight-passengers" value={passengers} onChange={(e) => setPassengers(e.target.value)}>{Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} hành khách</option>)}</select></div></div></div>{error && <div className="tmsp-error" role="alert">{error}</div>}<div className="tmsp-submit-row"><div className="tmsp-demo-note">Chuyến bay, giá và chỗ ngồi là dữ liệu mô phỏng.</div><button className="tmsp-primary-button" type="submit" disabled={loading || airports.length === 0}>{loading ? "Đang tải sân bay…" : "Tìm chuyến bay"}<span>→</span></button></div></form></section>
      <section className="tmsp-benefit-grid"><article><span>✈</span><div><b>So sánh chuyến bay</b><p>Xem giờ bay, thời lượng và giá.</p></div></article><article><span>▦</span><div><b>Chọn chỗ ngồi</b><p>Khám phá sơ đồ ghế máy bay demo.</p></div></article><article><span>✓</span><div><b>Quản lý booking</b><p>Tra cứu hành trình đã đặt.</p></div></article></section><footer className="tmsp-footer">© {new Date().getFullYear()} Travel Mini · Dữ liệu chuyến bay mô phỏng phục vụ kiểm thử đồ án.</footer>
    </main>
  );
}

