import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [name, setName] = useState('');
  const { user } = useAuth();

  function load() {
    api.get('/tables').then(({ data }) => setTables(data));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    await api.post('/tables', { name });
    setName('');
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Xóa bàn này?')) return;
    await api.delete(`/tables/${id}`);
    load();
  }

  return (
    <div className="page page-wide">
      <h1>Danh sách bàn</h1>

      <div className="page-card">
        {user.role === 'admin' && (
          <form className="inline-form" onSubmit={handleAdd} style={{ marginTop: 0 }}>
            <input placeholder="Tên bàn (VD: Bàn 9)" value={name} onChange={(e) => setName(e.target.value)} required />
            <button type="submit">Thêm bàn</button>
          </form>
        )}

        {tables.length === 0 ? (
          <p className="hint">Chưa có bàn nào.</p>
        ) : (
          <div className="table-grid">
            {tables.map((t) => (
              <div key={t.id} className={`table-card ${t.status}`}>
                <div className="table-card-name">{t.name}</div>
                <div className="table-card-status">
                  {t.status === 'available' ? 'Còn trống' : 'Đang phục vụ'}
                </div>
                {user.role === 'admin' && (
                  <div className="table-card-actions">
                    <button className="danger" onClick={() => handleDelete(t.id)}>Xóa</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
