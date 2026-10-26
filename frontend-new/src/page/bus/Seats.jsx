import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, durationText, formatDate, formatTime, formatVND, getSessionId } from "../../api";
import "../../css/bus.css";

export default function BusSeats() {
  const { tripId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const destination = query.get("destination") || "";
  const date = query.get("date") || "";
  const [trip, setTrip] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [hold, setHold] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshSeats() {
    const data = await api(`/api/bus/trips/${encodeURIComponent(tripId)}/seats`);
    setSeats(data.items || []);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const [tripData, seatData] = await Promise.all([
          api(`/api/bus/trips/${encodeURIComponent(tripId)}`),
          api(`/api/bus/trips/${encodeURIComponent(tripId)}/seats`),
        ]);
        if (!cancelled) { setTrip(tripData.trip); setSeats(seatData.items || []); }
      } catch (e) { if (!cancelled) setError(e.message || "Không tải được sơ đồ ghế."); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [tripId]);

  useEffect(() => {
    if (!hold?.expiresAt) { setSecondsLeft(0); return undefined; }
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [hold]);

  useEffect(() => {
    if (hold && new Date(hold.expiresAt).getTime() <= Date.now()) {
      setNotice("Thời gian giữ chỗ đã hết. Hãy kiểm tra sơ đồ trước khi chọn lại.");
      setHold(null); setSelectedSeats([]);
      refreshSeats().catch(() => {});
    }
  }, [secondsLeft, hold]);

  function toggleSeat(seat) {
    if (hold && secondsLeft > 0) return;
    if (seat.status !== "AVAILABLE") return;
    setSelectedSeats((prev) => prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : prev.length >= 8 ? prev : [...prev, seat.id]);
    setNotice("");
  }

  async function createHold() {
    if (!sessionStorage.getItem("access_token")) {
      setError("Đăng nhập trước khi giữ ghế để quản lý đơn đặt vé dễ hơn.");
      return;
    }
    if (!selectedSeats.length) { setError("Chọn ít nhất một ghế/giường trước."); return; }
    setWorking(true); setError(""); setNotice("");
    try {
      const data = await api("/api/bus/seat-holds", { method: "POST", body: JSON.stringify({ tripId, seatIds: selectedSeats, sessionId: getSessionId() }) });
      setHold(data.hold);
      await refreshSeats();
      setNotice("Đã giữ chỗ. Hoàn tất thông tin hành khách trước khi đồng hồ về 0.");
    } catch (e) {
      setError(e.message || "Không giữ được ghế.");
      await refreshSeats().catch(() => {});
    } finally { setWorking(false); }
  }

  async function releaseHold() {
    if (!hold?.id) return;
    setWorking(true);
    try {
      await api(`/api/bus/seat-holds/${encodeURIComponent(hold.id)}?sessionId=${encodeURIComponent(getSessionId())}`, { method: "DELETE" });
      setHold(null); setSelectedSeats([]); setNotice("Đã giải phóng chỗ."); await refreshSeats();
    } catch (e) { setError(e.message || "Không giải phóng được chỗ."); }
    finally { setWorking(false); }
  }

  function continueCheckout() {
    if (!hold?.id || secondsLeft <= 0) return;
    const params = new URLSearchParams({ holdId: hold.id, tripId, seats: hold.seatIds.join(","), expiresAt: hold.expiresAt });
    navigate(`/bus/checkout?${params.toString()}`);
  }

  const seatById = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats]);
  const selectedTotal = selectedSeats.length * Number(trip?.price || 0);
  const backQuery = new URLSearchParams({ destination, date });
  return <div className="bus-page">
    <header className="bus-header"><Link className="bus-brand" to="/"><span className="bus-brand-mark">TM</span><span><b>TRAVEL MINI</b><small>Đặt vé xe khách</small></span></Link><nav className="bus-nav"><Link to="/">Trang chủ</Link><Link className="active" to="/bus/search"></Link><Link to="/bus/bookings">Đơn của tôi</Link></nav><div className="bus-header-actions"><Link className="bus-button bus-button-outline" to="/profile">Tài khoản</Link></div></header>
    <main className="bus-seats-main"><Link className="bus-back-link" to={`/bus/results?${backQuery.toString()}`}>← Quay lại các chuyến xe</Link>
      {loading && <div className="bus-state-panel"><span className="bus-spinner"/><p>Đang tải thông tin chuyến và sơ đồ chỗ…</p></div>}
      {error && <div className="bus-alert bus-alert-error">{error}</div>}
      {!loading && trip && <>
        <section className="bus-seat-heading"><div><span className="bus-eyebrow">CHỌN CHỖ NGỒI</span><h1>{trip.provider}</h1><p>{trip.originCity} → {trip.destinationCity} · {formatDate(trip.departureAt)}</p></div><div className="bus-step-pill">Bước 2/4</div></section>
        <section className="bus-trip-summary-card"><div><span>Khởi hành</span><strong>{formatTime(trip.departureAt)}</strong><b>{trip.originName}</b><small>{trip.originCity}</small></div><div className="bus-summary-line"><span>{durationText(trip.durationMinutes)}</span><i/></div><div><span>Điểm trả</span><strong>{formatTime(trip.arrivalAt)}</strong><b>{trip.destinationName}</b><small>{trip.destinationCity}</small></div><div className="bus-summary-price"><small>Giá vé / người</small><strong>{formatVND(trip.price)}</strong><span>{trip.vehicleType}</span></div></section>
        <div className="bus-seats-layout"><section className="bus-seat-map-card"><div className="bus-seat-map-title"><div><h2>Sơ đồ ghế / giường</h2><p>Chọn đúng số chỗ theo số người đi. Mỗi chuyến áp dụng một giá vé, không có hạng vé.</p></div><div className="bus-seat-legend"><span><i className="available"/> Trống</span><span><i className="selected"/> Đã chọn</span><span><i className="unavailable"/> Đã giữ/đặt</span></div></div>
            <div className="bus-seat-driver">ĐẦU XE / LỐI ĐI</div><div className={`bus-seat-grid ${trip.vehicleType?.toLowerCase().includes("limousine") ? "is-limousine" : ""}`}>
              {seats.map((seat) => {
                const chosen = selectedSeats.includes(seat.id);
                const isMine = hold?.seatIds?.includes(seat.id) && secondsLeft > 0;
                const unavailable = seat.status !== "AVAILABLE" && !isMine;
                return <button type="button" key={seat.id} className={`bus-seat ${chosen || isMine ? "is-selected" : ""} ${unavailable ? "is-unavailable" : ""}`} disabled={unavailable || Boolean(hold && secondsLeft > 0)} onClick={() => toggleSeat(seat)} title={`${seat.seatNumber} · ${seat.status}`}><span>{seat.seatNumber}</span><small>{seat.seatType === "SLEEPER_SINGLE" ? "Giường đơn" : seat.seatType === "SLEEPER_DOUBLE" ? "Giường đôi" : "Ghế"}</small></button>;
              })}
            </div><div className="bus-seat-map-footnote">Chỗ đã giữ/đặt bởi người khác sẽ bị khóa. Tối đa 8 chỗ trong một lượt giữ.</div>
          </section>
          <aside className="bus-seat-order-card"><span className="bus-eyebrow">TÓM TẮT</span><h2>Chỗ đang chọn</h2><p>{selectedSeats.length} chỗ được chọn</p><div className="bus-selected-seat-list">{(hold?.seatIds || selectedSeats).map((id) => <span key={id}>{seatById.get(id)?.seatNumber || id}</span>)}</div><div className="bus-order-total"><span>Tạm tính</span><strong>{formatVND(hold ? hold.seatIds.length * Number(trip.price || 0) : selectedTotal)}</strong></div>
            {!hold && <button className="bus-button bus-button-primary bus-full-button" type="button" disabled={!selectedSeats.length || working} onClick={createHold}>{working ? "Đang giữ chỗ…" : "Giữ chỗ trong 10 phút"}</button>}
            {hold && secondsLeft > 0 && <><div className="bus-countdown"><small>Thời gian giữ chỗ còn</small><strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div><button className="bus-button bus-button-primary bus-full-button" type="button" onClick={continueCheckout}>Nhập thông tin hành khách →</button><button className="bus-text-button" type="button" disabled={working} onClick={releaseHold}>Hủy giữ chỗ</button></>}
            {hold && secondsLeft <= 0 && <button className="bus-button bus-button-primary bus-full-button" type="button" onClick={() => { setHold(null); setSelectedSeats([]); refreshSeats(); }}>Chọn lại chỗ</button>}
            {notice && <div className="bus-alert bus-alert-success">{notice}</div>}
          </aside></div>
      </>}
    </main><footer className="bus-footer">© {new Date().getFullYear()} Travel Mini · Chỗ được giữ tạm thời trong 10 phút.</footer>
  </div>;
}

