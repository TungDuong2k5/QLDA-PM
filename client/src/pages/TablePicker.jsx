import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

export default function TablePicker() {
  const [tables, setTables] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/tables').then(({ data }) => setTables(data));
  }, []);

  return (
    <div className="page page-wide">
      <button className="link-back" onClick={() => navigate('/')}>&larr; Quay lại</button>
      <h1>Bán tại chỗ — Chọn bàn</h1>
      <div className="page-card">
        <div className="table-grid">
          {tables.map((t) => (
            <div key={t.id} className={`table-card ${t.status}`}>
              <div className="table-card-name">{t.name}</div>
              <div className="table-card-status">
                {t.status === 'available' ? 'Còn trống' : 'Đang phục vụ'}
              </div>
              <div className="table-card-actions">
                <button
                  disabled={t.status !== 'available'}
                  onClick={() => navigate(`/orders/new?orderType=dine_in&tableId=${t.id}`)}
                >
                  Chọn bàn này
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
