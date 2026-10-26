import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { busApi, durationText, formatDate, formatTime, formatVND } from "../config/busApi";
import "../css/bus-booking.css";

export default function BusResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const destination = query.get("destination") || "";
  const destinationCode = query.get("destinationCode") || "";
  const date = query.get("date") || "";
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("recommended");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [time, setTime] = useState("");
  const [provider, setProvider] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { setPage(1); }, [destination, destinationCode, date, sort, minPrice, maxPrice, time, provider, vehicleType]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!destination || !date) { setError("Thiếu điểm đến hoặc ngày đi. Hãy tìm lại chuyến."); setItems([]); setLoading(false); return; }
      setLoading(true); setError("");
      const params = new URLSearchParams({ destination, date, page: String(page), limit: "10", sort });
      if (destinationCode) params.set("destinationCode", destinationCode);
      if (minPrice !== "") params.set("minPrice", minPrice);
      if (maxPrice !== "") params.set("maxPrice", maxPrice);
      if (time) params.set("time", time);
      if (provider.trim()) params.set("provider", provider.trim());
      if (vehicleType) params.set("vehicleType", vehicleType);
      try {
        const data = await busApi(`/api/bus/trips?${params.toString()}`);
        if (!cancelled) { setItems(data.items || []); setPagination(data.pagination || { page: 1, limit: 10, total: 0, pages: 0 }); }
      } catch (e) {
        if (!cancelled) { setItems([]); setPagination({ page: 1, limit: 10, total: 0, pages: 0 }); setError(e.message || "Không tìm được chuyến xe."); }
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [destination, destinationCode, date, page, sort, minPrice, maxPrice, time, provider, vehicleType]);

  function openTrip(trip) {
    const params = new URLSearchParams({ date, destination, destinationCode: destinationCode || "" });
    navigate(`/bus/trips/${encodeURIComponent(trip.id)}/seats?${params.toString()}`);
  }
  function resetFilters() { setSort("recommended"); setMinPrice(""); setMaxPrice(""); setTime(""); setProvider(""); setVehicleType(""); setPage(1); }

  return <div className="bus-page">
    <header className="bus-header"><Link className="bus-brand" to="/"><span className="bus-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span></Link><nav className="bus-nav"><Link to="/">Trang chủ</Link><Link className="active" to="/bus/search">Tìm vé xe</Link><Link to="/bus/bookings">Đơn của tôi</Link></nav><div className="bus-header-actions"><Link className="bus-button bus-button-outline" to={sessionStorage.getItem("access_token") ? "/profile" : "/login"}>{sessionStorage.getItem("access_token") ? "Tài khoản" : "Đăng nhập"}</Link></div></header>
    <main className="bus-results-main">
      <Link className="bus-back-link" to="/bus/search">← Đổi địa điểm hoặc ngày đi</Link>
      <section className="bus-results-heading"><div><span className="bus-eyebrow">KẾT QUẢ TÌM KIẾM</span><h1>Nhà xe và chuyến phù hợp</h1><p>Điểm muốn đến: <b>{destination}</b> <span>·</span> Ngày đi: <b>{formatDate(`${date}T12:00:00`)}</b></p></div><div className="bus-result-count">{loading ? "Đang tìm…" : `${pagination.total} chuyến phù hợp`}</div></section>
      <div className="bus-results-layout">
        <aside className="bus-filter-panel"><div className="bus-filter-title"><h2>Lọc chuyến xe</h2><button type="button" onClick={resetFilters}>Xóa lọc</button></div>
          <label className="bus-filter-field">Sắp xếp<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recommended">Đề xuất phù hợp</option><option value="price">Giá thấp đến cao</option><option value="departure">Khởi hành sớm</option><option value="duration">Thời lượng ngắn</option></select></label>
          <div className="bus-price-filter"><span>Khoảng giá (VND)</span><div><input aria-label="Giá thấp nhất" type="number" min="0" placeholder="Từ" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} /><input aria-label="Giá cao nhất" type="number" min="0" placeholder="Đến" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></div></div>
          <label className="bus-filter-field">Giờ khởi hành<select value={time} onChange={(e) => setTime(e.target.value)}><option value="">Tất cả thời gian</option><option value="morning">Sáng (05–12h)</option><option value="afternoon">Chiều (12–17h)</option><option value="evening">Tối (17–21h)</option><option value="night">Đêm (21–05h)</option></select></label>
          <label className="bus-filter-field">Nhà xe<input type="text" placeholder="Tên nhà xe" value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
          <label className="bus-filter-field">Loại xe<select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}><option value="">Tất cả loại xe</option><option value="Xe giường nằm đơn">Giường nằm đơn</option><option value="Xe giường nằm đôi">Giường nằm đôi</option><option value="Limousine">Limousine</option></select></label>
          <div className="bus-filter-note">Travel Mini đề xuất chuyến dựa trên mức phù hợp của điểm đến, chỗ còn trống và thông tin chuyến.</div>
        </aside>
        <section className="bus-trip-list" aria-live="polite">
          {loading && <div className="bus-state-panel"><span className="bus-spinner"/><b>Đang tìm chuyến xe…</b><p>Đang đối chiếu ngày đi, điểm trả và chỗ còn trống.</p></div>}
          {!loading && error && <div className="bus-state-panel bus-state-error"><h2>Không thể tải kết quả</h2><p>{error}</p><Link className="bus-button bus-button-primary" to="/bus/search">Tìm lại</Link></div>}
          {!loading && !error && !items.length && <div className="bus-state-panel"><span className="bus-empty-symbol">⌕</span><h2>Chưa tìm thấy chuyến phù hợp</h2><p>Thử nhập tên bến xe gần khu vực hơn hoặc chọn ngày khác.</p><Link className="bus-button bus-button-primary" to="/bus/search">Đổi tìm kiếm</Link></div>}
          {!loading && !error && items.map((trip) => <article className="bus-trip-card" key={trip.id}>
            <div className="bus-trip-card-top"><div className="bus-provider-avatar">{trip.providerLogoText || trip.provider?.slice(0, 2) || "TM"}</div><div className="bus-provider-info"><b>{trip.provider}</b><span>{trip.vehicleType}</span></div>{trip.destinationMatch?.type === "NEARBY" && <span className="bus-nearby-badge">Đến khu vực lân cận</span>}</div>
            <div className="bus-trip-route"><div className="bus-trip-stop"><strong>{formatTime(trip.departureAt)}</strong><b>{trip.originName}</b><small>{trip.originCity}</small></div><div className="bus-trip-duration"><small>{durationText(trip.durationMinutes)}</small><div><i/><span>→</span></div><small>Điểm trả</small></div><div className="bus-trip-stop bus-trip-stop-destination"><strong>{formatTime(trip.arrivalAt)}</strong><b>{trip.destinationName}</b><small>{trip.destinationCity}</small></div></div>
            {trip.destinationMatch?.type === "NEARBY" && <div className="bus-match-note">ⓘ {trip.destinationMatch.note}</div>}
            <div className="bus-trip-card-bottom"><div className="bus-trip-meta"><span>▦ {formatDate(trip.departureAt)}</span><span>♧ {trip.availableSeats} chỗ còn</span><span>● {trip.stops === 0 ? "Chạy thẳng" : `${trip.stops} điểm dừng`}</span></div><div className="bus-trip-price"><small>Giá vé / khách</small><strong>{formatVND(trip.price)}</strong><button className="bus-button bus-button-primary" type="button" onClick={() => openTrip(trip)}>Chọn chuyến <span>→</span></button></div></div>
          </article>)}
          {!loading && !error && pagination.pages > 1 && <div className="bus-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Trước</button><span>Trang {page} / {pagination.pages}</span><button type="button" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Tiếp →</button></div>}
        </section>
      </div>
    </main><footer className="bus-footer">© {new Date().getFullYear()} Travel Mini · Kiểm tra chính xác điểm đón/trả trước khi thanh toán.</footer>
  </div>;
}
