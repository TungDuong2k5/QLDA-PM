const { Op, fn, col } = require('sequelize');
const {
  sequelize, Order, OrderItem, Ingredient, IngredientMovement, Product, ProductMovement, Category, StockCheck, StockCheckItem, User,
} = require('../models');
const { SLOTS, SLOT_KEYS, shiftSlotOf } = require('../utils/timeclock');

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const round3 = (n) => Math.round(n * 1000) / 1000;
const slotTime = (date, hhmm) => new Date(`${date}T${hhmm}:00`);
const slotLabel = (slot) => SLOTS[slot]?.label || slot;

// Trạng thái ba ca của ngày: upcoming (chưa bắt đầu) · running (đang chạy) · ended (đã hết giờ).
function slotStates(now, date) {
  return SLOT_KEYS.map((slot) => {
    const start = slotTime(date, SLOTS[slot].start);
    const end = slotTime(date, SLOTS[slot].end);
    const state = now < start ? 'upcoming' : now < end ? 'running' : 'ended';
    return { slot, label: SLOTS[slot].label, start: SLOTS[slot].start, end: SLOTS[slot].end, state };
  });
}

// Ca nên kiểm lúc này: ca đã hết giờ mà chưa có phiếu (hoặc bị yêu cầu kiểm lại) — ca cũ nhất trước; không có thì ca đang chạy;
// không có nữa thì ca gần nhất đã hết giờ.
function defaultSlot(states, checks) {
  const byslot = new Map(checks.map((c) => [c.slot, c]));
  const due = states.find((s) => s.state === 'ended' && (!byslot.has(s.slot) || byslot.get(s.slot).status === 'rejected'));
  if (due) return due.slot;
  const running = states.find((s) => s.state === 'running');
  if (running) return running.slot;
  const last = [...states].reverse().find((s) => s.state === 'ended');
  return last ? last.slot : SLOT_KEYS[0];
}

const isSpecial = (p) => String(p.Category?.name || '').trim().toLowerCase() === 'special';

// Những thứ nhân viên phải đếm: nguyên liệu + bánh / đồ ăn vặt (món không phải đồ uống, không thuộc nhóm "special").
// Tồn hệ thống lấy tại thời điểm gọi.
async function buildTemplate(t) {
  const [ingredients, products] = await Promise.all([
    Ingredient.findAll({ order: [['name', 'ASC']], transaction: t }),
    Product.findAll({ include: [{ model: Category }], order: [['name', 'ASC']], transaction: t }),
  ]);
  const goods = products.filter((p) => p.Category && !p.Category.isDrink && !isSpecial(p));
  return [
    ...ingredients.map((i) => ({ kind: 'ingredient', refId: i.id, name: i.name, unit: i.unit, systemQty: round3(i.stock) })),
    ...goods.map((p) => ({ kind: 'product', refId: p.id, name: p.name, unit: null, systemQty: round3(p.stock ?? 0) })),
  ];
}

// Số lượng từng sản phẩm đã bán (mọi dòng hóa đơn; hủy đơn không hoàn kho nên vẫn tính) trong khoảng (since, until].
async function soldMap(since, until, t) {
  const rows = await OrderItem.findAll({
    attributes: ['productId', [fn('SUM', col('OrderItem.quantity')), 'qty']],
    include: [{ model: Order, attributes: [], required: true, where: { createdAt: { [Op.gt]: since, [Op.lte]: until } } }],
    where: { productId: { [Op.ne]: null } },
    group: ['OrderItem.productId'], raw: true, transaction: t,
  });
  return new Map(rows.map((r) => [r.productId, Number(r.qty) || 0]));
}

