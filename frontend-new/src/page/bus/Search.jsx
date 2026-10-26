import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api as busApi } from "../../api.js";
import "../../css/search.css";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function LocationField({ id, label, placeholder, value, selected, onChange, onSelect, icon }) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!focused || q.length < 1) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const params = new URLSearchParams({ q, limit: "8" });
        const data = await busApi(`/api/bus/locations?${params.toString()}`);
        if (!cancelled) setSuggestions(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, focused]);

  return (
    <div className="tmsp-field tmsp-location-field">
      <label htmlFor={id}>{label}</label>
      <div className="tmsp-input-wrap">
        <span className="tmsp-field-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        {value && (
          <button className="tmsp-clear" type="button" aria-label={`Xóa ${label}`} onClick={() => onChange("")}>×</button>
        )}
      </div>
      {focused && value.trim() && (
        <div className="tmsp-suggestions" role="listbox" aria-label={`Gợi ý ${label}`}>
          {loadingSuggestions && <div className="tmsp-suggestion-state">Đang tìm địa điểm…</div>}
          {!loadingSuggestions && suggestions.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={selected?.code === item.code}
              className="tmsp-suggestion"
              key={item.id || item.code || item.name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onSelect(item); setFocused(false); }}
            >
              <span className="tmsp-suggestion-icon" aria-hidden="true">⌖</span>
              <span><b>{item.name}</b><small>{item.city || ""}{item.type === "PLACE" ? " · Địa điểm" : item.type ? " · Bến xe" : ""}</small></span>
            </button>
          ))}
          {!loadingSuggestions && suggestions.length === 0 && (
            <div className="tmsp-suggestion-state">Không có gợi ý phù hợp. Bạn vẫn có thể nhập địa điểm này.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BusSearch() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState("");
  const [originSelected, setOriginSelected] = useState(null);
  const [destination, setDestination] = useState("");
  const [destinationSelected, setDestinationSelected] = useState(null);
  const [date, setDate] = useState(localToday());
  const [passengers, setPassengers] = useState("1");
  const [error, setError] = useState("");

  function swapLocations() {
    setOrigin(destination);
    setDestination(origin);
    setOriginSelected(destinationSelected);
    setDestinationSelected(originSelected);
  }

  function submit(event) {
    event.preventDefault();
    setError("");
    const cleanOrigin = origin.trim();
    const cleanDestination = destination.trim();
    if (!cleanOrigin) return setError("Vui lòng nhập địa điểm hiện tại hoặc điểm xuất phát.");
    if (!cleanDestination) return setError("Vui lòng nhập điểm đến.");
    if (cleanOrigin.toLocaleLowerCase("vi") === cleanDestination.toLocaleLowerCase("vi") || (originSelected?.code && originSelected.code === destinationSelected?.code)) {
      return setError("Điểm xuất phát và điểm đến phải khác nhau.");
    }
    if (!date) return setError("Vui lòng chọn ngày khởi hành.");
    if (date < localToday()) return setError("Ngày đi không thể nằm trong quá khứ.");

    const params = new URLSearchParams({ origin: cleanOrigin, destination: cleanDestination, date, passengers });
    if (originSelected?.code) params.set("originCode", originSelected.code);
    if (destinationSelected?.code) params.set("destinationCode", destinationSelected.code);
    navigate(`/bus/results?${params.toString()}`);
  }

  return (
    <main className="tmsp-page tmsp-bus-page">
      <header className="tmsp-topbar">
        <Link to="/" className="tmsp-brand"><span className="tmsp-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Mỗi hành trình, dễ dàng hơn</small></span></Link>
        <nav className="tmsp-nav" aria-label="Điều hướng chính"><Link to="/">Trang chủ</Link><Link className="is-active" to="/bus/search">Vé xe khách</Link><Link to="/flight/search">Vé máy bay</Link><Link to="/train/search">Vé tàu hỏa</Link></nav>
        <Link className="tmsp-account" to={sessionStorage.getItem("access_token") ? "/profile" : "/login"}>{sessionStorage.getItem("access_token") ? "Tài khoản" : "Đăng nhập"}</Link>
      </header>

      <section className="tmsp-hero tmsp-bus-hero">
        <div className="tmsp-hero-copy">
          <span className="tmsp-eyebrow"><i /> TÌM CHUYẾN XE PHÙ HỢP</span>
          <h1>Đi từ nơi bạn đang ở<br /><span>đến nơi bạn muốn.</span></h1>
          <p>Nhập điểm xuất phát, điểm đến và ngày đi. So sánh chuyến xe, nhà xe và chỗ còn trống trên cùng một nơi.</p>
          <div className="tmsp-trust-row"><span>✓ Gợi ý điểm đi/đến</span><span>✓ Giữ chỗ 10 phút</span><span>✓ Vé điện tử demo</span></div>
        </div>
        <div className="tmsp-hero-art tmsp-bus-art" aria-hidden="true"><div className="tmsp-art-sun"/><div className="tmsp-road"/><div className="tmsp-art-bus">🚌</div><div className="tmsp-art-ticket">Hành trình của bạn<br/><b>bắt đầu từ đây</b></div></div>
      </section>

      <section className="tmsp-search-section">
        <div className="tmsp-search-tabs" aria-label="Chọn phương tiện"><Link className="is-active" to="/bus/search">🚌 <span>Xe khách</span></Link><Link to="/flight/search">✈️ <span>Máy bay</span></Link><Link to="/train/search">🚆 <span>Tàu hỏa</span></Link></div>
        <form className="tmsp-search-card" onSubmit={submit}>
          <div className="tmsp-card-heading"><div className="tmsp-card-heading-icon">⌕</div><div><h2>Tìm vé xe khách</h2><p>Chọn nơi bắt đầu hành trình, điểm đến và ngày khởi hành.</p></div></div>
          <div className="tmsp-search-grid tmsp-bus-form-grid">
            <LocationField id="bus-origin" label="Điểm đi / Nơi hiện tại" placeholder="Thành phố hoặc bến xe xuất phát" value={origin} selected={originSelected} icon="⌖" onChange={(value) => { setOrigin(value); setOriginSelected(null); }} onSelect={(item) => { setOrigin(item.name); setOriginSelected(item); }} />
            <button type="button" className="tmsp-swap" onClick={swapLocations} aria-label="Đổi điểm đi và điểm đến" title="Đổi điểm đi và điểm đến">⇄</button>
            <LocationField id="bus-destination" label="Điểm đến" placeholder="Thành phố hoặc bến xe đến" value={destination} selected={destinationSelected} icon="⚑" onChange={(value) => { setDestination(value); setDestinationSelected(null); }} onSelect={(item) => { setDestination(item.name); setDestinationSelected(item); }} />
            <div className="tmsp-field"><label htmlFor="bus-departure-date">Ngày khởi hành</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">▦</span><input id="bus-departure-date" type="date" min={localToday()} value={date} onChange={(event) => setDate(event.target.value)} required /></div></div>
            <div className="tmsp-field"><label htmlFor="bus-passengers">Hành khách</label><div className="tmsp-input-wrap"><span className="tmsp-field-icon">♙</span><select id="bus-passengers" value={passengers} onChange={(event) => setPassengers(event.target.value)}>{Array.from({ length: 8 }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count} hành khách</option>)}</select></div></div>
          </div>
          {error && <div className="tmsp-error" role="alert">{error}</div>}
          <div className="tmsp-submit-row"><div className="tmsp-demo-note">Chọn điểm đi, điểm đến, ngày và số hành khách</div><button className="tmsp-primary-button" type="submit">Tìm chuyến xe <span>→</span></button></div>
        </form>
      </section>

      <section className="tmsp-benefit-grid"><article><span>⌖</span><div><b>Chọn điểm đi linh hoạt</b><p>Nhập địa điểm đang ở, thành phố hoặc bến xe.</p></div></article><article><span>⇄</span><div><b>Dễ dàng so sánh</b><p>Giờ chạy, giá vé và chỗ còn trống.</p></div></article><article><span>▣</span><div><b>Đặt vé tiện lợi</b><p>Giữ chỗ và quản lý booking trong Travel Mini.</p></div></article></section>
      <footer className="tmsp-footer">© {new Date().getFullYear()} Travel Mini · Dữ liệu mô phỏng phục vụ kiểm thử đồ án.</footer>
    </main>
  );
}

