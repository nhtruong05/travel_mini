import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/search.css";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function TrainSearch() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [origin, setOrigin] = useState("SGN");
  const [destination, setDestination] = useState("DAN");
  const [date, setDate] = useState(localToday());
  const [trainType, setTrainType] = useState("ALL");
  const [passengers, setPassengers] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStations() {
      try {
        const response = await fetch("/api/trains/stations");
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || "Không tải được danh sách ga.");
        if (!cancelled) {
          const items = Array.isArray(data.items) ? data.items : [];
          setStations(items);
          if (items.length && !items.some((item) => item.code === origin)) setOrigin(items[0].code);
          if (items.length > 1 && !items.some((item) => item.code === destination)) setDestination(items[1].code);
        }
      } catch (err) {
        if (!cancelled) setError(`${err.message} Hãy kiểm tra Flask và chạy seed dữ liệu tàu.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStations();
    return () => { cancelled = true; };
  }, []); // load once on mount

  function submit(event) {
    event.preventDefault();
    setError("");
    if (!origin || !destination) return setError("Vui lòng chọn ga đi và ga đến.");
    if (origin === destination) return setError("Ga đi và ga đến phải khác nhau.");
    if (!date || date < localToday()) return setError("Ngày khởi hành không được ở trong quá khứ.");
    const params = new URLSearchParams({ origin, destination, date, trainType, passengers });
    navigate(`/train/results?${params.toString()}`);
  }

  function swap() { setOrigin(destination); setDestination(origin); }

  return (
    <main className="tmsp-page tmsp-train-page">
      <header className="tmsp-topbar"><Link to="/" className="tmsp-brand"><span className="tmsp-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Mỗi hành trình, dễ dàng hơn</small></span></Link><nav className="tmsp-nav"><Link to="/">Trang chủ</Link><Link to="/bus/search">Vé xe khách</Link><Link to="/flight/search">Vé máy bay</Link><Link className="is-active" to="/train/search">Vé tàu hỏa</Link></nav><Link className="tmsp-account" to={sessionStorage.getItem("access_token") ? "/profile" : "/login"}>{sessionStorage.getItem("access_token") ? "Tài khoản" : "Đăng nhập"}</Link></header>
      <section className="tmsp-hero tmsp-train-hero"><div className="tmsp-hero-copy"><span className="tmsp-eyebrow"><i /> KHÁM PHÁ NHỮNG MIỀN ĐẤT</span><h1>Chạm đến những nơi<br/><span>đáng để khám phá.</span></h1><p>Lên kế hoạch cho hành trình đường sắt, chọn ga đi, ga đến và loại tàu phù hợp.</p><div className="tmsp-trust-row"><span>✓ Chọn ga thuận tiện</span><span>✓ Nhiều loại chỗ demo</span><span>✓ Vé điện tử demo</span></div></div><div className="tmsp-hero-art tmsp-train-art" aria-hidden="true"><div className="tmsp-train-hill hill-one"/><div className="tmsp-train-hill hill-two"/><div className="tmsp-art-track"/><div className="tmsp-art-train">🚆</div><div className="tmsp-art-ticket">Đi xa hơn<br/><b>theo cách của bạn</b></div></div></section>
      <section className="tmsp-search-section"><div className="tmsp-search-tabs"><Link to="/bus/search">🚌 <span>Xe khách</span></Link><Link to="/flight/search">✈️ <span>Máy bay</span></Link><Link className="is-active" to="/train/search">🚆 <span>Tàu hỏa</span></Link></div><form className="tmsp-search-card" onSubmit={submit}><div className="tmsp-card-heading"><div className="tmsp-card-heading-icon">🚆</div><div><h2>Tìm chuyến tàu</h2><p>Chọn ga khởi hành, ga đến và ngày đi mong muốn.</p></div></div><div className="tmsp-search-grid tmsp-train-form-grid"><div className="tmsp-field"><label htmlFor="train-origin">Ga đi</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">⌖</span><select id="train-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} disabled={loading || stations.length === 0} required><option value="">Chọn ga đi</option>{stations.map((station) => <option key={station.code} value={station.code}>{station.name} — {station.city}</option>)}</select></div></div><button type="button" className="tmsp-swap tmsp-train-swap" onClick={swap} disabled={!origin || !destination} title="Đổi ga đi và ga đến" aria-label="Đổi ga đi và ga đến">⇄</button><div className="tmsp-field"><label htmlFor="train-destination">Ga đến</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">⚑</span><select id="train-destination" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={loading || stations.length === 0} required><option value="">Chọn ga đến</option>{stations.map((station) => <option key={station.code} value={station.code}>{station.name} — {station.city}</option>)}</select></div></div><div className="tmsp-field"><label htmlFor="train-date">Ngày khởi hành</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">▦</span><input id="train-date" type="date" min={localToday()} value={date} onChange={(e) => setDate(e.target.value)} required/></div></div><div className="tmsp-field"><label htmlFor="train-passengers">Hành khách</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">♙</span><select id="train-passengers" value={passengers} onChange={(e) => setPassengers(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} hành khách</option>)}</select></div></div><div className="tmsp-field"><label htmlFor="train-type">Loại tàu</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">🚄</span><select id="train-type" value={trainType} onChange={(e) => setTrainType(e.target.value)}><option value="ALL">Tất cả loại tàu</option><option value="STANDARD">Tàu hỏa</option><option value="HIGH_SPEED_DEMO">Tàu cao tốc (demo)</option></select></div></div></div>{error && <div className="tmsp-error" role="alert">{error}</div>}<div className="tmsp-submit-row"><div className="tmsp-demo-note">Lịch tàu, giá vé và tàu cao tốc đều là dữ liệu mô phỏng.</div><button className="tmsp-primary-button" type="submit" disabled={loading || stations.length === 0}>{loading ? "Đang tải danh sách ga…" : "Tìm chuyến tàu"}<span>→</span></button></div></form></section>
      <section className="tmsp-benefit-grid"><article><span>🚉</span><div><b>Chọn ga thuận tiện</b><p>Tra cứu từ danh sách ga demo hiện có.</p></div></article><article><span>🚄</span><div><b>Lựa chọn loại tàu</b><p>Tàu thường hoặc tàu cao tốc mô phỏng.</p></div></article><article><span>▣</span><div><b>Quản lý vé điện tử</b><p>Tra cứu thông tin booking sau khi đặt.</p></div></article></section><footer className="tmsp-footer">© {new Date().getFullYear()} Travel Mini · Dữ liệu tàu mô phỏng phục vụ kiểm thử đồ án.</footer>
    </main>
  );
}

