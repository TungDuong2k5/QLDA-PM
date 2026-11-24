const bcrypt = require('bcryptjs');
const { Employee, EmployeeShift, TimeLog, CheckinReminder, Shift } = require('../models');
const tc = require('../utils/timeclock');

// ---- Chống đoán mã PIN: sai 5 lần thì khóa nhân viên đó 5 phút (lưu trong bộ nhớ máy chủ) ----
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const fails = new Map(); // employeeId -> { count, until }

// Trả về chuỗi lỗi nếu không được phép; null nếu hợp lệ. Nhân viên chưa đặt PIN thì không đòi PIN.
async function checkPin(emp, pin) {
  if (!emp.pinHash) return null;
  const f = fails.get(emp.id);
  if (f && f.until > Date.now()) {
    return `Nhập sai PIN quá nhiều lần, thử lại sau ${Math.ceil((f.until - Date.now()) / 60000)} phút`;
  }
  if (pin && await bcrypt.compare(String(pin), emp.pinHash)) {
    fails.delete(emp.id);
    return null;
  }
  const count = (f?.count || 0) + 1;
  fails.set(emp.id, count >= MAX_FAILS ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 });
  return pin ? 'Mã PIN không đúng' : 'Vui lòng nhập mã PIN';
}

const findEmployee = (id) => Employee.findOne({ where: { id: Number(id) || 0, isActive: true } });
const labelOf = (slot) => tc.SLOTS[slot].label.toLowerCase();

function serializeLog(l) {
  return {
    id: l.id,
    slot: l.slot,
    checkInAt: l.checkInAt,
    checkOutAt: l.checkOutAt ?? null,
    lateMinutes: l.lateMinutes,
    latePenalty: l.latePenalty,
  };
}

// Nhân viên này có được check-in lúc này không? Trả về { slot } nếu được, hoặc { reason } nếu không.
//  - Chỉ check-in được vào ca ĐANG CHẠY; các ca còn lại (đã qua / chưa tới) không check-in được.
//  - Đang trong ca (chưa kết ca) hoặc đã làm ca này hôm nay thì không check-in lại.
//  - Hôm nay được xếp lịch ca khác (không phải ca đang chạy) thì chưa phải ca của họ. Không có lịch hôm nay: được làm thay ca đang chạy.
// Ca bán hàng trước vẫn đang mở (chưa kết ca) thì ca sau chưa được check-in: ca nào kết ra đó, ca sau mới vào.
// "Trước" = ca HÔM NAY mở ở khung giờ sớm hơn ca đang check-in. Ca mở từ ngày cũ không tính: ứng dụng chỉ
// hiện và kết được ca của hôm nay, nên chặn vì ca cũ sẽ khiến không ai gỡ được.
async function previousOpenShift(now, slot) {
  if (!slot) return null;
  const today = tc.fmtDate(now);
  const open = await Shift.findAll({ where: { status: 'open', businessDate: today }, order: [['openedAt', 'ASC']] });
  const prev = open.find((sh) => tc.SLOT_KEYS.indexOf(tc.shiftSlotOf(sh.openedAt)) < tc.SLOT_KEYS.indexOf(slot));
  if (!prev) return null;
  const sameDay = await Shift.findAll({ where: { businessDate: today } });
  return { id: prev.id, label: tc.shiftLabels(sameDay).get(prev.id), businessDate: today };
}
const blockMessage = (b, today) => `${b.label}${b.businessDate !== today ? ` (${b.businessDate.slice(8, 10)}/${b.businessDate.slice(5, 7)})` : ''} chưa kết ca — kết ca xong thì ca sau mới check-in được`;

// Ca bán hàng hôm nay còn mở (chưa kết ca) mà mở ở khung giờ của ca đang làm hoặc sớm hơn thì nhân viên chưa check-out được:
// kết ca xong mới check-out. Trả về danh sách ca mở hôm nay kèm khung giờ + nhãn để tra theo từng người.
async function openShiftsToday(now) {
  const today = tc.fmtDate(now);
  const sameDay = await Shift.findAll({ where: { businessDate: today } });
  const labels = tc.shiftLabels(sameDay);
  return sameDay.filter((sh) => sh.status === 'open').map((sh) => ({ id: sh.id, slot: tc.shiftSlotOf(sh.openedAt), label: labels.get(sh.id) }));
}
const checkoutBlocker = (openShifts, slot) => openShifts.find((sh) => tc.SLOT_KEYS.indexOf(sh.slot) <= tc.SLOT_KEYS.indexOf(slot)) || null;

