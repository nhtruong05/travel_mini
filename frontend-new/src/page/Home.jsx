import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/home.css";

const MODES = [
  { id: "bus", label: "Vé xe khách", icon: "🚌", note: "Nhiều điểm đón trả" },
  { id: "flight", label: "Vé máy bay", icon: "✈️", note: "Hành trình đường dài" },
  { id: "train", label: "Vé tàu hỏa", icon: "🚆", note: "Khám phá đường sắt" },
];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function readApi(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Không thể tải dữ liệu (${response.status}).`);
  }
  return data;
}

function LocationAutocomplete({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSelect,
}) {
  const [focused, setFocused] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 2) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "8" });
        const data = await readApi(`/api/bus/locations?${params.toString()}`);
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, focused]);

  return (
    <div className="tm-field tm-location-field">
      <label htmlFor={id}>{label}</label>
      <div className="tm-input-wrap">
        <span className="tm-field-icon" aria-hidden="true">⌖</span>
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        {value && (
          <button
            type="button"
            className="tm-clear-input"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange("")}
            aria-label={`Xóa ${label.toLowerCase()}`}
          >
            ×
          </button>
        )}
      </div>
      {focused && value.trim().length >= 2 && (
        <div className="tm-suggestions" role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>
          {loading && <div className="tm-suggestion-message">Đang tìm địa điểm…</div>}
          {!loading && items.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="tm-suggestion"
              key={item.id || item.code || item.name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(item);
                setFocused(false);
              }}
            >
              <span className="tm-suggestion-icon" aria-hidden="true">⌖</span>
              <span className="tm-suggestion-copy">
                <strong>{item.name}</strong>
                <small>{[item.city, item.type === "PLACE" ? "Địa điểm" : item.type ? "Bến xe" : ""].filter(Boolean).join(" · ")}</small>
              </span>
            </button>
          ))}
          {!loading && items.length === 0 && (
            <div className="tm-suggestion-message">Không có gợi ý. Bạn vẫn có thể dùng địa điểm đã nhập.</div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled, icon = "⌖" }) {
  return (
    <label className="tm-field">
      <span>{label}</span>
      <div className="tm-input-wrap">
        <span className="tm-field-icon" aria-hidden="true">{icon}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required>
          {options.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("bus");
  const [date, setDate] = useState(localToday());
  const [passengers, setPassengers] = useState("1");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originLocation, setOriginLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [airports, setAirports] = useState([]);
  const [stations, setStations] = useState([]);
  const [flightOrigin, setFlightOrigin] = useState("SGN");
  const [flightDestination, setFlightDestination] = useState("HAN");
  const [trainOrigin, setTrainOrigin] = useState("SGN");
  const [trainDestination, setTrainDestination] = useState("DAN");
  const [trainType, setTrainType] = useState("ALL");
  const [apiErrors, setApiErrors] = useState({ flight: "", train: "" });
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(sessionStorage.getItem("access_token")));
  const [copiedCoupon, setCopiedCoupon] = useState("");

  useEffect(() => {
    let alive = true;
    readApi("/api/flights/airports")
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setAirports(list);
        if (list.length) {
          setFlightOrigin((old) => list.some((x) => x.code === old) ? old : list[0].code);
          setFlightDestination((old) => list.some((x) => x.code === old) ? old : (list.find((x) => x.code !== list[0].code)?.code || list[0].code));
        }
        setApiErrors((old) => ({ ...old, flight: "" }));
      })
      .catch((error) => {
        if (alive) setApiErrors((old) => ({ ...old, flight: error.message || "Không tải được danh sách sân bay." }));
      });

    readApi("/api/trains/stations")
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setStations(list);
        if (list.length) {
          setTrainOrigin((old) => list.some((x) => x.code === old) ? old : list[0].code);
          setTrainDestination((old) => list.some((x) => x.code === old) ? old : (list.find((x) => x.code !== list[0].code)?.code || list[0].code));
        }
        setApiErrors((old) => ({ ...old, train: "" }));
      })
      .catch((error) => {
        if (alive) setApiErrors((old) => ({ ...old, train: error.message || "Không tải được danh sách ga." }));
      });

    return () => { alive = false; };
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage("");
  }

  async function copyCoupon(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCoupon(code);
      window.setTimeout(() => setCopiedCoupon((current) => current === code ? "" : current), 2200);
    } catch {
      window.prompt("Sao chép mã giảm giá này:", code);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    setIsLoggedIn(false);
    navigate("/", { replace: true });
  }

  function swapPlaces() {
    if (mode === "bus") {
      setOrigin(destination);
      setDestination(origin);
      setOriginLocation(destinationLocation);
      setDestinationLocation(originLocation);
    } else if (mode === "flight") {
      setFlightOrigin(flightDestination);
      setFlightDestination(flightOrigin);
    } else {
      setTrainOrigin(trainDestination);
      setTrainDestination(trainOrigin);
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    setMessage("");
    const today = localToday();
    if (!date || date < today) {
      setMessage("Ngày khởi hành phải từ hôm nay trở đi.");
      return;
    }

    if (mode === "bus") {
      const from = origin.trim();
      const to = destination.trim();
      if (!from || !to) {
        setMessage("Vui lòng nhập cả điểm đi và điểm đến.");
        return;
      }
      if (from.toLocaleLowerCase("vi") === to.toLocaleLowerCase("vi")) {
        setMessage("Điểm đi và điểm đến phải khác nhau.");
        return;
      }
      const params = new URLSearchParams({ origin: from, destination: to, date, passengers });
      if (originLocation?.code) params.set("originCode", originLocation.code);
      if (destinationLocation?.code) params.set("destinationCode", destinationLocation.code);
      navigate(`/bus/results?${params.toString()}`);
      return;
    }

    if (mode === "flight") {
      if (apiErrors.flight) {
        setMessage("Không tải được danh sách sân bay. Hãy kiểm tra Flask và dữ liệu demo.");
        return;
      }
      if (!flightOrigin || !flightDestination) {
        setMessage("Hãy chọn sân bay đi và sân bay đến.");
        return;
      }
      if (flightOrigin === flightDestination) {
        setMessage("Sân bay đi và sân bay đến phải khác nhau.");
        return;
      }
      const params = new URLSearchParams({ origin: flightOrigin, destination: flightDestination, date, passengers });
      navigate(`/flight/results?${params.toString()}`);
      return;
    }

    if (apiErrors.train) {
      setMessage("Không tải được danh sách ga. Hãy kiểm tra Flask và dữ liệu demo.");
      return;
    }
    if (!trainOrigin || !trainDestination) {
      setMessage("Hãy chọn ga đi và ga đến.");
      return;
    }
    if (trainOrigin === trainDestination) {
      setMessage("Ga đi và ga đến phải khác nhau.");
      return;
    }
    const params = new URLSearchParams({ origin: trainOrigin, destination: trainDestination, date, trainType, passengers });
    navigate(`/train/results?${params.toString()}`);
  }

  const airportOptions = [
    { code: "", label: "Chọn sân bay" },
    ...airports.map((item) => ({ code: item.code, label: `${item.city} (${item.code}) — ${item.name}` })),
  ];
  const stationOptions = [
    { code: "", label: "Chọn ga tàu" },
    ...stations.map((item) => ({ code: item.code, label: `${item.name} — ${item.city}` })),
  ];

  return (
    <div className="tm-home">
      <header className="tm-header">
        <Link to="/" className="tm-brand" aria-label="Travel Mini - Trang chủ">
          <span className="tm-brand-mark" aria-hidden="true">✦</span>
          <span>TRAVEL <b>MINI</b></span>
        </Link>

        <nav className="tm-header-nav" aria-label="Điều hướng chính">
          <Link className="tm-nav-current" to="/">Trang chủ</Link>
          <Link to="/bus/search">Vé xe khách</Link>
          <Link to="/flight/search">Vé máy bay</Link>
          <Link to="/train/search">Vé tàu hỏa</Link>
        </nav>

        <div className="tm-account-actions">
          {isLoggedIn ? (
            <>
              <Link className="tm-account-button" to="/profile">Hồ sơ cá nhân</Link>
              <button className="tm-logout-button" type="button" onClick={handleLogout}>Đăng xuất</button>
            </>
          ) : (
            <>
              <Link className="tm-account-button" to="/login">Đăng nhập</Link>
              <Link className="tm-logout-button tm-register-button" to="/register">Đăng ký</Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="tm-hero">
          <div className="tm-hero-shade" />
          <div className="tm-hero-inner">
            <span className="tm-hero-eyebrow"><span className="tm-hero-dot" /> TRAVEL MINI · MỘT NƠI, NHIỀU HÀNH TRÌNH</span>
            <h1>Mỗi hành trình,<br /><span>bắt đầu từ đây.</span></h1>
            <p>Tìm vé xe khách, máy bay và tàu hỏa trong một trải nghiệm đơn giản.</p>
          </div>
        </section>

        <section className="tm-search-section" aria-label="Tìm kiếm hành trình">
          <div className="tm-search-panel">
            <div className="tm-tabs" role="tablist" aria-label="Chọn phương tiện">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === item.id}
                  className={`tm-tab ${mode === item.id ? "is-active" : ""}`}
                  onClick={() => switchMode(item.id)}
                >
                  <span className="tm-tab-icon" aria-hidden="true">{item.icon}</span>
                  <span className="tm-tab-label">{item.label}</span>
                  <span className="tm-tab-note">{item.note}</span>
                </button>
              ))}
            </div>

            <div className="tm-panel-intro">
              <div>
                <span className="tm-panel-kicker">LÊN KẾ HOẠCH</span>
                <h2>{mode === "bus" ? "Tìm chuyến xe phù hợp" : mode === "flight" ? "Bay đến nơi bạn muốn" : "Khám phá hành trình đường sắt"}</h2>
                <p>{mode === "bus" ? "Nhập nơi khởi hành, điểm đến và ngày đi." : mode === "flight" ? "Chọn sân bay đi, sân bay đến và ngày khởi hành." : "Chọn ga đi, ga đến và loại tàu mong muốn."}</p>
              </div>
              <span className="tm-demo-pill">Dữ liệu demo</span>
            </div>

            <form className="tm-search-form" onSubmit={handleSearch}>
              {mode === "bus" && (
                <>
                  <LocationAutocomplete
                    id="tm-bus-origin"
                    label="Điểm khởi hành"
                    placeholder="Thành phố hoặc bến xe đi"
                    value={origin}
                    onChange={(value) => { setOrigin(value); setOriginLocation(null); }}
                    onSelect={(item) => { setOrigin(item.name); setOriginLocation(item); }}
                  />
                  <button className="tm-swap-button" type="button" onClick={swapPlaces} title="Đổi điểm đi và điểm đến" aria-label="Đổi điểm đi và điểm đến">⇄</button>
                  <LocationAutocomplete
                    id="tm-bus-destination"
                    label="Điểm đến"
                    placeholder="Thành phố hoặc bến xe đến"
                    value={destination}
                    onChange={(value) => { setDestination(value); setDestinationLocation(null); }}
                    onSelect={(item) => { setDestination(item.name); setDestinationLocation(item); }}
                  />
                </>
              )}

              {mode === "flight" && (
                <>
                  <SelectField label="Sân bay đi" value={flightOrigin} onChange={setFlightOrigin} options={airportOptions} disabled={!airports.length} icon="✈" />
                  <button className="tm-swap-button" type="button" onClick={swapPlaces} title="Đổi sân bay" aria-label="Đổi sân bay">⇄</button>
                  <SelectField label="Sân bay đến" value={flightDestination} onChange={setFlightDestination} options={airportOptions} disabled={!airports.length} icon="✈" />
                </>
              )}

              {mode === "train" && (
                <>
                  <SelectField label="Ga đi" value={trainOrigin} onChange={setTrainOrigin} options={stationOptions} disabled={!stations.length} icon="🚉" />
                  <button className="tm-swap-button" type="button" onClick={swapPlaces} title="Đổi ga" aria-label="Đổi ga">⇄</button>
                  <SelectField label="Ga đến" value={trainDestination} onChange={setTrainDestination} options={stationOptions} disabled={!stations.length} icon="🚉" />
                </>
              )}

              <label className="tm-field tm-date-field">
                <span>Ngày khởi hành</span>
                <div className="tm-input-wrap">
                  <span className="tm-field-icon" aria-hidden="true">▦</span>
                  <input type="date" min={localToday()} value={date} onChange={(event) => setDate(event.target.value)} required />
                </div>
              </label>

              <label className="tm-field tm-passenger-field">
                <span>Hành khách</span>
                <div className="tm-input-wrap">
                  <span className="tm-field-icon" aria-hidden="true">♙</span>
                  <select value={passengers} onChange={(event) => setPassengers(event.target.value)}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => <option key={number} value={String(number)}>{number} hành khách</option>)}
                  </select>
                </div>
              </label>

              {mode === "train" && (
                <label className="tm-field tm-train-type-field">
                  <span>Loại tàu</span>
                  <div className="tm-input-wrap">
                    <span className="tm-field-icon" aria-hidden="true">🚄</span>
                    <select value={trainType} onChange={(event) => setTrainType(event.target.value)}>
                      <option value="ALL">Tất cả</option>
                      <option value="STANDARD">Tàu hỏa</option>
                      <option value="HIGH_SPEED_DEMO">Tàu cao tốc (demo)</option>
                    </select>
                  </div>
                </label>
              )}

              {message && <p className="tm-form-message" role="alert">{message}</p>}
              {mode === "flight" && apiErrors.flight && <p className="tm-form-message" role="alert">{apiErrors.flight} Hãy kiểm tra Flask và dữ liệu sân bay demo.</p>}
              {mode === "train" && apiErrors.train && <p className="tm-form-message" role="alert">{apiErrors.train} Hãy kiểm tra Flask và dữ liệu ga demo.</p>}

              <div className="tm-form-footer">
                <p><span aria-hidden="true">✓</span> Không cần thanh toán để tìm kiếm · Giá và lịch trình là dữ liệu mô phỏng.</p>
                <button type="submit" className="tm-search-button">
                  <span aria-hidden="true">⌕</span> Tìm chuyến {mode === "bus" ? "xe" : mode === "flight" ? "bay" : "tàu"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="tm-promotions" aria-labelledby="tm-promotions-title">
          <div className="tm-promotions-heading">
            <div>
              <span className="tm-panel-kicker">ƯU ĐÃI DÀNH CHO BẠN</span>
              <h2 id="tm-promotions-title">Mã giảm giá cho người dùng mới</h2>
              <p>Chọn mã ưu đãi và sao chép để dùng khi tính năng khuyến mãi được bật.</p>
            </div>
            <span className="tm-promo-demo-label">Ưu đãi demo</span>
          </div>

          <div className="tm-coupon-grid">
            <article className="tm-coupon-card tm-coupon-blue">
              <div className="tm-coupon-main">
                <span className="tm-coupon-icon" aria-hidden="true">✈</span>
                <div className="tm-coupon-copy">
                  <strong>Giảm đến 75.000đ</strong>
                  <span>Cho hành trình đầu tiên · minh họa</span>
                </div>
                <span className="tm-coupon-info" title="Mã minh họa, chưa tự động áp dụng vào giá vé">i</span>
              </div>
              <div className="tm-coupon-footer">
                <code>TMWELCOME75</code>
                <button type="button" onClick={() => copyCoupon("TMWELCOME75")}>
                  {copiedCoupon === "TMWELCOME75" ? "Đã sao chép ✓" : "Sao chép"}
                </button>
              </div>
            </article>

            <article className="tm-coupon-card tm-coupon-indigo">
              <div className="tm-coupon-main">
                <span className="tm-coupon-icon" aria-hidden="true">🚌</span>
                <div className="tm-coupon-copy">
                  <strong>Giảm đến 10%</strong>
                  <span>Cho chuyến xe khách · minh họa</span>
                </div>
                <span className="tm-coupon-info" title="Mã minh họa, chưa tự động áp dụng vào giá vé">i</span>
              </div>
              <div className="tm-coupon-footer">
                <code>TMBUS10</code>
                <button type="button" onClick={() => copyCoupon("TMBUS10")}>
                  {copiedCoupon === "TMBUS10" ? "Đã sao chép ✓" : "Sao chép"}
                </button>
              </div>
            </article>

            <article className="tm-coupon-card tm-coupon-teal">
              <div className="tm-coupon-main">
                <span className="tm-coupon-icon" aria-hidden="true">🚆</span>
                <div className="tm-coupon-copy">
                  <strong>Giảm đến 50.000đ</strong>
                  <span>Cho hành trình đường sắt · minh họa</span>
                </div>
                <span className="tm-coupon-info" title="Mã minh họa, chưa tự động áp dụng vào giá vé">i</span>
              </div>
              <div className="tm-coupon-footer">
                <code>TMTRAIN50</code>
                <button type="button" onClick={() => copyCoupon("TMTRAIN50")}>
                  {copiedCoupon === "TMTRAIN50" ? "Đã sao chép ✓" : "Sao chép"}
                </button>
              </div>
            </article>
          </div>

          <div className="tm-promo-banners" aria-label="Khám phá ưu đãi Travel Mini">
            <article className="tm-promo-banner tm-promo-banner-flight">
              <div className="tm-promo-banner-shape" aria-hidden="true">✈</div>
              <span className="tm-promo-banner-kicker">ĐI XA THẬT DỄ</span>
              <h3>Khám phá hành trình mới</h3>
              <p>Ưu đãi minh họa cho vé máy bay</p>
              <Link to="/flight/search" className="tm-promo-banner-link">Tìm chuyến bay →</Link>
            </article>
            <article className="tm-promo-banner tm-promo-banner-train">
              <div className="tm-promo-banner-shape" aria-hidden="true">🚄</div>
              <span className="tm-promo-banner-kicker">CHUYẾN ĐI THẢNH THƠI</span>
              <h3>Đi dọc những miền đất</h3>
              <p>Khám phá đường sắt với dữ liệu demo</p>
              <Link to="/train/search" className="tm-promo-banner-link">Tìm vé tàu →</Link>
            </article>
            <article className="tm-promo-banner tm-promo-banner-bus">
              <div className="tm-promo-banner-shape" aria-hidden="true">🚌</div>
              <span className="tm-promo-banner-kicker">LINH HOẠT MỖI NGÀY</span>
              <h3>Một điểm đến, nhiều lựa chọn</h3>
              <p>So sánh chuyến xe và chọn chỗ phù hợp</p>
              <Link to="/bus/search" className="tm-promo-banner-link">Tìm vé xe →</Link>
            </article>
          </div>
          <p className="tm-promotions-disclaimer">Các mã và ưu đãi ở đây là dữ liệu minh họa cho giao diện; hiện chưa tự động giảm giá trong đơn đặt vé.</p>
        </section>

        <section className="tm-benefits" aria-label="Lợi ích của Travel Mini">
          <div className="tm-benefit-item"><span className="tm-benefit-icon">⌕</span><div><strong>Tìm kiếm dễ dàng</strong><small>Chọn phương tiện và hành trình ở một nơi.</small></div></div>
          <div className="tm-benefit-item"><span className="tm-benefit-icon">⇄</span><div><strong>So sánh lựa chọn</strong><small>Xem các chuyến và giá vé mô phỏng.</small></div></div>
          <div className="tm-benefit-item"><span className="tm-benefit-icon">▣</span><div><strong>Quản lý đặt chỗ</strong><small>Tra cứu booking riêng theo từng phương tiện.</small></div></div>
        </section>
      </main>

      <footer className="tm-footer">
        <Link to="/" className="tm-brand"><span className="tm-brand-mark" aria-hidden="true">✦</span><span>TRAVEL <b>MINI</b></span></Link>
        <p>Đặt vé xe khách, máy bay và tàu hỏa.</p>
        <div className="tm-footer-links"><Link to="/bus/bookings">Đơn xe khách</Link><Link to="/flight/bookings">Đơn máy bay</Link><Link to="/train/bookings">Đơn tàu hỏa</Link></div>
      </footer>
    </div>
  );
}

