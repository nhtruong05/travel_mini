import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../css/profile.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TM";
  return parts.slice(-2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function pickUser(payload) {
  const candidate = payload?.user || payload?.data?.user || payload?.data || payload;
  if (!candidate || typeof candidate !== "object") return null;
  return {
    name: candidate.name || candidate.full_name || candidate.fullName || candidate.username || "Người dùng Travel Mini",
    email: candidate.email || candidate.email_address || "Chưa cập nhật email",
    phone: candidate.phone || candidate.phone_number || candidate.phoneNumber || "Chưa cập nhật số điện thoại",
    role: candidate.role || candidate.accountType || "Khách hàng",
    createdAt: candidate.createdAt || candidate.created_at || candidate.createdDate || null,
  };
}

function formatDate(value) {
  if (!value) return "Thành viên Travel Mini";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Thành viên Travel Mini";
  return `Thành viên từ ${date.toLocaleDateString("vi-VN", { month: "long", year: "numeric" })}`;
}

function ProfileIcon({ name }) {
  const icons = {
    overview: "▦",
    person: "♙",
    bus: "▰",
    plane: "✈",
    train: "🚆",
    help: "?",
    shield: "✓",
    logout: "↪",
  };
  return <span className="tm-profile-icon" aria-hidden="true">{icons[name] || "•"}</span>;
}

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");

  const token = useMemo(() => sessionStorage.getItem("access_token"), []);

  const loadProfile = useCallback(async () => {
    const currentToken = sessionStorage.getItem("access_token");
    if (!currentToken) {
      setError("Phiên đăng nhập chưa có hoặc đã hết hạn. Vui lòng đăng nhập lại để xem hồ sơ.");
      setLoading(false);
      setUser(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : null;
      if (response.status === 401) {
        setError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.");
        setUser(null);
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || payload?.msg || "Không thể tải hồ sơ lúc này.");
      }
      const normalized = pickUser(payload);
      if (!normalized) throw new Error("Dữ liệu hồ sơ từ máy chủ chưa đúng định dạng.");
      setUser(normalized);
    } catch (err) {
      setError(err?.message || "Không thể kết nối máy chủ. Hãy kiểm tra Flask có đang chạy không.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("user");
    navigate("/login");
  };

  const scrollToDetails = () => {
    setActiveSection("personal");
    document.getElementById("tm-profile-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="tm-profile-page">
      <header className="tm-profile-header">
        <div className="tm-profile-header-inner">
          <Link className="tm-profile-brand" to="/" aria-label="Travel Mini trang chủ">
            <span className="tm-profile-brand-mark">✦</span>
            <span>TRAVEL <b>MINI</b></span>
          </Link>
          <nav className="tm-profile-topnav" aria-label="Điều hướng chính">
            <Link to="/">Trang chủ</Link>
            <Link to="/bus/search">Vé xe khách</Link>
            <Link to="/flight/search">Vé máy bay</Link>
            <Link to="/train/search">Vé tàu hỏa</Link>
          </nav>
          <div className="tm-profile-head-actions">
            <span className="tm-profile-secure"><ProfileIcon name="shield" /> Tài khoản an toàn</span>
            <button type="button" className="tm-profile-logout" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </div>
      </header>

      <main className="tm-profile-main">
        <section className="tm-profile-welcome">
          <div>
            <div className="tm-profile-breadcrumb"><Link to="/">Trang chủ</Link><span>/</span><span>Hồ sơ cá nhân</span></div>
            <p className="tm-profile-eyebrow">KHÔNG GIAN CỦA BẠN</p>
            <h1>Xin chào{user?.name ? `, ${user.name}` : " bạn"}!</h1>
            <p className="tm-profile-lead">Quản lý thông tin, theo dõi đặt chỗ và chuẩn bị cho hành trình tiếp theo.</p>
          </div>
          <div className="tm-profile-welcome-art" aria-hidden="true">
            <div className="tm-profile-art-sun" />
            <div className="tm-profile-art-cloud">✦</div>
            <div className="tm-profile-art-ticket"><span>TRAVEL MINI</span><strong>Let's go!</strong><small>YOUR NEXT JOURNEY</small></div>
          </div>
        </section>

        {error && (
          <div className={`tm-profile-alert ${user ? "tm-profile-alert-info" : "tm-profile-alert-error"}`} role="alert">
            <span className="tm-profile-alert-symbol">{user ? "i" : "!"}</span>
            <div><strong>{user ? "Thông báo" : "Chưa tải được hồ sơ"}</strong><p>{error}</p></div>
            {!user && <Link className="tm-profile-alert-link" to="/login">Đăng nhập</Link>}
          </div>
        )}

        <div className="tm-profile-layout">
          <aside className="tm-profile-sidebar">
            <div className="tm-profile-identity">
              <div className="tm-profile-avatar">{loading ? "…" : initials(user?.name)}</div>
              <div className="tm-profile-identity-text">
                <strong>{loading ? "Đang tải hồ sơ…" : user?.name || "Khách Travel Mini"}</strong>
                <span>{user?.email && user.email !== "Chưa cập nhật email" ? user.email : "Tài khoản của bạn"}</span>
              </div>
              <span className="tm-profile-member-tag">{user ? "MEMBER" : "GUEST"}</span>
            </div>
            <div className="tm-profile-nav-label">TÀI KHOẢN</div>
            <button type="button" className={`tm-profile-side-link ${activeSection === "overview" ? "is-active" : ""}`} onClick={() => { setActiveSection("overview"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ProfileIcon name="overview" /><span>Tổng quan</span><b>›</b></button>
            <button type="button" className={`tm-profile-side-link ${activeSection === "personal" ? "is-active" : ""}`} onClick={scrollToDetails}><ProfileIcon name="person" /><span>Thông tin cá nhân</span><b>›</b></button>
            <div className="tm-profile-nav-label tm-profile-nav-label-spaced">ĐẶT CHỖ CỦA TÔI</div>
            <Link className="tm-profile-side-link" to="/bus/bookings"><ProfileIcon name="bus" /><span>Vé xe khách</span><b>›</b></Link>
            <Link className="tm-profile-side-link" to="/flight/bookings"><ProfileIcon name="plane" /><span>Vé máy bay</span><b>›</b></Link>
            <Link className="tm-profile-side-link" to="/train/bookings"><ProfileIcon name="train" /><span>Vé tàu hỏa</span><b>›</b></Link>
            <div className="tm-profile-sidebar-help"><div className="tm-profile-help-icon">✧</div><strong>Sẵn sàng cho chuyến đi mới?</strong><p>Khám phá thêm lựa chọn và lên kế hoạch cho hành trình tiếp theo của bạn.</p><Link to="/">Khám phá ngay <span>→</span></Link></div>
          </aside>

          <div className="tm-profile-content">
            <section className="tm-profile-stats-grid" aria-label="Lối tắt tài khoản">
              <Link to="/bus/bookings" className="tm-profile-stat-card"><span className="tm-profile-stat-icon stat-blue"><ProfileIcon name="bus" /></span><span className="tm-profile-stat-copy"><strong>Vé xe khách</strong><small>Tra cứu chuyến đã đặt</small></span><span className="tm-profile-stat-arrow">↗</span></Link>
              <Link to="/flight/bookings" className="tm-profile-stat-card"><span className="tm-profile-stat-icon stat-sky"><ProfileIcon name="plane" /></span><span className="tm-profile-stat-copy"><strong>Vé máy bay</strong><small>Thông tin booking</small></span><span className="tm-profile-stat-arrow">↗</span></Link>
              <Link to="/train/bookings" className="tm-profile-stat-card"><span className="tm-profile-stat-icon stat-green"><ProfileIcon name="train" /></span><span className="tm-profile-stat-copy"><strong>Vé tàu hỏa</strong><small>Tra cứu vé tàu</small></span><span className="tm-profile-stat-arrow">↗</span></Link>
            </section>

            <section className="tm-profile-panel" id="tm-profile-details">
              <div className="tm-profile-panel-heading">
                <div><p className="tm-profile-eyebrow">HỒ SƠ CỦA BẠN</p><h2>Thông tin cá nhân</h2><p>Thông tin cơ bản gắn với tài khoản Travel Mini.</p></div>
                <button type="button" className="tm-profile-refresh" onClick={loadProfile} disabled={loading}><span className={loading ? "tm-profile-spin" : ""}>↻</span> Làm mới</button>
              </div>
              {loading ? (
                <div className="tm-profile-loading"><span className="tm-profile-spinner" /> Đang tải thông tin tài khoản…</div>
              ) : user ? (
                <div className="tm-profile-detail-grid">
                  <div className="tm-profile-detail-item"><span className="tm-profile-detail-icon">♙</span><div><small>Họ và tên</small><strong>{user.name}</strong></div></div>
                  <div className="tm-profile-detail-item"><span className="tm-profile-detail-icon">✉</span><div><small>Email</small><strong>{user.email}</strong></div></div>
                  <div className="tm-profile-detail-item"><span className="tm-profile-detail-icon">☎</span><div><small>Số điện thoại</small><strong>{user.phone}</strong></div></div>
                  <div className="tm-profile-detail-item"><span className="tm-profile-detail-icon">♧</span><div><small>Loại tài khoản</small><strong>{user.role}</strong></div></div>
                </div>
              ) : (
                <div className="tm-profile-empty"><div className="tm-profile-empty-icon">♙</div><strong>Đăng nhập để xem hồ sơ của bạn</strong><p>Thông tin tài khoản sẽ được lấy từ Travel Mini sau khi đăng nhập.</p><Link to="/login" className="tm-profile-primary-btn">Đăng nhập ngay</Link></div>
              )}
              {user && <div className="tm-profile-panel-foot"><span className="tm-profile-foot-check">✓</span><span>Thông tin được tải từ tài khoản của bạn. Không chia sẻ dữ liệu đăng nhập với người khác.</span></div>}
            </section>

            <section className="tm-profile-next-trip">
              <div className="tm-profile-next-icon">✈</div>
              <div className="tm-profile-next-copy"><span>HÀNH TRÌNH TIẾP THEO</span><h2>Mỗi chuyến đi đều bắt đầu từ một kế hoạch.</h2><p>Tìm lựa chọn phù hợp và quản lý booking tại một nơi.</p></div>
              <Link to="/" className="tm-profile-primary-btn">Lên kế hoạch <span>→</span></Link>
              <div className="tm-profile-next-decoration" aria-hidden="true">✦</div>
            </section>
          </div>
        </div>
        <div className="tm-profile-footer-note"><span>✦</span> Travel Mini · Cùng bạn đi xa hơn, theo cách dễ dàng hơn.</div>
      </main>
    </div>
  );
}