function eligibility(now, planned, logs, blocker) {
  const slot = tc.checkinSlot(now);
  if (!slot) {
    return { reason: `Hiện không có ca nào để check-in (ca sáng mở check-in từ ${tc.hhmm(new Date(tc.slotStart(tc.fmtDate(now), 'morning').getTime() - tc.FIRST_SLOT_EARLY_MIN * 60000))}, ca tối kết thúc lúc ${tc.SLOTS.evening.end})` };
  }
  const open = logs.find((l) => !l.checkOutAt);
  if (open) return { reason: `Đã check-in ${labelOf(open.slot)} rồi`, slot };
  if (logs.some((l) => l.slot === slot)) return { reason: `Đã làm ${labelOf(slot)} hôm nay rồi`, slot };
  // Chỉ người có lịch làm việc hôm nay, và đúng ca đang chạy, mới được check-in.
  if (planned.length === 0) return { reason: 'Hôm nay không có lịch làm việc nên không check-in được — nhờ quản lý xếp lịch', slot };
  if (!planned.includes(slot)) {
    return { reason: `Hôm nay được xếp ${planned.map(labelOf).join(', ')} — hiện là ${labelOf(slot)} nên chưa check-in được`, slot };
  }
  if (blocker) return { reason: blockMessage(blocker, tc.fmtDate(now)), slot, blockedByShift: true };
  return { slot };
}

// Check-out: chỉ khi đã tới giờ tan ca của ca đang làm (giờ kết thúc ca); trước đó thì chưa được.
// Hết giờ nhưng ca bán hàng chưa kết thì vẫn chưa check-out được.
function checkoutState(now, openLog, blocker = null) {
  if (!openLog) return { can: false, endAt: null, reason: null };
  const endAt = tc.slotEnd(openLog.workDate, openLog.slot);
  if (now >= endAt && blocker) return { can: false, endAt, waitingShift: true, reason: `${blocker.label} chưa kết ca — kết ca xong thì mới check-out được` };
  if (now >= endAt) return { can: true, endAt, reason: null };
  return { can: false, endAt, reason: `Chưa đến giờ tan ca (${tc.SLOTS[openLog.slot].label.toLowerCase()} kết thúc lúc ${tc.SLOTS[openLog.slot].end})` };
}

// Danh sách nhân viên kèm trạng thái hôm nay: có lịch ca nào, đã check-in chưa, có được check-in lúc này không.
async function status(req, res) {
  const now = new Date();
  const today = tc.fmtDate(now);
  const employees = await Employee.findAll({ where: { isActive: true }, order: [['fullName', 'ASC']] });
  const logs = await TimeLog.findAll({ where: { workDate: today }, order: [['checkInAt', 'ASC']] });
  const plans = await EmployeeShift.findAll({ where: { workDate: today } });
  const reminders = await CheckinReminder.findAll({ where: { workDate: today, resolvedAt: null } });
  const slot = tc.checkinSlot(now);
  const blocker = await previousOpenShift(now, slot);
  const openShifts = await openShiftsToday(now);
  res.json({
    now,
    blockingShift: blocker ? { label: blocker.label, businessDate: blocker.businessDate } : null,
    date: today,
    checkinSlot: slot,
    // Hạn check-in đúng giờ của ca đang mở check-in (giờ bắt đầu + 10 phút); sau mốc này mỗi phút muộn phạt 1.000đ cho người có lịch.
    onTimeUntil: slot ? tc.onTimeDeadline(today, slot) : null,
    graceMinutes: tc.GRACE_MIN,
    latePenaltyPerMinute: tc.LATE_PENALTY_PER_MINUTE,
    slots: tc.SLOTS,
    undoWindowMinutes: tc.UNDO_WINDOW_MIN,
    employees: employees.map((e) => {
      const mine = logs.filter((l) => l.employeeId === e.id);
      const planned = tc.SLOT_KEYS.filter((s) => plans.some((p) => p.employeeId === e.id && p.slot === s));
      const open = mine.find((l) => !l.checkOutAt);
      const can = eligibility(now, planned, mine, blocker);
      const out = checkoutState(now, open, open ? checkoutBlocker(openShifts, open.slot) : null);
      // Ca có lịch đã qua giờ kết thúc mà chưa check-in: hiện "chưa check-in" và cho quầy nhắc quản lý.
      const missed = planned
        .filter((s) => tc.slotEnd(today, s) <= now && !mine.some((l) => l.slot === s))
        .map((s) => ({ slot: s, reminded: reminders.some((r) => r.employeeId === e.id && r.slot === s) }));
      return {
        id: e.id,
        fullName: e.fullName,
        hasPin: Boolean(e.pinHash),
        plannedSlots: planned,
        // Ca có lịch mà chưa tới giờ bắt đầu ("chưa đến giờ check-in").
        upcoming: planned.filter((s) => tc.slotStart(today, s) > now),
        missed,
        state: open ? 'in' : mine.length > 0 ? 'done' : 'out',
        canCheckin: !can.reason,
        waitingShift: Boolean(can.blockedByShift),
        reason: can.reason || null,
        canCheckout: out.can,
        checkoutAt: out.endAt,
        checkoutReason: out.reason,
        checkoutWaitingShift: Boolean(out.waitingShift),
        logs: mine.map(serializeLog),
      };
    }),
  });
}

