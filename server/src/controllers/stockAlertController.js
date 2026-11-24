const { Ingredient, Product, Category, ProductNotice } = require('../models');

// Nhóm "special" là các nguyên liệu đã nằm trong danh sách nguyên vật liệu nên
// không tạo thông báo hàng hóa riêng.
const isSpecial = (p) => String(p.Category?.name || '').trim().toLowerCase() === 'special';

// Thông báo tồn kho cho cả hai vai trò:
//  - outOfStockIngredients: nguyên liệu đã hết (tồn <= 0) → quản lý cần nhập thêm
//  - outOfStockProducts:    bánh / đồ ăn vặt đã hết (có theo dõi tồn kho, tồn <= 0)
//  - toClose:  món nhân viên cần TẮT: hết hàng, hết nguyên liệu (đã khai báo) hoặc quản lý báo tắt
//  - toReopen: món nhân viên có thể BẬT lại: quản lý báo bật, hoặc đã có hàng lại sau khi tắt vì hết
//  - notices:  các lời báo quản lý đang chờ nhân viên xử lý (để quản lý thấy "đã báo")
async function computeAlerts() {
  const [ingredients, products, notices] = await Promise.all([
    Ingredient.findAll({
      include: [{ model: Product, attributes: ['id', 'name', 'isAvailable'], through: { attributes: [] } }],
      order: [['name', 'ASC']],
    }),
    Product.findAll({ include: [{ model: Category, attributes: ['name'] }] }),
    ProductNotice.findAll(),
  ]);

  // Dọn lời nhắn đã hết tác dụng (món đã được bật/tắt đúng như lời nhắn).
  const byId = new Map(products.map((p) => [p.id, p]));
  const stale = notices.filter((n) => {
    const p = byId.get(n.productId);
    if (!p) return true;
    if (n.kind === 'close_request') return !p.isAvailable;
    return p.isAvailable; // reopen_request / closed_for_stock mà món đang bán
  });
  if (stale.length > 0) {
    await ProductNotice.destroy({ where: { id: stale.map((n) => n.id) } });
  }
  const liveNotices = notices.filter((n) => !stale.includes(n));
  const noticeByProduct = new Map(liveNotices.map((n) => [n.productId, n]));

  const outIds = new Set(ingredients.filter((i) => i.stock <= 0).map((i) => i.id));

  const outOfStockIngredients = ingredients
    .filter((i) => outIds.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock: i.stock,
      affectedProducts: (i.Products || []).map((p) => ({ id: p.id, name: p.name, isAvailable: p.isAvailable })),
    }));

  // Nguyên liệu của từng món (nếu đã khai báo) → món nào đang thiếu nguyên liệu.
  const linked = new Map();
  for (const ing of ingredients) {
    for (const p of ing.Products || []) {
      const entry = linked.get(p.id) || { missing: [], total: 0 };
      entry.total += 1;
      if (outIds.has(ing.id)) entry.missing.push(ing.name);
      linked.set(p.id, entry);
    }
  }

  const tracked = (p) => p.stock !== null && p.stock !== undefined;
  const outOfStockProducts = products
    .filter((p) => !isSpecial(p) && tracked(p) && p.stock <= 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      category: p.Category?.name || '',
      isAvailable: p.isAvailable,
      hasCloseRequest: noticeByProduct.get(p.id)?.kind === 'close_request',
    }));

  const toClose = [];
  const toReopen = [];
  for (const p of products) {
    if (isSpecial(p)) continue;
    const notice = noticeByProduct.get(p.id);
    const link = linked.get(p.id);
    const missing = link ? link.missing : [];

    if (p.isAvailable) {
      const reasons = [];
      if (tracked(p) && p.stock <= 0) reasons.push('Hết hàng');
      if (missing.length > 0) reasons.push(`Hết nguyên liệu: ${missing.join(', ')}`);
      if (notice?.kind === 'close_request') reasons.push('Quản lý báo tắt món');
      if (reasons.length > 0) {
        toClose.push({ id: p.id, name: p.name, reasons, fromManager: notice?.kind === 'close_request' });
      }
    } else if (notice) {
      if (notice.kind === 'reopen_request') {
        toReopen.push({ id: p.id, name: p.name, reason: 'Quản lý báo đã có hàng — bật món' });
      } else if (notice.kind === 'closed_for_stock') {
        // Chỉ nhắc bật khi biết chắc điều kiện đã được giải quyết.
        const stockKnown = tracked(p);
        const hasLink = Boolean(link);
        const stockOk = !stockKnown || p.stock > 0;
        const ingredientsOk = !hasLink || missing.length === 0;
        if ((stockKnown || hasLink) && stockOk && ingredientsOk) {
          toReopen.push({ id: p.id, name: p.name, reason: 'Đã có hàng trở lại' });
        }
      }
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'vi');

  return {
    outOfStockIngredients,
    outOfStockProducts: outOfStockProducts.sort(byName),
    toClose: toClose.sort(byName),
    toReopen: toReopen.sort(byName),
    notices: liveNotices.map((n) => ({ productId: n.productId, kind: n.kind })),
  };
}

async function stockAlerts(req, res) {
  res.json(await computeAlerts());
}

// Món đang BỊ KHÓA không cho gọi: hết hàng / hết nguyên liệu / quản lý báo tắt mà nhân viên chưa đóng món.
// Trả về Map(productId -> lý do). Dùng khi lập hóa đơn để chặn các món này.
async function lockedProducts() {
  const { toClose } = await computeAlerts();
  return new Map(toClose.map((p) => [p.id, p.reasons.join(', ')]));
}

module.exports = { stockAlerts, computeAlerts, lockedProducts, isSpecial };
