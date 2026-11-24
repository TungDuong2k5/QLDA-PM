// Quy tắc giờ giấc của lịch làm việc, check-in (nhập PIN lúc mở ca) và check-out (kết ca).

// Ba ca trong ngày.
const SLOTS = {
  morning: { label: 'Ca sáng', start: '07:30', end: '12:30' },
  afternoon: { label: 'Ca chiều', start: '12:30', end: '17:30' },
  evening: { label: 'Ca tối', start: '17:30', end: '22:30' },
};
const SLOT_KEYS = Object.keys(SLOTS);

const LATE_PENALTY_PER_MINUTE = 1000; // đi muộn: trừ 1.000đ mỗi phút
const GRACE_MIN = 10;                 // mỗi ca có tối đa 10 phút từ giờ bắt đầu để check-in; quá 10 phút mới tính muộn
const FIRST_SLOT_EARLY_MIN = 60;      // chưa có ca nào chạy (trước ca sáng): ca sáng mở check-in sớm 60 phút
const UNDO_WINDOW_MIN = 15;           // chỉ hủy check-in nhầm trong 15 phút đầu

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const slotStart = (workDate, slot) => new Date(`${workDate}T${SLOTS[slot].start}:00`);
const slotEnd = (workDate, slot) => new Date(`${workDate}T${SLOTS[slot].end}:00`);

// Ca đang chạy tại thời điểm `now` (giờ bắt đầu <= now < giờ kết thúc); không có ca nào chạy thì null.
function runningSlot(now) {
  const workDate = fmtDate(now);
  return SLOT_KEYS.find((s) => now >= slotStart(workDate, s) && now < slotEnd(workDate, s)) || null;
}

// Ca được phép check-in lúc này: CHỈ ca đang chạy (các ca còn lại không được check-in).
// Ngoại lệ duy nhất: trước ca sáng thì mở check-in sớm tối đa 60 phút cho ca sáng. Ngoài ra (sau 22:30...) là null.
function checkinSlot(now) {
  const running = runningSlot(now);
  if (running) return running;
  const workDate = fmtDate(now);
  const untilMorning = slotStart(workDate, 'morning').getTime() - now.getTime();
  if (untilMorning > 0 && untilMorning <= FIRST_SLOT_EARLY_MIN * 60000) return 'morning';
  return null;
}

// ---- Tên ca bán hàng theo KHUNG GIỜ lúc mở ca: sáng = Ca 1, chiều = Ca 2, tối = Ca 3 ----
// (không đánh số theo thứ tự mở trong ngày: mở lúc 14:52 là Ca 2 dù ca sáng không ai mở).
const SLOT_NUMBER = { morning: 1, afternoon: 2, evening: 3 };

// Khung giờ của một lần mở ca: trước 12:30 = sáng, trước 17:30 = chiều, còn lại = tối.
function shiftSlotOf(openedAt) {
  const d = new Date(openedAt);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 12 * 60 + 30) return 'morning';
  if (minutes < 17 * 60 + 30) return 'afternoon';
  return 'evening';
}

// Nhãn cho từng ca trong cùng một ngày: Map(id -> "Ca 2"). Mở lại nhiều lần trong cùng khung giờ thì thêm "(lần 2)".
function shiftLabels(shifts) {
  const sorted = [...shifts].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt) || a.id - b.id);
  const seen = {};
  const out = new Map();
  for (const sh of sorted) {
    const slot = shiftSlotOf(sh.openedAt);
    seen[slot] = (seen[slot] || 0) + 1;
    out.set(sh.id, `Ca ${SLOT_NUMBER[slot]}${seen[slot] > 1 ? ` (lần ${seen[slot]})` : ''}`);
  }
  return out;
}

// Giờ chót để check-in đúng giờ của một ca (giờ bắt đầu + 10 phút).
const onTimeDeadline = (workDate, slot) => new Date(slotStart(workDate, slot).getTime() + GRACE_MIN * 60000);

// Đi muộn: chỉ phạt khi nhân viên CÓ được xếp lịch ca đó. Có tối đa 10 phút từ giờ bắt đầu ca để check-in;
// quá 10 phút thì mỗi phút muộn (tính từ mốc 10 phút) phạt 1.000đ. Vào sớm hoặc trong 10 phút đầu: không phạt.
async function lateIfPlanned(employeeId, checkInAt, workDate, slot) {
  const { EmployeeShift } = require('../models');
  const planned = await EmployeeShift.findOne({ where: { employeeId, workDate, slot } });
  if (!planned) return { lateMinutes: 0, latePenalty: 0, planned: false };
  const diff = Math.floor((checkInAt.getTime() - slotStart(workDate, slot).getTime()) / 60000);
  const lateMinutes = Math.max(0, diff - GRACE_MIN);
  return { lateMinutes, latePenalty: lateMinutes * LATE_PENALTY_PER_MINUTE, planned: true };
}

module.exports = {
  SLOTS, SLOT_KEYS, LATE_PENALTY_PER_MINUTE, GRACE_MIN, FIRST_SLOT_EARLY_MIN, UNDO_WINDOW_MIN,
  pad, fmtDate, hhmm, slotStart, slotEnd, runningSlot, checkinSlot, onTimeDeadline, lateIfPlanned,
  shiftSlotOf, shiftLabels,
};
