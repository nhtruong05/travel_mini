import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/home.css";
import "../css/home-real-photo-hero.css";
import "../css/home-bus-overrides.css";

const API_BASE = ""; // Use same-origin /api so Vite proxy also works through ngrok.

const FEATURES = [
  { icon: "⌖", title: "Tìm bằng điểm đi và điểm đến", text: "Nhập nơi xuất phát, nơi muốn đến và ngày đi. Bạn không cần biết trước tên nhà xe." },
  { icon: "⇄", title: "So sánh các nhà xe", text: "Xem giờ khởi hành, giờ đến, giá vé, điểm đón/trả và chỗ còn trống." },
  { icon: "▦", title: "Chủ động chọn chỗ", text: "Xem sơ đồ ghế hoặc giường thực tế và giữ chỗ trong 10 phút." },
];

const STEPS = [
  { title: "Nhập hành trình", text: "Chọn điểm xuất phát, nơi muốn đến và ngày khởi hành." },
  { title: "Chọn chuyến phù hợp", text: "So sánh nhà xe, giờ chạy, giá vé và điểm đón/trả." },
  { title: "Chọn chỗ và đặt vé", text: "Nhập thông tin hành khách, thanh toán và nhận vé điện tử." },
];

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function fetchLocations(query) {
  const params = new URLSearchParams({ q: query, limit: "8" });
  const response = await fetch(`${API_BASE}/api/bus/locations?${params.toString()}`);
  let data;
  try { data = await response.json(); } catch { throw new Error("Dữ liệu gợi ý địa điểm không hợp lệ."); }
  if (!response.ok || data.success === false) throw new Error(data.message || "Không tải được gợi ý địa điểm.");
  return Array.isArray(data.items) ? data.items : [];
}

