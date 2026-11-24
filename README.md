  # Hệ thống quản lý quán cà phê

Ứng dụng full-stack quản lý quán cà phê: quản lý bàn, thực đơn (danh mục/sản phẩm),
tạo và xử lý đơn hàng theo trạng thái, và bảng thống kê doanh thu cơ bản.

## Công nghệ sử dụng

- **Backend:** Node.js, Express, Sequelize (SQLite), JWT authentication
- **Frontend:** React (Vite), React Router, Axios

## Cấu trúc project

```
coffee-shop-management/
├── server/    # REST API (Express + SQLite)
└── client/    # Giao diện người dùng (React)
```

## Chạy backend

```bash
cd server
npm install
copy .env.example .env      # Windows (hoặc: cp .env.example .env)
npm run seed                 # tạo dữ liệu mẫu + tài khoản admin/staff
npm run dev                  # chạy tại http://localhost:5000
```

Tài khoản mẫu sau khi seed:
- Admin: `admin` / `admin123`
- Nhân viên: `staff` / `staff123`

## Chạy frontend

```bash
cd client
npm install
npm run dev                  # chạy tại http://localhost:5173
```

Frontend đã cấu hình proxy `/api` trỏ về `http://localhost:5000`, nên cần
chạy backend trước.

## Tính năng chính

- Đăng nhập, phân quyền admin/nhân viên (JWT)
- Quản lý danh mục và sản phẩm (thêm/sửa/xóa, ngừng bán) — chỉ admin
- Quản lý bàn: trạng thái còn trống / đang phục vụ
- Tạo đơn hàng theo bàn, chọn món và số lượng
- Cập nhật trạng thái đơn hàng: chờ xử lý → đang pha chế → đã phục vụ → đã thanh toán (hoặc hủy)
- Khi thanh toán/hủy đơn, bàn tự động chuyển lại trạng thái còn trống
- Bảng điều khiển: doanh thu hôm nay, số đơn hôm nay, đơn đang xử lý, top sản phẩm bán chạy

## Hướng phát triển tiếp theo (gợi ý)

- Quản lý người dùng/nhân viên (CRUD tài khoản) cho admin
- In hóa đơn / xuất PDF
- Báo cáo doanh thu theo ngày/tháng, biểu đồ
- Quản lý nguyên liệu / tồn kho