// Mốc bắt đầu tính hàng đã bán cho phiếu của `slot` ngày `date`: lúc gửi phiếu ca ngay trước đó; chưa có thì từ đầu ngày.
async function soldSince(date, slot, t) {
  const recent = await StockCheck.findAll({ where: { businessDate: { [Op.lte]: date } }, order: [['businessDate', 'DESC'], ['submittedAt', 'DESC']], limit: 12, transaction: t });
  const idx = SLOT_KEYS.indexOf(slot);
  const prev = recent.find((c) => c.businessDate < date || SLOT_KEYS.indexOf(c.slot) < idx);
  return prev ? prev.submittedAt : new Date(`${date}T00:00:00`);
}

// Danh sách cần đếm kèm số đã bán tính đến lúc `until` (dùng cho màn hình đếm: dự tính chênh lệch).
async function templateWithSold(date, slot, until, t) {
  const [template, sold] = await Promise.all([buildTemplate(t), soldSince(date, slot, t).then((since) => soldMap(since, until, t))]);
  return template.map((x) => ({ ...x, soldQty: x.kind === 'product' ? sold.get(x.refId) || 0 : 0 }));
}

function serializeItem(it, live) {
  const key = `${it.kind}:${it.refId}`;
  return {
    kind: it.kind, refId: it.refId, name: it.name, unit: it.unit,
    systemQty: it.systemQty, countedQty: it.countedQty, soldQty: round3(it.soldQty || 0),
    // Chênh lệch = số đếm − (tồn hệ thống + đã bán): âm = hàng đã xuất ra, gồm cả hàng bán và xuất khác.
    diff: round3(it.countedQty - it.systemQty - (it.soldQty || 0)),
    // Hàng quản lý nhập thêm SAU khi nhân viên gửi phiếu — tự cộng vào báo cáo; và tồn hiện tại trên hệ thống.
    importedQty: round3(live?.imported.get(key) || 0),
    // Bánh / đồ ăn vặt khách mua SAU khi gửi phiếu (tự trừ khỏi tồn hiện tại).
    soldAfterQty: it.kind === 'product' ? round3(live?.soldAfter?.get(it.refId) || 0) : 0,
    currentQty: live?.current.has(key) ? round3(live.current.get(key)) : null,
  };
}

// Số liệu "sống" cho phiếu: tổng nhập kho của quản lý từ lúc phiếu được gửi + tồn hiện tại của từng mục.
async function liveFor(check) {
  const items = check.StockCheckItems || [];
  const imported = new Map();
  const current = new Map();
  if (items.length === 0) return { imported, current, soldAfter: new Map() };
  const endOfDay = new Date(`${check.businessDate}T00:00:00`);
  endOfDay.setDate(endOfDay.getDate() + 1);
  // Hàng nhập thêm tính từ lúc gửi phiếu này tới lúc gửi phiếu ca kế tiếp (hoặc hết ngày); phiếu ca sau đã chụp lại tồn.
  const next = await StockCheck.findOne({
    where: { businessDate: check.businessDate, submittedAt: { [Op.gt]: check.submittedAt } }, order: [['submittedAt', 'ASC']],
  });
  const until = next && next.submittedAt < endOfDay ? next.submittedAt : endOfDay;
  const since = { createdAt: { [Op.gte]: check.submittedAt, [Op.lt]: until } };
  const notAdjust = { [Op.or]: [{ note: null }, { note: { [Op.notLike]: 'Kiểm kho%' } }] };
  const soldAfter = await soldMap(check.submittedAt, until);
  const [ingMoves, prodMoves, ings, prods] = await Promise.all([
    IngredientMovement.findAll({ where: { type: 'in', ...since, [Op.and]: [notAdjust] } }),
    ProductMovement.findAll({ where: { type: 'in', ...since, [Op.and]: [notAdjust] } }),
    Ingredient.findAll({ attributes: ['id', 'stock'] }),
    Product.findAll({ attributes: ['id', 'stock'] }),
  ]);
  for (const m of ingMoves) imported.set(`ingredient:${m.ingredientId}`, (imported.get(`ingredient:${m.ingredientId}`) || 0) + m.quantity);
  for (const m of prodMoves) imported.set(`product:${m.productId}`, (imported.get(`product:${m.productId}`) || 0) + m.quantity);
  for (const i of ings) current.set(`ingredient:${i.id}`, i.stock);
  for (const p of prods) current.set(`product:${p.id}`, p.stock ?? 0);
  return { imported, current, soldAfter };
}

