import "../css/profile.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = "http://127.0.0.1:5000/api/auth";

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      const token = sessionStorage.getItem("access_token");

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            sessionStorage.removeItem("access_token");
            navigate("/login", { replace: true });
            return;
          }

          throw new Error(
            data.message || "Không thể tải hồ sơ cá nhân."
          );
        }

        // API có thể trả về { user: {...} } hoặc trực tiếp thông tin user
        const profile = data.user ?? data;

        setUser(profile);
      } catch (err) {
        setError(
          err.message || "Không thể kết nối đến máy chủ."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [navigate]);

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <main className="profile-page">
        <div className="profile-card">
          <p>Đang tải thông tin tài khoản...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="profile-page">
        <div className="profile-card">
          <h1>Không tải được hồ sơ</h1>
          <p className="profile-error">{error}</p>

          <button onClick={() => window.location.reload()}>
            Thử lại
          </button>

          <button
            className="profile-secondary"
            onClick={handleLogout}
          >
            Đăng nhập lại
          </button>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <div className="profile-logo">✈ TRAVEL MINI</div>

        <div className="profile-avatar">
          {(user.name || "U").charAt(0).toUpperCase()}
        </div>

        <h1>Hồ sơ cá nhân</h1>
        <p className="profile-subtitle">
          Thông tin tài khoản của bạn
        </p>

        <div className="profile-info">
          <div className="profile-row">
            <span>Họ và tên</span>
            <strong>{user.name || "Chưa cập nhật"}</strong>
          </div>

          <div className="profile-row">
            <span>Email</span>
            <strong>{user.email || "Chưa cập nhật"}</strong>
          </div>

          {/* <div className="profile-row">
            <span>Vai trò</span>
            <strong className="profile-role">
              {user.role || "CUSTOMER"}
            </strong>
          </div> */}
        </div>

        <button
          className="profile-logout"
          onClick={handleLogout}
        >
          Đăng xuất
        </button>

      </section>
    </main>
  );
}