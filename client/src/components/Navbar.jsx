import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user) return null;

  // Đang lập đơn cho khách (chọn món / thanh toán): không chuyển sang chức năng khác, chỉ hoàn tất hoặc hủy đơn.
  const ordering = user.role !== 'admin' && /^\/orders\/(new|checkout)/.test(pathname);
  const Link = ({ to, end, children, className }) => (ordering
    ? <span className={`nav-locked ${className || ''}`} title="Đang lập đơn cho khách — hoàn tất thanh toán hoặc hủy đơn trước">{children}</span>
    : <NavLink to={to} end={end} className={className}>{children}</NavLink>);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
    <nav className={`navbar ${ordering ? 'navbar-locked' : ''}`}>
      <div className="navbar-brand">
        <img className="navbar-logo-img" src="/logo.webp" alt="Trạm Trà Chill" />
        <span className="brand-font">Trạm Trà Chill</span>
      </div>
      <div className="navbar-links">
        {user.role === 'admin' ? (
          <>
            <Link to="/dashboard">Bảng điều khiển</Link>
            <Link to="/orders">Đơn hàng</Link>
            <Link to="/menu">Thực đơn</Link>
            <Link to="/ingredients">Kho</Link>
            <Link to="/staff">Nhân viên</Link>
            <Link to="/tables">Bàn</Link>
          </>
        ) : (
          <>
            <Link to="/" end>Bán hàng</Link>
            <Link to="/dashboard">Bảng điều khiển</Link>
            <Link to="/tables">Bàn</Link>
            <Link to="/orders">Đơn hàng</Link>
            <Link to="/stock-check">Kho</Link>
          </>
        )}
      </div>
      <div className="navbar-user">
        <NotificationBell />
        <span>{user.fullName} ({user.role})</span>
        <Link to="/account" className="navbar-pwd">Đổi mật khẩu</Link>
        <button onClick={handleLogout} disabled={ordering} title={ordering ? 'Đang lập đơn cho khách' : undefined}>Đăng xuất</button>
      </div>
    </nav>
    {ordering && <div className="order-lock-banner">🔒 Đang lập đơn cho khách — hoàn tất thanh toán hoặc bấm “Hủy đơn” để chuyển sang chức năng khác.</div>}
    </>
  );
}