async function present(check, withItems = true) {
  const live = withItems ? await liveFor(check) : null;
  const out = serializeCheck(check, withItems, live);
  // Mục mới thêm vào kho (món, nguyên liệu) SAU khi phiếu của ca mới nhất hôm nay được gửi: chưa có trong phiếu.
  // Chưa duyệt thì nhân viên đếm bổ sung ngay; đã duyệt thì mục mới sẽ được đếm ở phiếu ca kế tiếp.
  const todayStr = localDate(new Date());
  let isLatest = false;
  if (withItems && check.businessDate === todayStr) {
    const sameDay = await StockCheck.findAll({ where: { businessDate: todayStr }, attributes: ['slot'] });
    isLatest = SLOT_KEYS.indexOf(check.slot) === Math.max(...sameDay.map((c) => SLOT_KEYS.indexOf(c.slot)));
  }
  if (withItems && isLatest) {
    const have = new Set((check.StockCheckItems || []).map((it) => `${it.kind}:${it.refId}`));
    out.pendingItems = (await buildTemplate())
      .filter((t) => !have.has(`${t.kind}:${t.refId}`))
      .map((t) => ({ kind: t.kind, refId: t.refId, name: t.name, unit: t.unit, systemQty: t.systemQty, soldQty: 0, currentQty: t.systemQty }));
  } else if (withItems) {
    out.pendingItems = [];
  }
  return out;
}

function serializeCheck(check, withItems = true, live = null) {
  const items = (check.StockCheckItems || []).map((it) => serializeItem(it, live))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'vi') : a.kind === 'ingredient' ? -1 : 1));
  return {
    id: check.id,
    businessDate: check.businessDate,
    slot: check.slot,
    slotLabel: slotLabel(check.slot),
    status: check.status,
    submittedBy: check.SubmittedBy?.fullName || null,
    submittedAt: check.submittedAt,
    note: check.note,
    reviewedBy: check.ReviewedBy?.fullName || null,
    reviewedAt: check.reviewedAt,
    reviewNote: check.reviewNote,
    applied: check.applied,
    itemCount: items.length,
    diffCount: items.filter((i) => i.diff !== 0).length,
    ...(withItems ? { items } : {}),
  };
}

const include = [
  { model: StockCheckItem },
  { model: User, as: 'SubmittedBy', attributes: ['fullName'] },
  { model: User, as: 'ReviewedBy', attributes: ['fullName'] },
];

// Tổng quan hôm nay: ba ca và phiếu của từng ca, danh sách cần đếm (gồm cả mục mới thêm), chi tiết phiếu của ca được chọn (?slot=).
async function today(req, res) {
  const now = new Date();
  const date = localDate(now);
  const checks = await StockCheck.findAll({ where: { businessDate: date }, include });
  const states = slotStates(now, date);
  const slots = states.map((st) => {
    const c = checks.find((x) => x.slot === st.slot);
    return { ...st, canCount: st.state !== 'upcoming', due: st.state === 'ended' && (!c || c.status === 'rejected'), check: c ? serializeCheck(c, false) : null };
  });
  const slot = SLOT_KEYS.includes(req.query.slot) ? req.query.slot : defaultSlot(states, checks);
  const current = checks.find((c) => c.slot === slot);
  const template = await templateWithSold(date, slot, now);
  res.json({ date, slot, slotLabel: slotLabel(slot), slots, check: current ? await present(current) : null, template });
}

