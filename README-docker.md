# 🐳 Hướng Dẫn Quản Lý Docker — RapPhim

> **⚠️ QUAN TRỌNG:** Đây là hướng dẫn bắt buộc phải đọc trước khi thao tác với Docker để **TRÁNH MẤT DỮ LIỆU** đã crawl.

---

## 📦 Cấu Trúc Container

| Container | Vai trò | Port |
|---|---|---|
| `rapphim-db` | PostgreSQL Database | 5433 |
| `rapphim-backend` | Node.js API + Scraper | 4000 |
| `rapphim-frontend` | Next.js | 80 |
| `rapphim-pgadmin` | PgAdmin DB GUI | 5050 |
| `rapphim-db-backup` | Auto backup mỗi 30 phút | — |

---

## ✅ Các Lệnh AN TOÀN (KHÔNG mất dữ liệu DB)

### Khởi động tất cả container
```bash
docker compose up -d
```

### Dừng tất cả container (GIỮ nguyên dữ liệu DB)
```bash
docker compose stop
```

### Khởi động lại container
```bash
docker compose restart
```

### Khởi động lại một container cụ thể
```bash
docker compose restart backend
docker compose restart frontend
docker compose restart postgres
```

### Build lại và khởi động (sau khi sửa code)
```bash
# Build lại backend + frontend mà không xóa DB
docker compose up -d --build backend frontend
```

---

## 🔴 LỆNH NGUY HIỂM — Xóa toàn bộ DB!

> **TUYỆT ĐỐI KHÔNG CHẠY** lệnh này trừ khi bạn muốn **reset sạch hoàn toàn** (mất hết phim đã crawl):

```bash
# ❌ XÓA TOÀN BỘ DỮ LIỆU — KHÔNG CHẠY!
docker compose down -v
```

Sự khác biệt:

| Lệnh | Containers | DB Data |
|---|---|---|
| `docker compose stop` | ⏸️ Dừng | ✅ Giữ nguyên |
| `docker compose down` | 🗑️ Xóa container | ✅ Giữ nguyên |
| `docker compose down -v` | 🗑️ Xóa container | ❌ **XÓA HẾT** |

---

## 📋 Xem Logs

### Xem logs của một container (realtime)
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Xem 100 dòng logs gần nhất
```bash
docker compose logs --tail=100 backend
```

---

## 🎬 Chạy Scraper Thủ Công

### Mở bash vào container backend
```bash
docker compose exec backend bash
```

### Bên trong container, chạy scraper:
```bash
# Crawl tất cả nguồn (incremental — chỉ lấy phim mới)
/app/scraper-venv/bin/python main.py crawl --source all --mode incremental

# Crawl toàn bộ (full — lấy lại tất cả, chậm hơn)
/app/scraper-venv/bin/python main.py crawl --source all --mode full

# Import lần đầu danh sách phim theo dõi (tracked movies)
/app/scraper-venv/bin/python find_and_track_movies.py import

# Cập nhật phim theo dõi ngay (không cần chờ 2AM)
/app/scraper-venv/bin/python find_and_track_movies.py update

# Xem thống kê DB
/app/scraper-venv/bin/python main.py stats
```

---

## 🎯 Quy Trình Tracked Movies (Phim Theo Dõi Đặc Biệt)

Hệ thống tự động theo dõi các phim trong danh sách `scraper/tracked_movies.json`:

1. **Import lần đầu** (chạy 1 lần):
   - Tìm kiếm song song trên **OPhim + KKPhim + NguonPhim**
   - Import tất cả server/episode từ mọi nguồn
   - Lưu kết quả vào `scraper/tracked_movies.json`

2. **Cập nhật hàng ngày** (tự động lúc 2:00 AM):
   - Đọc `tracked_movies.json`
   - Với mỗi phim chưa hoàn tất → gọi API từng nguồn lấy tập mới
   - Phim đã Full → tự động bỏ qua (tiết kiệm tài nguyên)

### Thêm phim mới vào danh sách theo dõi:
Mở file `scraper/find_and_track_movies.py`, thêm tên phim vào mảng `TRACKED_MOVIES`:
```python
TRACKED_MOVIES = [
    "Tên phim mới",
    # ...
]
```
Sau đó chạy lại `import` trong container.

---

## 🔍 Kiểm Tra Trạng Thái

### Kiểm tra container còn sống không
```bash
docker compose ps
```

### Kiểm tra scraper đang chạy không (qua API)
```bash
curl http://localhost:4000/api/scraper/status
```

### Kiểm tra DB kết nối
```bash
curl http://localhost:4000/api/health
```

---

## 💾 Backup & Restore Database

### Backup thủ công
```bash
docker compose exec postgres pg_dump -U rapphim rapphim > backup_$(date +%Y%m%d).sql
```

### Restore từ backup
```bash
cat backup_20240101.sql | docker compose exec -T postgres psql -U rapphim rapphim
```

> Backup tự động mỗi 30 phút nằm tại `D:\Code\code\rapphim\DataDB\`
