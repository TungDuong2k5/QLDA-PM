// Địa điểm cố định của quán — đổi tên và tọa độ ở đây nếu quán ở thành phố khác.
export const SHOP_LOCATION = { name: 'Hà Nội', latitude: 21.0285, longitude: 105.8542 };

// Mã thời tiết WMO (chuẩn Open-Meteo) -> nhãn tiếng Việt + biểu tượng.
const WEATHER_CODE_MAP = {
  0: { label: 'Trời quang', icon: '☀️' },
  1: { label: 'Ít mây', icon: '🌤️' },
  2: { label: 'Mây rải rác', icon: '⛅' },
  3: { label: 'Nhiều mây', icon: '☁️' },
  45: { label: 'Sương mù', icon: '🌫️' },
  48: { label: 'Sương mù đóng băng', icon: '🌫️' },
  51: { label: 'Mưa phùn nhẹ', icon: '🌦️' },
  53: { label: 'Mưa phùn', icon: '🌦️' },
  55: { label: 'Mưa phùn dày', icon: '🌧️' },
  56: { label: 'Mưa phùn lạnh', icon: '🌧️' },
  57: { label: 'Mưa phùn lạnh dày', icon: '🌧️' },
  61: { label: 'Mưa nhỏ', icon: '🌧️' },
  63: { label: 'Mưa vừa', icon: '🌧️' },
  65: { label: 'Mưa to', icon: '🌧️' },
  66: { label: 'Mưa lạnh', icon: '🌧️' },
  67: { label: 'Mưa lạnh to', icon: '🌧️' },
  71: { label: 'Tuyết nhẹ', icon: '🌨️' },
  73: { label: 'Tuyết vừa', icon: '🌨️' },
  75: { label: 'Tuyết to', icon: '❄️' },
  77: { label: 'Mưa đá nhỏ', icon: '❄️' },
  80: { label: 'Mưa rào nhẹ', icon: '🌦️' },
  81: { label: 'Mưa rào', icon: '🌧️' },
  82: { label: 'Mưa rào mạnh', icon: '⛈️' },
  85: { label: 'Mưa tuyết nhẹ', icon: '🌨️' },
  86: { label: 'Mưa tuyết to', icon: '🌨️' },
  95: { label: 'Dông', icon: '⛈️' },
  96: { label: 'Dông kèm mưa đá', icon: '⛈️' },
  99: { label: 'Dông kèm mưa đá to', icon: '⛈️' },
};

export function describeWeatherCode(code) {
  return WEATHER_CODE_MAP[code] || { label: 'Không rõ', icon: '🌡️' };
}

// Open-Meteo: miễn phí, không cần API key.
export async function fetchCurrentWeather(location = SHOP_LOCATION) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&timezone=Asia%2FBangkok`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không lấy được dữ liệu thời tiết');
  const data = await res.json();
  const cw = data.current_weather;
  if (!cw) throw new Error('Không có dữ liệu thời tiết hiện tại');
  return { temperature: cw.temperature, windspeed: cw.windspeed, ...describeWeatherCode(cw.weathercode) };
}