// Các ca đã hết giờ mà chưa có phiếu kiểm kho (hoặc bị yêu cầu kiểm lại) — cho chuông thông báo / nhắc nhân viên.
async function due(req, res) {
  const now = new Date();
  const date = localDate(now);
  const checks = await StockCheck.findAll({ where: { businessDate: date }, attributes: ['slot', 'status'] });
  const list = slotStates(now, date)
    .filter((st) => st.state === 'ended')
    .map((st) => ({ ...st, status: checks.find((c) => c.slot === st.slot)?.status || null }))
    .filter((st) => st.status === null || st.status === 'rejected');
  res.json({ date, due: list });
}

// Nhân viên gửi phiếu kiểm kho cuối ca cho quản lý.
async function submit(req, res) {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Nhân viên là người đếm kho; quản lý chỉ kiểm tra phiếu' });
  const { items, note } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ message: 'Thiếu danh sách số đếm' });

  const now = new Date();
  const date = localDate(now);
  const states = slotStates(now, date);
  const todays = await StockCheck.findAll({ where: { businessDate: date } });
  const slot = SLOT_KEYS.includes(req.body.slot) ? req.body.slot : defaultSlot(states, todays);
  if (states.find((x) => x.slot === slot).state === 'upcoming') {
    return res.status(400).json({ message: `${slotLabel(slot)} chưa bắt đầu nên chưa kiểm kho được` });
  }
  const existing = todays.find((c) => c.slot === slot) || null;
  if (existing && existing.status === 'approved') {
    return res.status(400).json({ message: `Phiếu kiểm kho ${slotLabel(slot).toLowerCase()} đã được quản lý duyệt` });
  }

  const template = await buildTemplate();
  const counted = new Map();
  for (const it of items) {
    const n = Number(it.countedQty);
    if (it.countedQty === '' || it.countedQty === null || it.countedQty === undefined || !Number.isFinite(n) || n < 0) continue;
    counted.set(`${it.kind}:${it.refId}`, n);
  }
  const missing = template.filter((t) => !counted.has(`${t.kind}:${t.refId}`));
  if (missing.length > 0) {
    const names = missing.slice(0, 5).map((m) => m.name).join(', ');
    return res.status(400).json({ message: `Chưa nhập số đếm hợp lệ cho: ${names}${missing.length > 5 ? ` và ${missing.length - 5} mục khác` : ''}` });
  }

  const id = await sequelize.transaction(async (t) => {
    let check = existing;
    const fields = {
      status: 'submitted', submittedByUserId: req.user.id, submittedAt: new Date(), note: (note || '').trim().slice(0, 250) || null,
      reviewedByUserId: null, reviewedAt: null, reviewNote: null, applied: false,
    };
    if (check) {
      await revertAdjustments(check, t); // gửi lại: gỡ điều chỉnh của lần đếm trước rồi đếm lại từ tồn gốc
      await check.update(fields, { transaction: t });
      await StockCheckItem.destroy({ where: { stockCheckId: check.id }, transaction: t });
    } else {
      check = await StockCheck.create({ businessDate: date, slot, ...fields }, { transaction: t });
    }
    // Tồn hệ thống chụp SAU khi gỡ điều chỉnh cũ, trong cùng giao dịch.
    const base = await buildTemplate(t);
    const sold = await soldMap(await soldSince(date, slot, t), check.submittedAt, t); // hàng đã bán kể từ phiếu ca trước, tự động
    await StockCheckItem.bulkCreate(base.map((tp) => ({
      stockCheckId: check.id, kind: tp.kind, refId: tp.refId, name: tp.name, unit: tp.unit,
      systemQty: tp.systemQty, soldQty: tp.kind === 'product' ? sold.get(tp.refId) || 0 : 0,
      countedQty: round3(counted.get(`${tp.kind}:${tp.refId}`)),
    })), { transaction: t });
    // Số đếm = hàng còn lại thật: tồn kho cập nhật bằng số đếm, phần chênh lệch ghi thành phiếu xuất (hoặc nhập nếu đếm thừa).
    const rows = await StockCheckItem.findAll({ where: { stockCheckId: check.id }, transaction: t });
    await applyCounts(check, rows, req.user.id, t);
    await check.update({ applied: true }, { transaction: t });
    return check.id;
  });

  const saved = await StockCheck.findByPk(id, { include });
  res.status(201).json(await present(saved));
}