function LocationInput({ id, label, placeholder, value, onChange, selected, onSelect, icon = "⌖" }) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 1) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const items = await fetchLocations(query);
        if (!cancelled) setSuggestions(items);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value, focused]);

  return (
    <div className="booking-field home-location-field">
      <label htmlFor={id}>{label}</label>
      <div className="home-bus-input-wrap">
        <span className="home-bus-input-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        {value && (
          <button type="button" className="home-bus-clear" aria-label={`Xóa ${label.toLowerCase()}`} onClick={() => onChange("")}>×</button>
        )}
      </div>
      {selected && (
        <div className="home-bus-selected-location">✓ {selected.name}{selected.city && <span>{selected.city}</span>}</div>
      )}
      {focused && value.trim() && (
        <div className="home-bus-suggestions" role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>
          {loadingSuggestions && <div className="home-bus-suggestion-state">Đang tìm địa điểm…</div>}
          {!loadingSuggestions && suggestions.map((item) => (
            <button
              key={item.id || item.code || item.name}
              type="button"
              role="option"
              aria-selected={selected?.code === item.code}
              className="home-bus-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onSelect(item); setFocused(false); }}
            >
              <span className="home-bus-suggestion-pin" aria-hidden="true">⌖</span>
              <span><b>{item.name}</b><small>{item.city || ""}{item.type === "PLACE" ? " · Địa điểm" : item.type ? " · Bến xe" : ""}</small></span>
            </button>
          ))}
          {!loadingSuggestions && suggestions.length === 0 && (
            <div className="home-bus-suggestion-state">Không có gợi ý phù hợp. Bạn vẫn có thể nhập địa điểm này.</div>
          )}
        </div>
      )}
      <small className="home-bus-field-help">Có thể nhập tên địa điểm, thành phố hoặc bến xe.</small>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [departureDate, setDepartureDate] = useState(localToday());
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(sessionStorage.getItem("access_token")));

  function scrollToBooking() {
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("home-origin")?.focus(), 350);
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    setIsLoggedIn(false);
    navigate("/", { replace: true });
  }

  function handleSearch(event) {
    event.preventDefault();
    setMessage("");
    const cleanOrigin = origin.trim();
    const cleanDestination = destination.trim();
    if (!cleanOrigin) { setMessage("Vui lòng nhập điểm xuất phát."); return; }
    if (!cleanDestination) { setMessage("Vui lòng nhập điểm đến."); return; }
    if (cleanOrigin.toLocaleLowerCase("vi") === cleanDestination.toLocaleLowerCase("vi") || (selectedOrigin?.code && selectedOrigin.code === selectedDestination?.code)) {
      setMessage("Điểm đi và điểm đến không được trùng nhau."); return;
    }
    if (!departureDate) { setMessage("Vui lòng chọn ngày đi."); return; }
    if (departureDate < localToday()) { setMessage("Ngày đi không được ở trong quá khứ."); return; }

    const params = new URLSearchParams({ origin: cleanOrigin, destination: cleanDestination, date: departureDate });
    if (selectedOrigin?.code) params.set("originCode", selectedOrigin.code);
    if (selectedDestination?.code) params.set("destinationCode", selectedDestination.code);
    navigate(`/bus/results?${params.toString()}`);
  }

  return (
    <div className="home-page home-bus-only">
      <header className="home-header">
        <Link to="/" className="home-logo" aria-label="Travel Mini - Trang chủ">
          <span className="logo-symbol" aria-hidden="true">🚌</span><span>TRAVEL MINI</span>
        </Link>
        <nav className="home-nav" aria-label="Điều hướng chính">
          <Link to="/" className="nav-active">Trang chủ</Link>
          <a href="#booking">Tìm vé xe</a>
          <a href="#services">Dịch vụ</a>
          <Link to="/bus/bookings">Đơn của tôi</Link>
        </nav>
        <div className="home-account">
          {isLoggedIn ? <>
            <Link to="/profile" className="account-button">Tài khoản</Link>
            <button type="button" className="logout-button" onClick={handleLogout}>Đăng xuất</button>
          </> : <>
            <Link to="/login" className="login-link">Đăng nhập</Link>
            <Link to="/register" className="register-button">Đăng ký</Link>
          </>}
        </div>
      </header>

      <main>
        <section className="home-hero home-bus-hero">
          <div className="hero-content">
            <span className="hero-tag">✦ Tìm chuyến xe theo cách đơn giản hơn</span>
            <h1>Hành trình của bạn,<br /><span>bắt đầu từ đây.</span></h1>
            <p>Nhập điểm xuất phát, nơi muốn đến và ngày đi. Travel Mini sẽ tìm chuyến xe phù hợp, đề xuất nhà xe và hiển thị giá vé cùng chỗ còn trống.</p>
            <button type="button" className="hero-button" onClick={scrollToBooking}>Tìm vé xe khách <span>→</span></button>
            <div className="hero-benefits"><span>✓ Đề xuất nhiều nhà xe</span><span>✓ Xem rõ điểm đón/trả</span><span>✓ Giữ chỗ trong 10 phút</span></div>
          </div>
          <div className="hero-visual hero-photo-stage home-bus-photo-stage" role="img" aria-label="Xe khách du lịch trên đường">
            <div className="hero-photo-slides" aria-hidden="true">
              <img className="hero-photo-slide hero-photo-slide-bus home-bus-hero-image" src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=1400&q=85" alt="" fetchPriority="high" />
            </div>
            <div className="hero-photo-overlay" />
            <div className="hero-photo-top-chip"><span className="hero-live-dot" />Khám phá chuyến xe phù hợp</div>
            <div className="home-bus-photo-caption"><span>TRAVEL MINI</span><strong>Một hành trình, nhiều lựa chọn</strong><small>Chọn điểm đi, điểm đến và ngày khởi hành.</small></div>
          </div>
        </section>

        <section className="booking-section home-bus-booking" id="booking">
          <div className="booking-heading">
            <span className="section-eyebrow">LÊN KẾ HOẠCH</span>
            <h2>Bạn muốn đi đâu?</h2>
            <p>Nhập nơi xuất phát, địa điểm cần đến và ngày đi để tìm chuyến phù hợp.</p>
          </div>
          <div className="booking-card home-bus-booking-card">
            <div className="home-bus-form-intro"><span className="home-bus-form-icon" aria-hidden="true">⌕</span><div><h3>Tìm vé xe khách</h3><p>Hệ thống sẽ tìm chuyến theo điểm đi, điểm đến và ngày đi — không cần chọn hãng xe trước.</p></div></div>
            <form onSubmit={handleSearch} className="home-bus-search-form">
              <div className="booking-fields home-bus-fields">
                <LocationInput id="home-origin" label="Điểm xuất phát" placeholder="Ví dụ: TP. Hồ Chí Minh, Bến xe Miền Đông..." value={origin} selected={selectedOrigin} onChange={(value) => { setOrigin(value); setSelectedOrigin(null); setMessage(""); }} onSelect={(item) => { setSelectedOrigin(item); setOrigin(item.name); setMessage(""); }} />
                <LocationInput id="home-destination" label="Điểm đến" placeholder="Ví dụ: Hà Nội, Hội An, Bến xe Giáp Bát..." value={destination} selected={selectedDestination} onChange={(value) => { setDestination(value); setSelectedDestination(null); setMessage(""); }} onSelect={(item) => { setSelectedDestination(item); setDestination(item.name); setMessage(""); }} />
                <div className="booking-field home-date-field"><label htmlFor="home-departure-date">Ngày đi</label><div className="home-bus-input-wrap"><span className="home-bus-input-icon" aria-hidden="true">▦</span><input id="home-departure-date" type="date" min={localToday()} value={departureDate} onChange={(event) => { setDepartureDate(event.target.value); setMessage(""); }} required /></div><small className="home-bus-field-help">Chọn ngày bạn muốn khởi hành.</small></div>
              </div>
              {message && <p className="booking-error home-bus-error" role="alert">{message}</p>}
              <button type="submit" className="search-button home-bus-search-button"><span aria-hidden="true">⌕</span>Tìm chuyến xe<span aria-hidden="true">→</span></button>
            </form>
            <div className="home-bus-card-footnote"><span aria-hidden="true">●</span>Kết quả được đề xuất theo điểm đi, điểm đến, ngày đi và các tuyến xe đang được hỗ trợ.</div>
          </div>
        </section>

        <section className="services-section home-bus-features" id="services">
          <div className="section-heading"><span className="section-eyebrow">TRAVEL MINI CÓ GÌ?</span><h2>Tìm chuyến phù hợp, dễ dàng hơn</h2><p>So sánh thông tin chuyến và chọn chỗ trước khi đặt vé.</p></div>
          <div className="service-grid">{FEATURES.map((feature) => <article className="service-card" key={feature.title}><div className="service-icon" aria-hidden="true">{feature.icon}</div><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
        </section>

        <section className="steps-section home-bus-steps">
          <div className="section-heading"><span className="section-eyebrow">ĐƠN GIẢN VÀ NHANH CHÓNG</span><h2>Đặt vé chỉ với 3 bước</h2></div>
          <div className="steps-grid">{STEPS.map((step, index) => <div className="step-item" key={step.title}><span className="step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></div>)}</div>
          <div className="home-bus-final-cta"><div><strong>Sẵn sàng tìm chuyến xe?</strong><span>Nhập điểm đi, điểm đến và ngày đi để xem lựa chọn.</span></div><button type="button" className="hero-button" onClick={scrollToBooking}>Tìm vé xe khách <span aria-hidden="true">→</span></button></div>
        </section>
      </main>

      <footer className="home-footer home-bus-footer"><Link to="/" className="home-logo"><span aria-hidden="true"></span></Link><nav aria-label="Liên kết cuối trang"></nav><span>© {new Date().getFullYear()} Travel Mini</span></footer>
    </div>
  );
}
