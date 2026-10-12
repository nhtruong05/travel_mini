import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/home.css";

const TRANSPORTS = [
  { value: "PLANE", icon: "✈", label: "Máy bay" },
  { value: "TRAIN", icon: "🚆", label: "Tàu hỏa" },
  { value: "BUS", icon: "🚌", label: "Xe khách" },
];

const SERVICES = [
  {
    value: "PLANE",
    icon: "✈",
    title: "Vé máy bay",
    text: "Tìm chuyến bay theo tuyến đường, ngày đi và số hành khách.",
    cta: "Tìm vé máy bay",
  },
  {
    value: "TRAIN",
    icon: "🚆",
    title: "Vé tàu hỏa",
    text: "Lên kế hoạch di chuyển bằng tàu và lựa chọn hành trình.",
    cta: "Tìm vé tàu",
  },
  {
    value: "BUS",
    icon: "🚌",
    title: "Vé xe khách",
    text: "Tìm chuyến xe theo điểm đi, điểm đến và ngày khởi hành.",
    cta: "Tìm vé xe",
  },
];

const STEPS = [
  { title: "Tìm hành trình", text: "Nhập điểm đi, điểm đến và ngày khởi hành." },
  { title: "Chọn chuyến đi", text: "So sánh các lựa chọn phù hợp với nhu cầu." },
  {
    title: "Đặt vé và thanh toán",
    text: "Nhập thông tin hành khách và hoàn tất đặt vé.",
  },
];

export default function Home() {
  const navigate = useNavigate();

  const [transport, setTransport] = useState("PLANE");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [message, setMessage] = useState("");

  const isLoggedIn = Boolean(sessionStorage.getItem("access_token"));
  const today = new Date().toLocaleDateString("en-CA");

  function scrollToBooking(type) {
    if (type) setTransport(type);
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    window.location.href = "/";
  }

  function handleSearch(event) {
    event.preventDefault();
    setMessage("");

    if (!origin.trim() || !destination.trim()) {
      setMessage("Vui lòng nhập điểm đi và điểm đến.");
      return;
    }

    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setMessage("Điểm đi và điểm đến không được trùng nhau.");
      return;
    }

    if (!departureDate) {
      setMessage("Vui lòng chọn ngày khởi hành.");
      return;
    }

    const params = new URLSearchParams({
      transport,
      origin: origin.trim(),
      destination: destination.trim(),
      date: departureDate,
      passengers,
    });

    navigate(`/search?${params.toString()}`);
  }

  return (
    <div className="home-page">
      {/* ===== HEADER ===== */}
      <header className="home-header">
        <Link to="/" className="home-logo">
          <span className="logo-symbol">✈</span>
          <span>TRAVEL MINI</span>
        </Link>

        <nav className="home-nav">
          <Link to="/" className="nav-active">Trang chủ</Link>
          <a href="#booking">Tìm vé</a>
          <a href="#services">Dịch vụ</a>
        </nav>

        <div className="home-account">
          {isLoggedIn ? (
            <>
              <Link to="/profile" className="account-button">
                Hồ sơ cá nhân
              </Link>
              <button type="button" className="logout-button" onClick={handleLogout}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="login-link">Đăng nhập</Link>
              <Link to="/register" className="register-button">Đăng ký</Link>
            </>
          )}
        </div>
      </header>

      <main>
        {/* ===== HERO ===== */}
        <section className="home-hero">
          <div className="hero-content">
            <span className="hero-tag">✦ Đồng hành cùng mọi hành trình</span>

            <h1>
              Hành trình của bạn,
              <br />
              <span>bắt đầu từ đây.</span>
            </h1>

            <p>
              Tìm kiếm và đặt vé máy bay, tàu hỏa, xe khách nhanh chóng trên
              một nền tảng duy nhất.
            </p>

            <button
              type="button"
              className="hero-button"
              onClick={() => scrollToBooking()}
            >
              Tìm chuyến đi ngay <span>→</span>
            </button>

            <div className="hero-benefits">
              <span>✓ Dễ dàng tìm vé</span>
              <span>✓ Đặt vé thuận tiện</span>
              <span>✓ Quản lý hành trình</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="visual-circle">
              <div className="visual-sun" />
              <div className="visual-cloud cloud-one">☁</div>
              <div className="visual-cloud cloud-two">☁</div>
              <div className="visual-plane">✈</div>
              <div className="visual-mountain mountain-one" />
              <div className="visual-mountain mountain-two" />
              <div className="visual-ground" />
              <div className="visual-route">✦ EXPLORE MORE</div>
            </div>
          </div>
        </section>

        {/* ===== TÌM VÉ ===== */}
        <section className="booking-section" id="booking">
          <div className="booking-heading">
            <span className="section-eyebrow">Lên kế hoạch</span>
            <h2>Bạn muốn đi đâu?</h2>
            <p>Tìm hành trình phù hợp với kế hoạch của bạn.</p>
          </div>

          <div className="booking-card">
            <div className="transport-tabs" role="tablist">
              {TRANSPORTS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={transport === item.value}
                  className={transport === item.value ? "transport-active" : ""}
                  onClick={() => setTransport(item.value)}
                >
                  <span>{item.icon}</span> {item.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSearch}>
              <div className="booking-fields">
                <div className="booking-field">
                  <label htmlFor="origin">Điểm khởi hành</label>
                  <input
                    id="origin"
                    type="text"
                    placeholder="Ví dụ: Hà Nội"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    required
                  />
                </div>

                <div className="booking-field">
                  <label htmlFor="destination">Điểm đến</label>
                  <input
                    id="destination"
                    type="text"
                    placeholder="Ví dụ: Đà Nẵng"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                </div>

                <div className="booking-field">
                  <label htmlFor="departureDate">Ngày khởi hành</label>
                  <input
                    id="departureDate"
                    type="date"
                    min={today}
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    required
                  />
                </div>

                <div className="booking-field">
                  <label htmlFor="passengers">Hành khách</label>
                  <select
                    id="passengers"
                    value={passengers}
                    onChange={(e) => setPassengers(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} người</option>
                    ))}
                  </select>
                </div>
              </div>

              {message && (
                <p className="booking-error" role="alert">{message}</p>
              )}

              <button type="submit" className="search-button">
                <span>⌕</span> Tìm chuyến đi
              </button>
            </form>
          </div>
        </section>

        {/* ===== DỊCH VỤ ===== */}
        <section className="services-section" id="services">
          <div className="section-heading">
            <span className="section-eyebrow">Travel Mini có gì?</span>
            <h2>Mọi hành trình, một điểm đến</h2>
            <p>
              Lựa chọn phương tiện phù hợp và chủ động lên kế hoạch cho chuyến
              đi của bạn.
            </p>
          </div>

          <div className="service-grid">
            {SERVICES.map((s) => (
              <article className="service-card" key={s.value}>
                <div className="service-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <button
                  type="button"
                  className="service-link"
                  onClick={() => scrollToBooking(s.value)}
                >
                  {s.cta} →
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* ===== 3 BƯỚC ===== */}
        <section className="steps-section">
          <div className="section-heading">
            <span className="section-eyebrow">Đơn giản và nhanh chóng</span>
            <h2>Đặt vé chỉ với 3 bước</h2>
          </div>

          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div className="step-item" key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="home-footer">
        <Link to="/" className="home-logo">
          <span className="logo-symbol">✈</span>
          <span>TRAVEL MINI</span>
        </Link>
        <p>Khám phá hành trình, kết nối mọi điểm đến.</p>
        <span>© 2026 Travel Mini</span>
      </footer>
    </div>
  );
}