// Quản lý: danh sách phiếu (mới nhất trước).
async function list(req, res) {
  const checks = await StockCheck.findAll({ include, order: [['businessDate', 'DESC'], ['submittedAt', 'DESC']], limit: 90 });
  res.json(checks.map((c) => serializeCheck(c, false)));
}

// Quản lý: phiếu đang chờ duyệt (cho chuông thông báo).
async function pending(req, res) {
  const checks = await StockCheck.findAll({ where: { status: 'submitted' }, include, order: [['businessDate', 'DESC']] });
  res.json(checks.map((c) => serializeCheck(c, false)));
}

async function detail(req, res) {
  const check = await StockCheck.findByPk(req.params.id, { include });
  if (!check) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kho' });
  res.json(await present(check));
}

// Ghi chú gắn trên phiếu nhập / xuất do kiểm kho tạo ra; có số phiếu để gỡ lại đúng khi đếm lại.
const adjustNote = (check) => `Kiểm kho ${slotLabel(check.slot).toLowerCase()} ngày ${dmy(check.businessDate)} (phiếu #${check.id})`;
// Phiếu cũ (trước khi kiểm kho theo ca) ghi chú không có tên ca.
const legacyAdjustNote = (check) => `Kiểm kho ngày ${dmy(check.businessDate)} (phiếu #${check.id})`;

// Số đếm là hàng còn lại thật. Đưa tồn kho về đúng số đếm: chênh lệch âm = nhân viên đã xuất ra (phiếu xuất),
// dương = đếm thừa (phiếu nhập). Hàng quản lý nhập / bán SAU khi gửi phiếu không bị ảnh hưởng.
async function applyCounts(check, rows, userId, t) {
  const note = adjustNote(check);
  for (const it of rows) {
    const delta = round3(it.countedQty - it.systemQty);
    if (delta === 0) continue;
    const Model = it.kind === 'ingredient' ? Ingredient : Product;
    const Move = it.kind === 'ingredient' ? IngredientMovement : ProductMovement;
    const row = await Model.findByPk(it.refId, { transaction: t });
    if (!row) continue;
    const current = row.stock ?? 0;
    const next = Math.max(0, round3(current + delta));
    const applied = round3(next - current);
    if (applied === 0) continue;
    const fk = it.kind === 'ingredient' ? { ingredientId: row.id } : { productId: row.id };
    await Move.create({ ...fk, type: applied > 0 ? 'in' : 'out', quantity: Math.abs(applied), note, userId }, { transaction: t });
    await row.update({ stock: next }, { transaction: t });
  }
}

// Gỡ các điều chỉnh tồn kho của một phiếu (khi đếm lại hoặc bị yêu cầu kiểm lại): hoàn tác phiếu nhập / xuất đã ghi.
async function revertAdjustments(check, t) {
  const note = adjustNote(check);
  for (const [Move, Model, fk] of [[IngredientMovement, Ingredient, 'ingredientId'], [ProductMovement, Product, 'productId']]) {
    const moves = await Move.findAll({ where: { note: { [Op.in]: [note, legacyAdjustNote(check)] } }, transaction: t });
    for (const m of moves) {
      const row = await Model.findByPk(m[fk], { transaction: t });
      if (row) await row.update({ stock: Math.max(0, round3((row.stock ?? 0) + (m.type === 'in' ? -m.quantity : m.quantity))) }, { transaction: t });
      await m.destroy({ transaction: t });
    }
  }
}

