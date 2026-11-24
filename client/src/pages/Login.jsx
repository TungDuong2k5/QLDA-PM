import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { convertSolar2Lunar, lunarYearName } from '../utils/lunarCalendar';
import { SHOP_LOCATION, fetchCurrentWeather } from '../utils/weather';

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function WelcomeGreeting({ onContinue }) {
  const [weather, setWeather] = useState(undefined); // undefined = loading, null = failed
  const now = new Date();

  useEffect(() => {
    fetchCurrentWeather().then(setWeather).catch(() => setWeather(null));
  }, []);

  const [ld, lm, ly, leap] = convertSolar2Lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());

  return (
    <div className="welcome-greet-card">
      <div className="welcome-greet-logo-ring">
        <img className="welcome-greet-logo" src="/logo.webp" alt="" />
      </div>
      <h1 className="brand-font welcome-greet-title">Trạm Trà Chill xin chào!</h1>
      <p className="welcome-greet-sub">Chúc bạn ngày mới tốt lành ☕</p>

      <div className="calendar-sheet">
        <div className="calendar-sheet-ring" />
        <div className="calendar-sheet-month">Tháng {pad2(now.getMonth() + 1)} · {now.getFullYear()}</div>
        <div className="calendar-sheet-body">
          <div className="calendar-sheet-day">{pad2(now.getDate())}</div>
          <div className="calendar-sheet-weekday">{WEEKDAYS[now.getDay()]}</div>
          <div className="calendar-sheet-divider" />
          <div className="calendar-sheet-lunar">
            Âm lịch {ld}/{lm}{leap ? ' (nhuận)' : ''} · {lunarYearName(ly)}
          </div>
        </div>
      </div>

      <div className="welcome-weather-hero">
        <span className="welcome-weather-icon">
          {weather === undefined ? '⏳' : weather === null ? '🌡️' : weather.icon}
        </span>
        <div className="welcome-weather-text">
          <div className="welcome-weather-temp">{weather ? `${Math.round(weather.temperature)}°C` : '—'}</div>
          <div className="welcome-weather-label">
            {weather === undefined ? 'Đang lấy thời tiết...' : weather === null ? 'Không lấy được thời tiết' : weather.label}
          </div>
        </div>
      </div>

      <div className="welcome-greet-location">
        <span className="welcome-greet-icon">📍</span>
        <span>{SHOP_LOCATION.name}</span>
      </div>

      <button type="button" className="welcome-greet-continue" onClick={onContinue}>
        Vào hệ thống <span className="welcome-greet-arrow">→</span>
      </button>
    </div>
  );
}

export default function Login() {
  const [step, setStep] = useState('welcome');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    }
  }

  return (
    <div className="login-page">
      {step === 'welcome' ? (
        <WelcomeGreeting onContinue={() => setStep('form')} />
      ) : (
        <form className="login-card" onSubmit={handleSubmit}>
          <h1 className="brand-font"><img className="login-logo" src="/logo.webp" alt="" /> Trạm Trà Chill</h1>
          <label>
            Tên đăng nhập
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit">Đăng nhập</button>
          <p className="hint">Admin: admin / admin123 — Nhân viên: staff / staff123</p>
          <button type="button" className="link-back welcome-greet-back" onClick={() => setStep('welcome')}>
            &larr; Quay lại
          </button>
        </form>
      )}
    </div>
  );
}
