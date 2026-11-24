const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Employee, EmployeeShift, TimeLog, CheckinReminder } = require('../models');
const tc = require('../utils/timeclock');

const { SLOTS, SLOT_KEYS, pad } = tc;
const fmt = tc.fmtDate;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidDate(s) {
  if (!DATE_RE.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && fmt(d) === s;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // thứ Hai = 0
  d.setDate(d.getDate() - dow);
  return fmt(d);
}

const thisMonth = () => fmt(new Date()).slice(0, 7);

function cleanPhone(raw) {
  const p = String(raw ?? '').trim();
  return p || null;
}

function serialize(e, shiftCount = 0) {
  return {
    id: e.id,
    fullName: e.fullName,
    phone: e.phone,
    startDate: e.startDate,
    isActive: e.isActive,
    hasPin: Boolean(e.pinHash),
    shiftCount,
  };
}

// ======================= Hồ sơ nhân viên =======================

// Danh sách nhân viên kèm số ca đã chấm công (check-in thật) trong tháng (mặc định tháng này).
async function list(req, res) {
  const month = MONTH_RE.test(String(req.query.month || '')) ? String(req.query.month) : thisMonth();
  const employees = await Employee.findAll({ order: [['isActive', 'DESC'], ['fullName', 'ASC']] });
  const rows = await TimeLog.findAll({
    where: { workDate: { [Op.between]: [`${month}-01`, `${month}-31`] } },
    attributes: ['employeeId'],
  });
  const counts = {};
  rows.forEach((r) => { counts[r.employeeId] = (counts[r.employeeId] || 0) + 1; });
  res.json({ month, employees: employees.map((e) => serialize(e, counts[e.id] || 0)) });
}

async function create(req, res) {
  const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
  if (!fullName) return res.status(400).json({ message: 'Vui lòng nhập họ tên nhân viên' });
  const startDate = req.body?.startDate ? String(req.body.startDate) : fmt(new Date());
  if (!isValidDate(startDate)) return res.status(400).json({ message: 'Ngày vào làm không hợp lệ' });
  const duplicate = await Employee.findOne({ where: { fullName, isActive: true } });
  if (duplicate) return res.status(409).json({ message: 'Đã có nhân viên đang làm trùng tên này' });
  const e = await Employee.create({ fullName, phone: cleanPhone(req.body?.phone), startDate });
  return res.status(201).json(serialize(e));
}

async function update(req, res) {
  const e = await Employee.findByPk(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const patch = {};
  if (req.body?.fullName !== undefined) {
    const fullName = String(req.body.fullName).trim().replace(/\s+/g, ' ');
    if (!fullName) return res.status(400).json({ message: 'Họ tên không được để trống' });
    patch.fullName = fullName;
  }
  if (req.body?.phone !== undefined) patch.phone = cleanPhone(req.body.phone);
  if (req.body?.startDate !== undefined) {
    if (req.body.startDate && !isValidDate(req.body.startDate)) return res.status(400).json({ message: 'Ngày vào làm không hợp lệ' });
    patch.startDate = req.body.startDate || null;
  }
  if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
  const name = patch.fullName ?? e.fullName;
  const active = patch.isActive ?? e.isActive;
  if (active) {
    const dup = await Employee.findOne({ where: { fullName: name, isActive: true, id: { [Op.ne]: e.id } } });
    if (dup) return res.status(409).json({ message: 'Đã có nhân viên đang làm trùng tên này' });
  }
  await e.update(patch);
  return res.json(serialize(e));
}

// Chỉ xóa hẳn khi chưa có lần chấm công nào; nếu đã có thì nên chuyển sang "Đã nghỉ" để giữ lịch sử. Lịch làm việc đã xếp bị xóa theo.
async function remove(req, res) {
  const e = await Employee.findByPk(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const used = await TimeLog.count({ where: { employeeId: e.id } });
  if (used > 0) {
    return res.status(400).json({ message: `Nhân viên này đã có ${used} lần chấm công — hãy chuyển sang "Đã nghỉ" thay vì xóa` });
  }
  await EmployeeShift.destroy({ where: { employeeId: e.id } });
  await e.destroy();
  return res.status(204).send();
}

// Quản lý đặt / đổi / xóa mã PIN của nhân viên (4–6 chữ số; để trống = xóa PIN).
async function setPin(req, res) {
  const e = await Employee.findByPk(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const pin = req.body?.pin === undefined || req.body.pin === null ? '' : String(req.body.pin).trim();
  if (pin === '') {
    await e.update({ pinHash: null });
    return res.json(serialize(e));
  }
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ message: 'Mã PIN phải gồm 4–6 chữ số' });
  await e.update({ pinHash: await bcrypt.hash(pin, 10) });
  return res.json(serialize(e));
}

// ======================= Lịch làm việc (xếp ca) — CHƯA tính vào chấm công =======================

// Lịch của một tuần (từ thứ Hai): nhân viên × 7 ngày × 3 ca.
async function schedule(req, res) {
  const raw = isValidDate(req.query.from) ? String(req.query.from) : fmt(new Date());
  const from = mondayOf(raw);
  const to = addDays(from, 6);
  const rows = await EmployeeShift.findAll({ where: { workDate: { [Op.between]: [from, to] } } });
  const used = new Set(rows.map((r) => r.employeeId));
  const employees = (await Employee.findAll({ order: [['fullName', 'ASC']] }))
    .filter((e) => e.isActive || used.has(e.id));
  res.json({
    from,
    to,
    days: Array.from({ length: 7 }, (_, i) => addDays(from, i)),
    slots: SLOTS,
    employees: employees.map((e) => ({ id: e.id, fullName: e.fullName, isActive: e.isActive })),
    marks: rows.map((r) => ({ employeeId: r.employeeId, workDate: r.workDate, slot: r.slot })),
  });
}

// Lưu cả tuần một lần: thay toàn bộ lịch của 7 ngày bằng danh sách tích mới. Không đụng tới chấm công (check-in/out).
async function saveSchedule(req, res) {
  const { from, marks } = req.body || {};
  if (!isValidDate(from) || mondayOf(from) !== from) return res.status(400).json({ message: 'Tuần không hợp lệ (phải bắt đầu từ thứ Hai)' });
  if (!Array.isArray(marks)) return res.status(400).json({ message: 'Thiếu danh sách lịch làm việc' });
  const to = addDays(from, 6);

  const seen = new Set();
  const clean = [];
  for (const m of marks) {
    const employeeId = Number(m?.employeeId);
    if (!Number.isInteger(employeeId) || !SLOT_KEYS.includes(m?.slot) || !isValidDate(m?.workDate) || m.workDate < from || m.workDate > to) {
      return res.status(400).json({ message: 'Dữ liệu lịch làm việc không hợp lệ' });
    }
    const key = `${employeeId}|${m.workDate}|${m.slot}`;
    if (!seen.has(key)) { seen.add(key); clean.push({ employeeId, workDate: m.workDate, slot: m.slot }); }
  }
  const ids = [...new Set(clean.map((c) => c.employeeId))];
  if (ids.length > 0) {
    const found = await Employee.count({ where: { id: ids } });
    if (found !== ids.length) return res.status(400).json({ message: 'Có nhân viên không tồn tại' });
  }

  await EmployeeShift.sequelize.transaction(async (t) => {
    await EmployeeShift.destroy({ where: { workDate: { [Op.between]: [from, to] } }, transaction: t });
    if (clean.length > 0) await EmployeeShift.bulkCreate(clean, { transaction: t });
  });
  return res.json({ saved: clean.length });
}

// ======================= Bảng chấm công của một nhân viên (check-in / check-out thật) =======================

const hm = (d) => tc.hhmm(new Date(d));

function serializeLogRow(l) {
  return {
    id: l.id,
    slot: l.slot,
    checkIn: hm(l.checkInAt),
    checkOut: l.checkOutAt ? hm(l.checkOutAt) : null,
    lateMinutes: l.lateMinutes,
    latePenalty: l.latePenalty,
    minutes: l.checkOutAt ? Math.max(0, Math.round((new Date(l.checkOutAt) - new Date(l.checkInAt)) / 60000)) : null,
  };
}

// Mỗi ngày trong tháng: ca đã xếp lịch, các lần check-in/out thật, ca xếp lịch mà vắng; kèm tổng cả tháng.
async function monthSheet(req, res) {
  const e = await Employee.findByPk(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const month = MONTH_RE.test(String(req.query.month || '')) ? String(req.query.month) : thisMonth();
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const range = { [Op.between]: [`${month}-01`, `${month}-${pad(daysInMonth)}`] };
  const planRows = await EmployeeShift.findAll({ where: { employeeId: e.id, workDate: range } });
  const logRows = await TimeLog.findAll({ where: { employeeId: e.id, workDate: range }, order: [['checkInAt', 'ASC']] });
  const planByDate = {};
  planRows.forEach((r) => { (planByDate[r.workDate] = planByDate[r.workDate] || []).push(r.slot); });
  const logsByDate = {};
  logRows.forEach((l) => { (logsByDate[l.workDate] = logsByDate[l.workDate] || []).push(l); });

  const now = new Date();
  const totals = {
    morning: 0, afternoon: 0, evening: 0, shifts: 0, daysWorked: 0, lateMinutes: 0, latePenalty: 0, minutes: 0, openLogs: 0, plannedShifts: 0, absentShifts: 0,
  };
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${month}-${pad(i + 1)}`;
    const planned = SLOT_KEYS.filter((s) => (planByDate[date] || []).includes(s));
    const logs = (logsByDate[date] || []).map(serializeLogRow);
    // Vắng = có lịch ca đó, không check-in, và ca đã kết thúc.
    const absent = planned.filter((s) => !logs.some((l) => l.slot === s) && now >= tc.slotEnd(date, s));
    let minutes = 0;
    logs.forEach((l) => {
      totals[l.slot] += 1;
      totals.lateMinutes += l.lateMinutes;
      totals.latePenalty += l.latePenalty;
      if (l.minutes === null) totals.openLogs += 1; else minutes += l.minutes;
    });
    totals.shifts += logs.length;
    totals.minutes += minutes;
    totals.plannedShifts += planned.length;
    totals.absentShifts += absent.length;
    if (logs.length > 0) totals.daysWorked += 1;
    // getDay(): 0 = Chủ nhật → đổi sang thứ Hai = 0 … Chủ nhật = 6
    return { date, weekday: (new Date(`${date}T00:00:00`).getDay() + 6) % 7, planned, logs, absent, minutes };
  });
  res.json({ employee: serialize(e), month, slotInfo: SLOTS, days, totals });
}

// Quản lý thêm tay một lần chấm công (ví dụ nhân viên làm mà quên check-in). Giờ dạng HH:MM trong ngày làm.
async function addLog(req, res) {
  const e = await Employee.findByPk(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const { workDate, slot, checkIn, checkOut } = req.body || {};
  if (!isValidDate(workDate)) return res.status(400).json({ message: 'Ngày không hợp lệ' });
  if (!SLOT_KEYS.includes(slot)) return res.status(400).json({ message: 'Ca không hợp lệ' });
  if (!HHMM_RE.test(String(checkIn))) return res.status(400).json({ message: 'Giờ vào không hợp lệ (HH:MM)' });
  const hasOut = checkOut !== undefined && checkOut !== null && checkOut !== '';
  if (hasOut && !HHMM_RE.test(String(checkOut))) return res.status(400).json({ message: 'Giờ ra không hợp lệ (HH:MM)' });
  const checkInAt = new Date(`${workDate}T${checkIn}:00`);
  const checkOutAt = hasOut ? new Date(`${workDate}T${checkOut}:00`) : null;
  if (checkOutAt && checkOutAt <= checkInAt) return res.status(400).json({ message: 'Giờ ra phải sau giờ vào' });
  if (await TimeLog.findOne({ where: { employeeId: e.id, workDate, slot } })) {
    return res.status(400).json({ message: 'Nhân viên này đã có chấm công ca đó trong ngày' });
  }
  const late = await tc.lateIfPlanned(e.id, checkInAt, workDate, slot);
  const log = await TimeLog.create({
    employeeId: e.id, workDate, slot, checkInAt, checkOutAt, lateMinutes: late.lateMinutes, latePenalty: late.latePenalty, autoMarked: false,
  });
  return res.status(201).json(serializeLogRow(log));
}

// Quản lý sửa giờ vào / giờ ra của một lần chấm công. Muộn và tiền phạt tự tính lại.
async function updateLog(req, res) {
  const log = await TimeLog.findByPk(req.params.id);
  if (!log) return res.status(404).json({ message: 'Không tìm thấy lần chấm công' });
  const at = (t) => new Date(`${log.workDate}T${t}:00`);
  let checkInAt = new Date(log.checkInAt);
  let checkOutAt = log.checkOutAt ? new Date(log.checkOutAt) : null;
  if (req.body?.checkIn !== undefined) {
    if (!HHMM_RE.test(String(req.body.checkIn))) return res.status(400).json({ message: 'Giờ vào không hợp lệ (HH:MM)' });
    checkInAt = at(req.body.checkIn);
  }
  if (req.body?.checkOut !== undefined) {
    if (req.body.checkOut === null || req.body.checkOut === '') checkOutAt = null;
    else if (!HHMM_RE.test(String(req.body.checkOut))) return res.status(400).json({ message: 'Giờ ra không hợp lệ (HH:MM)' });
    else checkOutAt = at(req.body.checkOut);
  }
  if (checkOutAt && checkOutAt <= checkInAt) return res.status(400).json({ message: 'Giờ ra phải sau giờ vào' });
  const late = await tc.lateIfPlanned(log.employeeId, checkInAt, log.workDate, log.slot);
  await log.update({ checkInAt, checkOutAt, lateMinutes: late.lateMinutes, latePenalty: late.latePenalty });
  return res.json(serializeLogRow(log));
}

async function removeLog(req, res) {
  const log = await TimeLog.findByPk(req.params.id);
  if (!log) return res.status(404).json({ message: 'Không tìm thấy lần chấm công' });
  await log.destroy();
  return res.status(204).send();
}

// Các lời nhắc từ quầy: nhân viên có lịch mà qua ca chưa check-in. Lời nhắc nào đã có chấm công thì tự hết.
async function reminders(req, res) {
  const rows = await CheckinReminder.findAll({
    where: { resolvedAt: null },
    include: [{ model: Employee, attributes: ['id', 'fullName'] }],
    order: [['createdAt', 'DESC']],
  });
  const out = [];
  for (const r of rows) {
    const done = await TimeLog.findOne({ where: { employeeId: r.employeeId, workDate: r.workDate, slot: r.slot } });
    if (done) { await r.update({ resolvedAt: new Date() }); continue; }
    out.push({
      id: r.id,
      employeeId: r.employeeId,
      fullName: r.Employee?.fullName || '',
      workDate: r.workDate,
      slot: r.slot,
      slotLabel: SLOTS[r.slot].label,
      createdAt: r.createdAt,
    });
  }
  res.json(out);
}

// Quản lý bỏ qua một lời nhắc (không thêm chấm công).
async function resolveReminder(req, res) {
  const r = await CheckinReminder.findByPk(req.params.id);
  if (!r) return res.status(404).json({ message: 'Không tìm thấy lời nhắc' });
  await r.update({ resolvedAt: new Date() });
  return res.status(204).send();
}

module.exports = {
  list, create, update, remove, setPin, schedule, saveSchedule, monthSheet, addLog, updateLog, removeLog, reminders, resolveReminder,
};
