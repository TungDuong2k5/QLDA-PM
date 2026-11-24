import { useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Tờ lịch chọn ngày. Ngày có dữ liệu (marked) bấm được và hiện nhãn nhỏ (VD doanh thu); ngày khác mờ đi.
//  marked:   { 'YYYY-MM-DD': 'nhãn nhỏ' }
//  today:    'YYYY-MM-DD' (đánh dấu vòng tròn, không chọn được trừ khi có trong marked)
//  selected: ngày đang chọn
export default function DayCalendar({ marked, today, selected, onSelect }) {
  const dates = Object.keys(marked).sort();
  const todayMonth = (today || new Date().toISOString()).slice(0, 7);
  const firstMonth = dates.length > 0 && dates[0].slice(0, 7) < todayMonth ? dates[0].slice(0, 7) : todayMonth;
  const [month, setMonth] = useState((selected || dates[dates.length - 1] || today || todayMonth).slice(0, 7));

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // thứ 2 là cột đầu
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const shift = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => shift(-1)} disabled={month <= firstMonth} aria-label="Tháng trước">‹</button>
        <strong>Tháng {pad(m)}/{y}</strong>
        <button type="button" className="cal-nav" onClick={() => shift(1)} disabled={month >= todayMonth} aria-label="Tháng sau">›</button>
      </div>
      <div className="cal-grid cal-week">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid cal-body" key={month}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} className="cal-empty" />;
          const date = `${month}-${pad(day)}`;
          const has = Object.prototype.hasOwnProperty.call(marked, date);
          const cls = ['cal-day', has ? 'has' : '', date === selected ? 'sel' : '', date === today ? 'today' : ''].filter(Boolean).join(' ');
          return (
            <button key={date} type="button" className={cls} disabled={!has} onClick={() => onSelect(date)} title={has ? marked[date] : 'Không có dữ liệu'}>
              <span className="cal-num">{day}</span>
              {has && marked[date] && <small>{marked[date]}</small>}
            </button>
          );
        })}
      </div>
      <p className="cal-legend"><i className="cal-dot" /> Ngày có dữ liệu — bấm vào để xem</p>
    </div>
  );
}
