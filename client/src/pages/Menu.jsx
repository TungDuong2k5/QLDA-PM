import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { productImageSrc, categoryImageSrc } from '../utils/productImage';
import { uploadImage } from '../utils/uploadImage';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function normalizeText(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export default function Menu() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [notices, setNotices] = useState([]);
  const [toppings, setToppings] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIsDrink, setCategoryIsDrink] = useState(true);
  const [categoryImageUrl, setCategoryImageUrl] = useState('');
  const [form, setForm] = useState({ name: '', price: '', categoryId: '', imageUrl: '' });
  const [toppingForm, setToppingForm] = useState({ name: '', price: '' });
  const [uploadError, setUploadError] = useState('');
  const [uploadingKey, setUploadingKey] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [search, setSearch] = useState('');

  // Bấm vào danh mục để chỉ hiện sản phẩm của danh mục đó (và chọn sẵn nó khi thêm sản phẩm mới).
  function selectCategory(id) {
    setSelectedCategoryId(id);
    setForm((f) => ({ ...f, categoryId: id }));
  }

  // Single hidden <input type="file"> shared by every "Đổi ảnh" trigger —
  // uploadTargetRef holds the callback to run once a file is picked.
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  function loadAll() {
    api.get('/categories').then(({ data }) => setCategories(data));
    api.get('/products').then(({ data }) => setProducts(data));
    api.get('/toppings').then(({ data }) => setToppings(data));
    api.get('/stock-alerts').then(({ data }) => setNotices(data.notices || [])).catch(() => {});
  }

  // Quản lý báo nhân viên tắt / bật một món (hiện ở chuông thông báo của nhân viên).
  async function sendNotice(product, kind) {
    try {
      await api.post(`/products/${product.id}/notice`, { kind });
      window.dispatchEvent(new Event('stock-changed'));
      loadAll();
    } catch (err) {
      alert(err.response?.data?.message || 'Không gửi được thông báo');
    }
  }

  async function cancelNotice(product) {
    await api.delete(`/products/${product.id}/notice`);
    window.dispatchEvent(new Event('stock-changed'));
    loadAll();
  }

  useEffect(loadAll, []);

  // Đóng hộp chọn file mà không chọn gì thì bỏ trạng thái "Đang tải..." (nút không bị kẹt).
  useEffect(() => {
    const el = fileInputRef.current;
    const onCancel = () => setUploadingKey('');
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, []);

  function triggerUpload(key, onUploaded) {
    setUploadError('');
    uploadTargetRef.current = onUploaded;
    setUploadingKey(key);
    fileInputRef.current.click();
  }

  // Dán URL ảnh có sẵn từ trang web khác (VD: ảnh minh họa món nước tìm trên Google)
  // thay vì phải tải ảnh về máy rồi mới upload.
  function pasteImageUrl(onSet) {
    setUploadError('');
    const url = prompt('Dán URL ảnh (sao chép từ trang web khác):');
    if (url === null) return;
    if (!url.trim()) return;
    onSet(url.trim());
  }

  async function handleFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) { setUploadingKey(''); return; }
    try {
      const url = await uploadImage(file);
      uploadTargetRef.current?.(url);
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Tải ảnh lên thất bại');
    } finally {
      setUploadingKey('');
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    await api.post('/categories', { name: categoryName, isDrink: categoryIsDrink, imageUrl: categoryImageUrl || null });
    setCategoryName('');
    setCategoryIsDrink(true);
    setCategoryImageUrl('');
    loadAll();
  }

  function handleSetCategoryImage(category) {
    triggerUpload(`category-${category.id}`, async (url) => {
      await api.put(`/categories/${category.id}`, { imageUrl: url });
      loadAll();
    });
  }

  function handleSetCategoryImageUrl(category) {
    pasteImageUrl(async (url) => {
      await api.put(`/categories/${category.id}`, { imageUrl: url });
      loadAll();
    });
  }

  async function handleDeleteCategory(id) {
    if (!confirm('Xóa danh mục này?')) return;
    await api.delete(`/categories/${id}`);
    loadAll();
  }

  async function toggleCategoryIsDrink(category) {
    await api.put(`/categories/${category.id}`, { isDrink: !category.isDrink });
    window.dispatchEvent(new Event('stock-changed'));
    loadAll();
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    await api.post('/products', {
      name: form.name,
      price: Number(form.price),
      categoryId: form.categoryId || null,
      imageUrl: form.imageUrl || null,
    });
    setForm({ name: '', price: '', categoryId: '', imageUrl: '' });
    window.dispatchEvent(new Event('stock-changed')); // món bánh / ăn vặt mới tự vào kho
    loadAll();
  }

  function handleSetProductImage(product) {
    triggerUpload(`product-${product.id}`, async (url) => {
      await api.put(`/products/${product.id}`, { imageUrl: url });
      loadAll();
    });
  }

  function handleSetProductImageUrl(product) {
    pasteImageUrl(async (url) => {
      await api.put(`/products/${product.id}`, { imageUrl: url });
      loadAll();
    });
  }

  async function toggleAvailable(product) {
    await api.put(`/products/${product.id}`, { isAvailable: !product.isAvailable });
    loadAll();
  }

  async function handleDeleteProduct(id) {
    if (!confirm('Xóa sản phẩm này?')) return;
    await api.delete(`/products/${id}`);
    loadAll();
  }

  async function handleAddTopping(e) {
    e.preventDefault();
    await api.post('/toppings', {
      name: toppingForm.name,
      price: Number(toppingForm.price),
    });
    setToppingForm({ name: '', price: '' });
    loadAll();
  }

  async function toggleToppingAvailable(topping) {
    await api.put(`/toppings/${topping.id}`, { isAvailable: !topping.isAvailable });
    loadAll();
  }

  async function handleDeleteTopping(id) {
    if (!confirm('Xóa topping này?')) return;
    await api.delete(`/toppings/${id}`);
    loadAll();
  }

  const selectedCategory = categories.find((c) => String(c.id) === selectedCategoryId);
  // Tìm kiếm theo tên món hoặc tên danh mục (không phân biệt hoa thường, dấu);
  // đang tìm thì tìm trong tất cả sản phẩm, không phụ thuộc danh mục đang chọn.
  const keyword = normalizeText(search.trim());
  const visibleProducts = keyword
    ? products.filter((p) => normalizeText(`${p.name} ${p.Category?.name || ''}`).includes(keyword))
    : selectedCategoryId
      ? products.filter((p) => String(p.categoryId) === selectedCategoryId)
      : products;

  return (
    <div className="page page-wide">
      <h1>Quản lý thực đơn</h1>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />
      {uploadError && <p className="error-text">{uploadError}</p>}

      <div className="menu-card">
        <h2>Danh mục</h2>
        <form className="inline-form" onSubmit={handleAddCategory}>
          <input
            placeholder="Tên danh mục"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
          />
          <label className="topping-check">
            <input
              type="checkbox"
              checked={categoryIsDrink}
              onChange={(e) => setCategoryIsDrink(e.target.checked)}
            />
            Là đồ uống (có size, đường/đá, topping)
          </label>
          <div className="image-source-group">
            <button
              type="button"
              className="upload-trigger"
              disabled={uploadingKey === 'new-category'}
              onClick={() => triggerUpload('new-category', (url) => setCategoryImageUrl(url))}
            >
              {uploadingKey === 'new-category' ? 'Đang tải...' : 'Tải ảnh từ máy'}
            </button>
            <button type="button" className="upload-trigger" onClick={() => pasteImageUrl(setCategoryImageUrl)}>
              Dán URL ảnh
            </button>
            {categoryImageUrl && <span className="hint">Đã chọn ảnh ✓</span>}
          </div>
          <button type="submit">Thêm danh mục</button>
        </form>
        <ul className="chip-list">
          <li className={`chip category-chip ${selectedCategoryId === '' ? 'chip-selected' : ''}`}>
            <button type="button" className="chip-select" onClick={() => selectCategory('')}>
              Tất cả ({products.length})
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id} className={`chip category-chip ${selectedCategoryId === String(c.id) ? 'chip-selected' : ''}`}>
              <button type="button" className="chip-select" onClick={() => selectCategory(String(c.id))}>
                <img className="category-chip-thumb" src={categoryImageSrc(c)} alt={c.name} />
                {c.name} ({products.filter((p) => p.categoryId === c.id).length})
              </button>
              <button type="button" className="chip-type-toggle" onClick={() => toggleCategoryIsDrink(c)}>
                {c.isDrink ? 'Đồ uống' : 'Đồ ăn'}
              </button>
              <button
                type="button"
                className="chip-type-toggle"
                disabled={uploadingKey === `category-${c.id}`}
                onClick={() => handleSetCategoryImage(c)}
              >
                {uploadingKey === `category-${c.id}` ? 'Đang tải...' : 'Đổi ảnh'}
              </button>
              <button type="button" className="chip-type-toggle" onClick={() => handleSetCategoryImageUrl(c)}>
                Dán URL
              </button>
              <button onClick={() => handleDeleteCategory(c.id)}>&times;</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="menu-card">
        <div className="menu-card-header">
          <h2>Sản phẩm{selectedCategory && !keyword ? ` — ${selectedCategory.name}` : ''}</h2>
          <div className="menu-search">
            <input
              className="product-search"
              type="search"
              placeholder="Tìm kiếm món hoặc danh mục (VD: ăn vặt, cà phê, trà sữa)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {keyword && <span className="hint">Tìm thấy {visibleProducts.length} món</span>}
          </div>
        </div>

        <form className="inline-form" onSubmit={handleAddProduct}>
          <input
            placeholder="Tên sản phẩm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="number"
            min="0"
            placeholder="Giá"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">-- Danh mục --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="image-source-group">
            <button
              type="button"
              className="upload-trigger"
              disabled={uploadingKey === 'new-product'}
              onClick={() => triggerUpload('new-product', (url) => setForm((f) => ({ ...f, imageUrl: url })))}
            >
              {uploadingKey === 'new-product' ? 'Đang tải...' : 'Tải ảnh từ máy'}
            </button>
            <button
              type="button"
              className="upload-trigger"
              onClick={() => pasteImageUrl((url) => setForm((f) => ({ ...f, imageUrl: url })))}
            >
              Dán URL ảnh
            </button>
            {form.imageUrl && <span className="hint">Đã chọn ảnh ✓</span>}
          </div>
          <button type="submit">Thêm sản phẩm</button>
        </form>

        <table className="data-table">
          <thead>
            <tr>
              <th>Ảnh</th>
              <th>Tên</th>
              <th>Danh mục</th>
              <th>Giá</th>
              <th>Trạng thái</th>
              <th>Báo nhân viên</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((p) => (
              <tr key={p.id}>
                <td><img className="thumb" src={productImageSrc(p)} alt={p.name} /></td>
                <td>{p.name}</td>
                <td>{p.Category?.name || '-'}</td>
                <td>{formatCurrency(p.price)}</td>
                <td>
                  <button onClick={() => toggleAvailable(p)}>
                    {p.isAvailable ? 'Đang bán' : 'Ngừng bán'}
                  </button>
                </td>
                <td>
                  {(() => {
                    const pending = notices.find((n) => n.productId === p.id && ['close_request', 'reopen_request'].includes(n.kind));
                    if (pending) {
                      return (
                        <span className="notice-pending">
                          Đã báo {pending.kind === 'close_request' ? 'tắt' : 'bật'}
                          <button type="button" className="secondary" onClick={() => cancelNotice(p)}>Hủy</button>
                        </span>
                      );
                    }
                    return p.isAvailable
                      ? <button type="button" className="secondary" onClick={() => sendNotice(p, 'close_request')}>Báo NV tắt món</button>
                      : <button type="button" className="secondary" onClick={() => sendNotice(p, 'reopen_request')}>Báo NV bật món</button>;
                  })()}
                </td>
                <td className="row-actions">
                  <button
                    type="button"
                    disabled={uploadingKey === `product-${p.id}`}
                    onClick={() => handleSetProductImage(p)}
                  >
                    {uploadingKey === `product-${p.id}` ? 'Đang tải...' : 'Đổi ảnh'}
                  </button>
                  <button type="button" onClick={() => handleSetProductImageUrl(p)}>Dán URL</button>
                  <button className="danger" onClick={() => handleDeleteProduct(p.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="menu-card">
        <h2>Topping</h2>
        <form className="inline-form" onSubmit={handleAddTopping}>
          <input
            placeholder="Tên topping"
            value={toppingForm.name}
            onChange={(e) => setToppingForm({ ...toppingForm, name: e.target.value })}
            required
          />
          <input
            type="number"
            min="0"
            placeholder="Giá"
            value={toppingForm.price}
            onChange={(e) => setToppingForm({ ...toppingForm, price: e.target.value })}
            required
          />
          <button type="submit">Thêm topping</button>
        </form>

        <table className="data-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Giá</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {toppings.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{formatCurrency(t.price)}</td>
                <td>
                  <button onClick={() => toggleToppingAvailable(t)}>
                    {t.isAvailable ? 'Đang bán' : 'Ngừng bán'}
                  </button>
                </td>
                <td>
                  <button className="danger" onClick={() => handleDeleteTopping(t.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