// Quản lý duyệt phiếu, hoặc yêu cầu kiểm lại (gỡ điều chỉnh tồn kho của phiếu đó cho tới khi nhân viên đếm lại).
async function review(req, res) {
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'action phải là approve hoặc reject' });
  const check = await StockCheck.findByPk(req.params.id, { include });
  if (!check) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kho' });
  if (check.status !== 'submitted') return res.status(400).json({ message: 'Phiếu này đã được xử lý rồi' });
  const reviewNote = (note || '').trim().slice(0, 250) || null;
  if (action === 'reject' && !reviewNote) return res.status(400).json({ message: 'Nhập lý do yêu cầu kiểm lại' });

  await sequelize.transaction(async (t) => {
    if (action === 'reject') await revertAdjustments(check, t);
    await check.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedByUserId: req.user.id, reviewedAt: new Date(), reviewNote, applied: action === 'approve',
    }, { transaction: t });
  });

  const saved = await StockCheck.findByPk(check.id, { include });
  res.json(await present(saved));
}

// Phiếu gửi từ bản cũ (chưa áp số đếm vào tồn kho) còn chờ duyệt: áp số đếm một lần khi khởi động. Chạy nhiều lần vẫn an toàn.
async function applyLegacyPending() {
  const legacy = await StockCheck.findAll({ where: { status: 'submitted', applied: false }, include: [{ model: StockCheckItem }] });
  for (const check of legacy) {
    await sequelize.transaction(async (t) => {
      await applyCounts(check, check.StockCheckItems, check.submittedByUserId, t);
      await check.update({ applied: true }, { transaction: t });
    });
  }
  return legacy.length;
}

// Chuyển bảng stock_checks từ "mỗi ngày một phiếu" sang "mỗi ca một phiếu" (thêm cột slot, bỏ UNIQUE trên businessDate).
// Phiếu cũ được xếp vào ca theo giờ gửi. Chạy trước sequelize.sync(); bảng đã mới hoặc chưa có thì bỏ qua.
async function migrateStockCheckSlot() {
  const [rows] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_checks'");
  if (!rows.length || /`slot`/.test(rows[0].sql)) return false;
  const cols = 'id, businessDate, status, submittedByUserId, submittedAt, note, reviewedByUserId, reviewedAt, reviewNote, applied, createdAt, updatedAt';
  const newSql = rows[0].sql
    .replace('CREATE TABLE `stock_checks`', 'CREATE TABLE `stock_checks_new`')
    .replace('`businessDate` DATE NOT NULL UNIQUE', '`businessDate` DATE NOT NULL')
    .replace('`status` TEXT', "`slot` TEXT NOT NULL DEFAULT 'morning', `status` TEXT");
  await sequelize.query('PRAGMA foreign_keys = OFF'); // không để DROP bảng cũ xóa lan sang stock_check_items
  try {
    await sequelize.query('BEGIN');
    await sequelize.query(newSql);
    await sequelize.query(`INSERT INTO stock_checks_new (${cols}) SELECT ${cols} FROM stock_checks`);
    const [old] = await sequelize.query('SELECT id, submittedAt FROM stock_checks_new');
    for (const r of old) {
      await sequelize.query('UPDATE stock_checks_new SET slot = ? WHERE id = ?', { replacements: [shiftSlotOf(r.submittedAt), r.id] });
    }
    await sequelize.query('DROP TABLE stock_checks');
    await sequelize.query('ALTER TABLE stock_checks_new RENAME TO stock_checks');
    await sequelize.query('COMMIT');
  } catch (err) {
    await sequelize.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await sequelize.query('PRAGMA foreign_keys = ON');
  }
  return true;
}

// Thêm cột soldQty cho bảng dòng kiểm kho cũ (phiếu cũ coi như chưa ghi nhận hàng bán).
async function ensureSoldQtyColumn() {
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable('stock_check_items');
  if (!columns.soldQty) {
    await sequelize.query('ALTER TABLE stock_check_items ADD COLUMN soldQty FLOAT NOT NULL DEFAULT 0');
    return true;
  }
  return false;
}

module.exports = { ensureSoldQtyColumn, today, due, submit, list, pending, detail, review, applyLegacyPending, migrateStockCheckSlot };
