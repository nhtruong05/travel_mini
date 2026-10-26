import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../css/train.css';

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

function parseApiResponse(response) {
  return response.text().then((text) => {
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status}). Kiểm tra Flask và Vite proxy.`);
    }
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || `Không thể tìm chuyến tàu (HTTP ${response.status}).`);
    }
    return payload;
  });
}

function durationLabel(minutes) {
  const duration = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  return mins ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

function trainTypeKey(trip) {
  return String(trip?.trainType || '').toUpperCase() === 'HIGH_SPEED_DEMO' ? 'HIGH_SPEED_DEMO' : 'STANDARD';
}

export default function TrainResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const origin = query.get('origin') || '';
  const destination = query.get('destination') || '';
  const travelDate = query.get('date') || '';
  const passengerCount = Math.max(1, Math.min(8, Number(query.get('passengers') || 1)));
  const requestedType = query.get('trainType') || 'ALL';

  const [items, setItems] = useState([]);
  const [originCity, setOriginCity] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [modeFilter, setModeFilter] = useState(requestedType === 'ALL' ? 'ALL' : requestedType);
  const [sortBy, setSortBy] = useState('recommended');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch(`/api/trains/search?${query.toString()}`)
      .then(parseApiResponse)
      .then((data) => {
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setOriginCity(data.origin || '');
        setDestinationCity(data.destination || '');
      })
      .catch((err) => {
        if (active) setError(err.message || 'Không tải được kết quả tìm tàu.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [query]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((trip) => modeFilter === 'ALL' || trainTypeKey(trip) === modeFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === 'price') return Number(a.basePrice || 0) - Number(b.basePrice || 0);
      if (sortBy === 'duration') return Number(a.durationMinutes || 0) - Number(b.durationMinutes || 0);
      if (sortBy === 'departure') return String(a.departureTime || '').localeCompare(String(b.departureTime || ''));
      return String(a.departureTime || '').localeCompare(String(b.departureTime || '')) || Number(a.basePrice || 0) - Number(b.basePrice || 0);
    });
  }, [items, modeFilter, sortBy]);

  function selectTrip(trip) {
    navigate(`/train/checkout?trainCode=${encodeURIComponent(trip.trainCode)}&passengers=${passengerCount}`);
  }

  return (
    <main className="rail-wrap rail-results-page">
      <header className="rail-results-nav">
        <Link to="/" className="rail-results-brand"><span className="rail-results-brand-icon">🚆</span> TRAVEL MINI</Link>
        <nav>
          <Link to="/train/search">Tìm tàu</Link>
          <Link to="/train/bookings">Tra cứu vé</Link>
        </nav>
      </header>

      <div className="rail-results-breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><Link to="/train/search">Tìm tàu hỏa</Link><span>›</span><span>Kết quả</span></div>

      <section className="rail-results-summary">
        <div className="rail-results-summary-route">
          <div className="rail-results-city">
            <span>GA KHỞI HÀNH</span>
            <strong>{originCity || origin || 'Ga đi'}</strong>
            <small>{origin}</small>
          </div>
          <div className="rail-results-route-arrow" aria-hidden="true"><span></span>🚆<span></span></div>
          <div className="rail-results-city">
            <span>GA ĐẾN</span>
            <strong>{destinationCity || destination || 'Ga đến'}</strong>
            <small>{destination}</small>
          </div>
        </div>
        <div className="rail-results-summary-meta">
          <span><b>Ngày đi</b>{travelDate || 'Chưa chọn ngày'}</span>
          <span><b>Hành khách</b>{passengerCount} người</span>
          <Link to="/train/search" className="rail-results-edit">✎ Sửa tìm kiếm</Link>
        </div>
      </section>

      <div className="rail-results-heading-row">
        <div>
          <div className="rail-results-eyebrow">TRAVEL MINI RAIL</div>
          <h1>Kết quả tìm tàu</h1>
          <p>So sánh giờ chạy, thời gian di chuyển và giá vé trước khi chọn chuyến.</p>
        </div>
        <div className="rail-results-count">{loading ? 'Đang tìm…' : `${filteredItems.length} chuyến phù hợp`}</div>
      </div>

      <section className="rail-results-promo" aria-label="Ưu đãi demo">
        <span className="rail-results-promo-icon">%</span>
        <div><strong>Đừng quên mã giảm giá</strong><p>Dùng <b>TMWELCOME75</b> để giảm 75.000đ hoặc <b>TMTRAIN50</b> để giảm 50.000đ ở bước thanh toán nếu đơn đủ điều kiện.</p></div>
        <span className="rail-results-demo-pill">ƯU ĐÃI DEMO</span>
      </section>

      <div className="rail-results-toolbar">
        <div className="rail-results-filters" aria-label="Lọc loại tàu">
          <button type="button" className={modeFilter === 'ALL' ? 'is-active' : ''} onClick={() => setModeFilter('ALL')}>Tất cả tàu</button>
          <button type="button" className={modeFilter === 'STANDARD' ? 'is-active' : ''} onClick={() => setModeFilter('STANDARD')}>🚆 Tàu hỏa</button>
          <button type="button" className={modeFilter === 'HIGH_SPEED_DEMO' ? 'is-active' : ''} onClick={() => setModeFilter('HIGH_SPEED_DEMO')}>⚡ Tàu cao tốc (DEMO)</button>
        </div>
        <label className="rail-results-sort">Sắp xếp
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="recommended">Khởi hành sớm</option>
            <option value="price">Giá thấp trước</option>
            <option value="duration">Thời gian ngắn nhất</option>
            <option value="departure">Giờ khởi hành</option>
          </select>
        </label>
      </div>

      {loading && <div className="rail-results-state"><span className="rail-results-spinner" />Đang tìm chuyến phù hợp với hành trình của bạn…</div>}
      {!loading && error && <div className="rail-results-state rail-results-state-error"><strong>Không tải được kết quả</strong><p>{error}</p><button className="rail-results-primary" onClick={() => window.location.reload()}>Thử lại</button></div>}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="rail-results-empty"><span>🚉</span><h2>Chưa tìm thấy chuyến tàu phù hợp</h2><p>Thử đổi ngày khởi hành hoặc chọn loại tàu khác.</p><Link className="rail-results-primary" to="/train/search">Sửa tìm kiếm</Link></div>
      )}

      {!loading && !error && filteredItems.length > 0 && <div className="rail-results-list">
        {filteredItems.map((trip) => {
          const isHighSpeed = trainTypeKey(trip) === 'HIGH_SPEED_DEMO';
          const tripTotal = Number(trip.basePrice || 0) * passengerCount;
          return (
            <article className="rail-results-trip-card" key={trip.trainCode}>
              <div className="rail-results-trip-main">
                <div className="rail-results-trip-operator">
                  <div className={`rail-results-operator-icon ${isHighSpeed ? 'is-fast' : ''}`}>{isHighSpeed ? '⚡' : '🚆'}</div>
                  <div><strong>{trip.operator || 'Đường sắt mô phỏng'}</strong><span>{trip.serviceNumber || trip.trainCode}</span></div>
                </div>
                <span className={`rail-results-type-badge ${isHighSpeed ? 'is-fast' : ''}`}>{trip.trainTypeLabel || (isHighSpeed ? 'Tàu cao tốc (DEMO)' : 'Tàu hỏa (DEMO)')}</span>
                <div className="rail-results-timeline">
                  <div className="rail-results-time-point"><strong>{trip.departureTime || '--:--'}</strong><span>{trip.originCode}</span><small>{trip.originName}</small></div>
                  <div className="rail-results-duration"><small>{durationLabel(trip.durationMinutes)}</small><div className="rail-results-line"><i></i></div><span>{isHighSpeed ? 'Cao tốc · DEMO' : 'Đường sắt · DEMO'}</span></div>
                  <div className="rail-results-time-point is-destination"><strong>{trip.arrivalTime || '--:--'}</strong><span>{trip.destinationCode}</span><small>{trip.destinationName}</small></div>
                </div>
                <div className="rail-results-trip-meta"><span>📅 {trip.departureDate}</span><span>♙ Còn {trip.availableSeats} chỗ</span><span>✓ Dữ liệu mô phỏng</span></div>
              </div>
              <aside className="rail-results-trip-price">
                <span className="rail-results-price-caption">Giá từ / người</span>
                <strong>{money(trip.basePrice)}</strong>
                {passengerCount > 1 && <small>{passengerCount} người · từ {money(tripTotal)}</small>}
                <button type="button" className="rail-results-primary" onClick={() => selectTrip(trip)}>Chọn chuyến <span>→</span></button>
                <small className="rail-results-price-note">Hạng chỗ và giá cuối cùng chọn ở bước tiếp theo.</small>
              </aside>
            </article>
          );
        })}
      </div>}

      <footer className="rail-results-disclaimer">Thông tin chuyến tàu, giờ chạy, giá vé, số chỗ và dịch vụ tàu cao tốc trên trang này là dữ liệu demo phục vụ đồ án, không phải thông tin khai thác thực tế.</footer>
    </main>
  );
}