// Check-in = nhân viên nhập mã PIN khi mở ca (hoặc khi đến muộn lúc ca đang mở). Chỉ vào được ca đang chạy.
async function checkin(req, res) {
  const emp = await findEmployee(req.body?.employeeId);
  if (!emp) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const pinError = await checkPin(emp, req.body?.pin);
  if (pinError) return res.status(403).json({ message: pinError });

  const now = new Date();
  const workDate = tc.fmtDate(now);
  const planned = (await EmployeeShift.findAll({ where: { employeeId: emp.id, workDate } })).map((p) => p.slot);
  const logs = await TimeLog.findAll({ where: { employeeId: emp.id, workDate } });
  const can = eligibility(now, planned, logs, await previousOpenShift(now, tc.checkinSlot(now)));
  if (can.reason) return res.status(400).json({ message: `${emp.fullName}: ${can.reason}` });

  const late = await tc.lateIfPlanned(emp.id, now, workDate, can.slot);
  const log = await TimeLog.create({
    employeeId: emp.id, workDate, slot: can.slot, checkInAt: now, lateMinutes: late.lateMinutes, latePenalty: late.latePenalty, autoMarked: false,
  });
  res.status(201).json({ ...serializeLog(log), planned: late.planned });
}

// Quầy bấm "Nhắc quản lý": nhân viên có lịch ca đó, ca đã qua mà chưa check-in. Quản lý thấy trên chuông thông báo.
async function remind(req, res) {
  const emp = await findEmployee(req.body?.employeeId);
  if (!emp) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const slot = req.body?.slot;
  if (!tc.SLOT_KEYS.includes(slot)) return res.status(400).json({ message: 'Ca không hợp lệ' });
  const now = new Date();
  const workDate = tc.fmtDate(now);
  const planned = await EmployeeShift.findOne({ where: { employeeId: emp.id, workDate, slot } });
  if (!planned) return res.status(400).json({ message: `${emp.fullName} không có lịch ${labelOf(slot)} hôm nay` });
  if (tc.slotEnd(workDate, slot) > now) return res.status(400).json({ message: `${labelOf(slot)} chưa kết thúc nên chưa nhắc được` });
  if (await TimeLog.findOne({ where: { employeeId: emp.id, workDate, slot } })) {
    return res.status(400).json({ message: `${emp.fullName} đã có chấm công ${labelOf(slot)}` });
  }
  const [row, created] = await CheckinReminder.findOrCreate({ where: { employeeId: emp.id, workDate, slot } });
  if (!created && row.resolvedAt) await row.update({ resolvedAt: null }); // quản lý đã bỏ qua nhưng quầy nhắc lại
  return res.status(201).json({ id: row.id, employeeId: emp.id, slot, workDate });
}

// Check-out = nhân viên nhập mã PIN khi tới giờ tan ca. Kết ca (đóng ca bán hàng) KHÔNG check-out hộ ai.
async function checkout(req, res) {
  const emp = await findEmployee(req.body?.employeeId);
  if (!emp) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const pinError = await checkPin(emp, req.body?.pin);
  if (pinError) return res.status(403).json({ message: pinError });

  const now = new Date();
  const log = await TimeLog.findOne({ where: { employeeId: emp.id, workDate: tc.fmtDate(now), checkOutAt: null }, order: [['checkInAt', 'DESC']] });
  if (!log) return res.status(400).json({ message: `${emp.fullName} chưa check-in (hoặc đã check-out rồi)` });
  const out = checkoutState(now, log, checkoutBlocker(await openShiftsToday(now), log.slot));
  if (!out.can) return res.status(400).json({ message: `${emp.fullName}: ${out.reason}` });
  await log.update({ checkOutAt: now });
  res.json({ ...serializeLog(log), workedMinutes: Math.max(0, Math.round((now - new Date(log.checkInAt)) / 60000)) });
}

// Hủy check-in nhầm: chỉ trong vài phút đầu và khi chưa check-out.
async function undo(req, res) {
  const emp = await findEmployee(req.body?.employeeId);
  if (!emp) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const pinError = await checkPin(emp, req.body?.pin);
  if (pinError) return res.status(403).json({ message: pinError });

  const now = new Date();
  const log = await TimeLog.findOne({ where: { employeeId: emp.id, workDate: tc.fmtDate(now), checkOutAt: null }, order: [['checkInAt', 'DESC']] });
  if (!log) return res.status(400).json({ message: 'Không có lần check-in nào đang mở để hủy' });
  if (now - new Date(log.checkInAt) > tc.UNDO_WINDOW_MIN * 60000) {
    return res.status(400).json({ message: `Chỉ hủy được trong ${tc.UNDO_WINDOW_MIN} phút đầu — hãy nhờ quản lý sửa` });
  }
  await log.destroy();
  res.status(204).send();
}

module.exports = { status, checkin, checkout, undo, remind };
