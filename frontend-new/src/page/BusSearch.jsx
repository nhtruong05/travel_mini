import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { busApi } from "../config/busApi";
import "../css/bus-booking.css";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function BusSearch() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [selected, setSelected] = useState(null);
  const [travelDate, setTravelDate] = useState(localToday());
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = destination.trim();
    if (!focused || q.length < 1) { setSuggestions([]); setLoadingSuggestions(false); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const params = new URLSearchParams({ q, limit: "8" });
        const data = await busApi(`/api/bus/locations?${params.toString()}`);
        if (!cancelled) setSuggestions(data.items || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [destination, focused]);

  function submit(event) {
    event.preventDefault();
    setError("");
    if (!destination.trim()) { setError("Nhập địa điểm mà mày muốn đến."); return; }
    if (!travelDate) { setError("Chọn ngày đi trước đã."); return; }
    const query = new URLSearchParams({ destination: destination.trim(), date: travelDate });
    if (selected?.code) query.set("destinationCode", selected.code);
    navigate(`/bus/results?${query.toString()}`);
  }

  return (
    <div className="bus-page">
      <header className="bus-header">
        <Link className="bus-brand" to="/"> <span className="bus-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span></Link>
        <nav className="bus-nav"><Link to="/">Trang chủ</Link><Link className="active" to="/bus/search">Tìm vé xe</Link><Link to="/bus/bookings">Đơn của tôi</Link></nav>
        <div className="bus-header-actions">
          {sessionStorage.getItem("access_token") ? <Link className="bus-button bus-button-outline" to="/profile">Tài khoản</Link> : <Link className="bus-button bus-button-outline" to="/login">Đăng nhập</Link>}
        </div>
      </header>

      <main className="bus-search-main">
        <section className="bus-search-hero">
          <div className="bus-hero-copy">
            <span className="bus-eyebrow">TÌM CHUYẾN XE PHÙ HỢP</span>
            <h1>Mày muốn đi đâu?</h1>
            <p>Nhập điểm đến và ngày đi. Travel Mini sẽ tìm các chuyến phù hợp, đề xuất nhà xe và hiển thị chỗ còn trống.</p>
            <div className="bus-benefits"><span>✓ Không cần biết tên bến xe</span><span>✓ Đề xuất nhiều nhà xe</span><span>✓ Giữ chỗ trong 10 phút</span></div>
          </div>
          <div className="bus-search-card">
            <div className="bus-card-heading"><span className="bus-card-icon">⌕</span><div><h2>Tìm vé xe khách</h2><p>Chỉ cần điểm đến và ngày đi</p></div></div>
            <form onSubmit={submit} className="bus-search-form">
              <div className="bus-field bus-destination-field">
                <label htmlFor="bus-destination">Điểm muốn đến</label>
                <div className="bus-input-with-icon"><span>⌖</span><input id="bus-destination" value={destination} placeholder="Ví dụ: Hội An, Đà Nẵng, bến xe..." autoComplete="off" onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 140)} onChange={(event) => { setDestination(event.target.value); setSelected(null); }} required /><button type="button" className="bus-clear-input" aria-label="Xóa địa điểm" onClick={() => { setDestination(""); setSelected(null); }}>×</button></div>
                {selected && <div className="bus-selected-location">✓ {selected.name} <span>{selected.city}</span></div>}
                {focused && destination.trim() && <div className="bus-suggestions" role="listbox">
                  {loadingSuggestions && <div className="bus-suggestion-state">Đang tìm địa điểm…</div>}
                  {!loadingSuggestions && suggestions.map((item) => <button type="button" key={item.id || item.code} role="option" className="bus-suggestion" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelected(item); setDestination(item.name); setFocused(false); }}><span className="bus-suggestion-pin">⌖</span><span><b>{item.name}</b><small>{item.city}{item.type === "PLACE" ? " · Địa điểm tham khảo" : " · Bến xe"}</small></span></button>)}
                  {!loadingSuggestions && suggestions.length === 0 && <div className="bus-suggestion-state">Có thể tìm bằng tên địa điểm tự nhập.</div>}
                </div>}
                <small className="bus-field-help">Có thể nhập bến xe, thành phố hoặc một địa điểm cụ thể.</small>
              </div>
              <div className="bus-field">
                <label htmlFor="bus-date">Ngày đi</label>
                <div className="bus-input-with-icon"><span>▦</span><input id="bus-date" type="date" min={localToday()} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} required /></div>
              </div>
              {error && <div className="bus-alert bus-alert-error" role="alert">{error}</div>}
              <button className="bus-button bus-button-primary bus-search-submit" type="submit">Tìm chuyến xe <span>→</span></button>
            </form>
            <div className="bus-card-footnote"><span>●</span> Kết quả dựa trên tuyến xe và các bến/điểm trả đang được hỗ trợ.</div>
          </div>
        </section>

        <section className="bus-how-section"><div><span className="bus-eyebrow">3 BƯỚC ĐƠN GIẢN</span><h2>Đặt vé thuận tiện hơn</h2></div><div className="bus-how-grid"><article><span>01</span><h3>Nhập nơi muốn đến</h3><p>Không cần tự chọn nhà xe hoặc biết chính xác bến xe.</p></article><article><span>02</span><h3>Chọn chuyến phù hợp</h3><p>So sánh giờ chạy, giá vé, loại xe và chỗ còn trống.</p></article><article><span>03</span><h3>Chọn chỗ và đặt vé</h3><p>Giữ chỗ 10 phút, nhập hành khách và thanh toán.</p></article></div></section>
      </main>
      <footer className="bus-footer">© {new Date().getFullYear()} Travel Mini · Dữ liệu chuyến demo cần được thay bằng dữ liệu nhà xe thực tế.</footer>
    </div>
  );
}
