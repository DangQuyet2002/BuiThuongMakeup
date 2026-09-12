# Bùi Thương Makeup — Backend đặt lịch makeup

Backend Node.js + Express + SQLite cho landing page đặt lịch makeup.

## Chạy dự án

**Cách nhanh nhất (Windows):** bấm đúp vào **`start.bat`** ở thư mục gốc dự án — nó tự vào đúng thư mục, tự cài thư viện nếu thiếu, tự mở trình duyệt và khởi động máy chủ.

**Bằng dòng lệnh:**

```bash
cd backend
npm install          # chỉ cần chạy lần đầu
npm run seed         # nạp dữ liệu mẫu (chỉ cần chạy lần đầu)
npm start            # khởi động server
```

Sau đó mở:

| Trang | Địa chỉ |
|---|---|
| Trang chủ (landing page) | http://localhost:3000 |
| Quản trị đơn đặt lịch | http://localhost:3000/admin.html |
| Kiểm tra API | http://localhost:3000/api/health |

Chạy chế độ tự khởi động lại khi sửa code:

```bash
npm run dev
```

Tắt máy chủ: nhấn **Ctrl + C** tại cửa sổ đang chạy.

Cổng 3000 đang bị chiếm (báo `EADDRINUSE`)? Đổi cổng:

```bash
PORT=3001 npm start
```

### Lần đầu đăng nhập quản trị

Lần đầu khởi động, hệ thống **tự tạo một tài khoản chủ studio** và in ra màn hình:

```
┌─────────────────────────────────────────────┐
│  TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN                │
├─────────────────────────────────────────────┤
│  Tên đăng nhập : admin                      │
│  Mật khẩu      : MocAdmin@2026              │
└─────────────────────────────────────────────┘
```

Tạo thêm tài khoản bằng dòng lệnh:

```bash
npm run create-admin <tên-đăng-nhập> [vai-trò] [mật-khẩu]

# Ví dụ — tự sinh mật khẩu mạnh
npm run create-admin linh staff

# Ví dụ — chỉ định mật khẩu
npm run create-admin thu staff 'Thu@2026abc'
```

Vai trò: `owner` (toàn quyền) · `staff` (xem + xử lý đơn) · `viewer` (chỉ xem).

> Đặt biến `ADMIN_USERNAME` / `ADMIN_PASSWORD` trước lần chạy đầu để tự chọn tài khoản khởi tạo.

### Các lệnh khác

```bash
npm run seed          # nạp lại dữ liệu mẫu (xoá đơn cũ)
npm run db            # xem database ngay trong dòng lệnh
npm run backup        # sao lưu database vào backups/
npm run create-admin  # thêm tài khoản quản trị
npm test              # chạy 130 trường hợp kiểm thử (3 bộ)
```

## Biến môi trường

Tất cả đều không bắt buộc — không cấu hình thì hệ thống vẫn chạy bình thường.

### Máy chủ

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng server |
| `ADMIN_USERNAME` | `admin` | Tên tài khoản chủ studio tạo lần đầu |
| `ADMIN_PASSWORD` | `MocAdmin@2026` | Mật khẩu tài khoản tạo lần đầu |
| `SESSION_TTL_HOURS` | `12` | Phiên đăng nhập sống bao lâu |
| `ADMIN_TOKEN` | _(trống)_ | Bật lại mã chung cũ (không khuyến khích) |
| `UPLOADS_DIR` | `backend/uploads` | Nơi lưu ảnh tải lên từ trang quản trị |
| `MAX_UPLOAD_MB` | `5` | Dung lượng tối đa mỗi ảnh (MB) |

### Zalo ZNS

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ZALO_ACCESS_TOKEN` | _(trống)_ | Token Zalo OA, có token mới gửi được tin |
| `ZALO_TEMPLATE_BOOKING` | _(trống)_ | Mã template ZNS xác nhận đơn mới |
| `ZALO_TEMPLATE_REMINDER` | _(trống)_ | Mã template ZNS nhắc hẹn |
| `ZALO_TEMPLATE_STATUS` | _(trống)_ | Mã template ZNS đổi trạng thái |
| `ZNS_DRY_RUN` | `0` | Đặt `1` để mô phỏng gửi, không gửi tin thật |
| `ZNS_MAX_RETRIES` | `3` | Số lần thử lại khi gửi lỗi |
| `REMINDER_ENABLED` | `1` | Đặt `0` để tắt job nhắc hẹn |
| `REMINDER_INTERVAL_MS` | `900000` | Khoảng cách giữa hai lần quét (15 phút) |
| `REMINDER_HOURS_AHEAD` | `24` | Nhắc trước bao nhiêu giờ |

### Ghi log

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LOG_DIR` | `backend/logs` | Thư mục chứa file log |
| `LOG_LEVEL` | `info` | Mức log: `debug` · `info` · `warn` · `error` |
| `LOG_TO_FILE` | `1` | Đặt `0` để chỉ in ra màn hình |
| `LOG_PRETTY` | `0` | Đặt `1` để log dễ đọc khi phát triển |

Ví dụ chạy đầy đủ:

```bash
PORT=3000 \
SESSION_TTL_HOURS=8 \
ZALO_ACCESS_TOKEN=xxx \
ZALO_TEMPLATE_BOOKING=111222 \
ZALO_TEMPLATE_REMINDER=333444 \
ZALO_TEMPLATE_STATUS=555666 \
npm start
```

## Cấu trúc thư mục

```
Make/
├── index.html              # Landing page (gọi API thật)
├── admin.html              # Trang quản trị: đơn, dịch vụ & giá, ảnh, thông báo, tài khoản, nhật ký
├── api-client.js           # Lớp gọi API dùng chung
├── start.bat               # Bấm đúp để chạy máy chủ (Windows)
├── db.bat                  # Bấm đúp để xem database (Windows)
└── backend/
    ├── server.js           # Điểm khởi động Express
    ├── test-auth.js        # Kiểm thử đăng nhập / phân quyền / rate limit
    ├── test-catalog.js     # Kiểm thử quản lý dịch vụ, giá, ảnh
    ├── test-e2e.js         # Kiểm thử vòng tròn: quản trị → trang công khai
    ├── package.json
    ├── db/
    │   ├── database.js     # Kết nối SQLite + schema + migration
    │   ├── seed.js         # Dữ liệu mẫu
    │   ├── view.js         # Xem database từ dòng lệnh
    │   ├── backfill-content.js # Điền nội dung hiển thị cho dữ liệu cũ
    │   ├── backup.js       # Sao lưu database
    │   ├── create-admin.js # Tạo tài khoản từ dòng lệnh
    │   ├── moc-studio.db   # File database (tự sinh)
    │   └── backups/        # Các bản sao lưu (tự sinh)
    ├── uploads/            # Ảnh do quản trị viên tải lên (tự sinh)
    ├── logs/               # app.log + error.log (tự sinh)
    ├── src/
    │   ├── booking.js      # Logic nghiệp vụ: slot, giá, đặt lịch
    │   ├── catalog.js      # Quản lý dịch vụ, giá, combo, chuyên viên
    │   ├── gallery.js      # Quản lý thư viện ảnh
    │   ├── settings.js     # Nội dung trang chủ (ảnh đầu trang)
    │   ├── uploads.js      # Nhận và lưu file ảnh tải lên
    │   ├── auth.js         # Băm mật khẩu (scrypt), sinh token
    │   ├── users.js        # Tài khoản, phiên, phân quyền, nhật ký
    │   ├── auth-middleware.js # Xác thực request + kiểm tra quyền
    │   ├── logger.js       # Ghi log ra file (pino)
    │   ├── notify.js       # Gọi Zalo ZNS API
    │   ├── notifications.js# Ghi log + điều phối thông báo
    │   ├── rate-limit.js   # Chống spam (lưu trong SQLite)
    │   └── reminder-job.js # Job nhắc hẹn tự động
    └── routes/
        ├── api.js          # API công khai cho khách
        └── admin.js        # API quản trị (cần đăng nhập)
```

## API công khai

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra server còn sống |
| GET | `/api/services` | Danh mục dịch vụ, dịch vụ kèm, combo, chuyên viên |
| GET | `/api/gallery` | Thư viện ảnh so sánh trước/sau |
| GET | `/api/settings` | Nội dung trang chủ (ảnh đầu trang) |
| GET | `/api/slots?date=YYYY-MM-DD` | Khung giờ trống của ngày |
| GET | `/api/slots?date=...&artistId=2` | Khung giờ trống theo từng chuyên viên |
| GET | `/api/artists?date=...&time=...&duration=...` | Chuyên viên còn rảnh giờ đó |
| POST | `/api/bookings` | Tạo đơn đặt lịch |
| POST | `/api/hold` | Kiểm tra nhanh một khung giờ còn trống không |
| GET | `/api/bookings/lookup?code=...` | Tra cứu đơn theo mã |
| GET | `/api/bookings/lookup?phone=...` | Tra cứu đơn theo số điện thoại |

### Ví dụ tạo đơn

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-09-18",
    "time": "10:00",
    "serviceId": 2,
    "addonIds": [1, 2],
    "customer": "Nguyễn Thu Hà",
    "phone": "0912345678",
    "note": "Cưới buổi sáng, muốn tông tự nhiên"
  }'
```

Phản hồi thành công (HTTP 201):

```json
{
  "ok": true,
  "data": {
    "code": "MC2026091101",
    "service_name": "Makeup cô dâu",
    "date": "2026-09-18",
    "time": "10:00",
    "duration": 90,
    "total": 2730000,
    "status": "pending"
  }
}
```

## Xác thực và phân quyền

Hệ thống dùng **tài khoản riêng cho từng người**, không dùng mã chung.

**Cách hoạt động**

1. Đăng nhập bằng `POST /api/admin/login` với `{ username, password }`.
2. Server trả về `token` (phiên sống 12 giờ, lưu trong SQLite dưới dạng băm SHA-256).
3. Mọi request sau đó gửi kèm header `Authorization: Bearer <token>`.
4. Hết hạn hoặc bị thu hồi → server trả `401` kèm mã `SESSION_EXPIRED`, trang tự đưa về màn hình đăng nhập.

**Bảo mật mật khẩu** — Băm bằng `scrypt` (N=16384, r=8, p=1) với salt riêng cho từng người. So sánh bằng `timingSafeEqual` để chống tấn công đo thời gian.

**Ba vai trò**

| Vai trò | Xem dữ liệu | Xử lý đơn / gửi tin | Quản lý tài khoản |
|---|---|---|---|
| `owner` — Chủ studio | ✓ | ✓ | ✓ |
| `staff` — Nhân viên | ✓ | ✓ | ✗ |
| `viewer` — Chỉ xem | ✓ | ✗ | ✗ |

Trang quản trị tự ẩn các nút mà vai trò không được phép. Nếu cố gửi request vượt quyền, server trả `403` kèm mã `FORBIDDEN` và ghi lại vào nhật ký.

**Đăng xuất mọi thiết bị** — Chủ studio có thể thu hồi toàn bộ phiên của một tài khoản (dùng khi nghi ngờ lộ mật khẩu). Đặt lại mật khẩu cũng tự thu hồi mọi phiên.

## API quản trị

Mọi request (trừ `login` và `auth-status`) cần header `Authorization: Bearer <token>`.

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/admin/login` | — | Đăng nhập, trả về token |
| GET | `/api/admin/auth-status` | — | Số tài khoản, phiên đang mở |
| GET | `/api/admin/me` | read | Thông tin người đang đăng nhập |
| POST | `/api/admin/logout` | read | Thu hồi phiên hiện tại |
| POST | `/api/admin/change-password` | read | Đổi mật khẩu (cần mật khẩu cũ) |
| GET | `/api/admin/stats` | read | Số liệu tổng quan |
| GET | `/api/admin/bookings` | read | Danh sách đơn (lọc được) |
| GET | `/api/admin/bookings/:code/detail` | read | Chi tiết đơn kèm lịch sử tin |
| PATCH | `/api/admin/bookings/:id/status` | write | Đổi trạng thái |
| DELETE | `/api/admin/bookings/:id` | write | Huỷ đơn |
| GET | `/api/admin/notifications` | read | Lịch sử gửi tin |
| GET | `/api/admin/notifications/stats` | read | Trạng thái Zalo + job nhắc hẹn |
| POST | `/api/admin/notifications/:id/retry` | write | Gửi lại một tin |
| POST | `/api/admin/reminders/run` | write | Chạy quét nhắc hẹn ngay |
| GET | `/api/admin/reminders/preview` | read | Xem trước đơn sắp tới hạn nhắc |
| POST | `/api/admin/users` | owner | Tạo tài khoản |
| GET | `/api/admin/users` | owner | Danh sách tài khoản |
| PATCH | `/api/admin/users/:id/active` | owner | Khoá / mở khoá tài khoản |
| POST | `/api/admin/users/:id/reset-password` | owner | Đặt lại mật khẩu |
| GET | `/api/admin/users/:id/sessions` | owner | Xem các phiên đang mở |
| DELETE | `/api/admin/users/:id/sessions` | owner | Đăng xuất mọi thiết bị |
| GET | `/api/admin/audit` | owner | Nhật ký thao tác |

Tham số lọc cho `/api/admin/bookings`: `date`, `status`, `phone`, `limit`.
Tham số lọc cho `/api/admin/notifications`: `bookingId`, `type`, `status`, `limit`.
Tham số lọc cho `/api/admin/audit`: `action`, `limit` (tối đa 500).

Giá trị `status` của đơn: `pending` · `confirmed` · `done` · `cancelled`.
Giá trị `status` của thông báo: `sent` · `dry_run` · `skipped` · `failed`.
Giá trị `type` của thông báo: `booking` · `reminder` · `status`.

Khi đổi trạng thái đơn, có thể tắt thông báo bằng cách gửi `"notify": false` trong body.

### Ví dụ đăng nhập và gọi API

```bash
# 1. Đăng nhập, lấy token
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"VScY9J!&k@r9$Q"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.token))")

# 2. Gọi API kèm token
curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $TOKEN"
```

## Nhật ký thao tác (audit log)

Mọi hành động làm thay đổi dữ liệu đều được ghi lại: đổi trạng thái đơn, huỷ đơn, gửi lại tin, tạo/khoá tài khoản, đặt lại mật khẩu, đăng xuất thiết bị — **kể cả các request bị từ chối vì thiếu quyền**.

Mỗi bản ghi lưu: ai làm, làm gì, vào lúc nào, từ IP nào, chi tiết đối tượng. Xem tại tab **Nhật ký thao tác** trong trang quản trị (chỉ chủ studio).

## Quản lý nội dung hiển thị

Toàn bộ nội dung trên trang chủ — tên gói, giá tiền, quyền lợi, combo, chuyên viên, ảnh — đều **sửa được trong trang quản trị**, không cần động vào code.

Mở `http://localhost:3000/admin.html` rồi vào hai tab:

### Tab "Dịch vụ & giá"

Bốn mục con: **Dịch vụ** · **Combo** · **Dịch vụ kèm** · **Chuyên viên**.

Mỗi mục là một bảng, có nút **Sửa** (mở form điền thông tin), **Ẩn/Hiện** và **Xoá**.

Thông tin sửa được của một dịch vụ:

| Trường | Ghi chú |
|---|---|
| Tên dịch vụ | Hiện thành tiêu đề thẻ giá |
| Giá tiền | Chỉ nhập số, ví dụ `650000` |
| Thời lượng | Từ 15 đến 480 phút — dùng để tính khung giờ trống |
| Dòng thời gian hiển thị | Ví dụ `60 phút · 1 người` |
| Nhãn nổi bật | Hiện thành nhãn nhỏ trên thẻ, ví dụ `Được chọn nhiều` |
| Mô tả ngắn | Hiện dưới tên dịch vụ |
| Quyền lợi | Mỗi dòng một ý, hiện thành danh sách gạch đầu dòng |
| Đánh dấu nổi bật | Thẻ được tô màu hồng nổi bật |

**Sửa giá ở đây là đổi luôn giá trên trang chủ** — trang chủ đọc trực tiếp từ database, không có bản sao nào cần đồng bộ.

**Nên dùng "Ẩn" thay vì "Xoá"** khi gói đó đã từng có khách đặt. Hệ thống sẽ chặn nếu bạn cố xoá một dịch vụ đang gắn với đơn, và gợi ý chuyển sang Ẩn. Mục đã ẩn vẫn giữ nguyên trong lịch sử đơn cũ.

### Tab "Thư viện ảnh"

Đây là nơi thay ảnh minh hoạ mặc định bằng **ảnh thật của studio**.

**Mọi mục trong thư viện đều là ảnh so sánh trước/sau** — mỗi mục cần đúng hai ảnh: một ảnh **TRƯỚC** (lúc chưa trang điểm) và một ảnh **SAU** (đã trang điểm).

- Bấm **"+ Thêm ảnh"** → chọn **ảnh trước** và **ảnh sau** → đặt tiêu đề và danh mục → Lưu
- Thẻ trong trang quản trị hiện **ảnh SAU** kèm nhãn "Sau" để bạn dễ nhận biết

Cách thể hiện trên trang chủ:

| Vị trí | Hiện gì |
|---|---|
| Ô trong lưới "Khách thật — ảnh thật" | **Ảnh SAU** (ảnh đã make) |
| Thanh trượt lớn phía trên lưới | Ảnh trước/sau của mục **đầu tiên** |
| Khi bấm vào một ô trong lưới | Mở hộp xem **so sánh trước/sau** của mục đó |

Hộp xem so sánh có thanh trượt kéo được, nút **‹ ›** để xem mục trước/kế tiếp, đóng bằng nút **×**, bấm ra ngoài, hoặc phím `Esc`. Dùng phím `←` `→` để chuyển ảnh.

> Khi thư viện **còn trống**, trang chủ giữ nguyên hình minh hoạ vẽ sẵn. Ngay khi có ảnh thật, lưới và thanh trượt tự chuyển sang ảnh của bạn.

Ảnh nhận định dạng **JPG, PNG, WEBP, GIF**, tối đa **5MB** mỗi ảnh, mỗi lần tải tối đa 5 ảnh.

Khi gọi API trực tiếp, mỗi ảnh phải nằm trong trường tên **`files`** (dạng `multipart/form-data`):

```bash
curl -X POST http://localhost:3000/api/admin/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@anh-1.jpg" -F "files=@anh-2.jpg"
```

Tạo một mục thư viện ảnh (luôn là so sánh trước/sau):

```bash
curl -X POST http://localhost:3000/api/admin/gallery \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Cô dâu Thu Hà","category":"Cô dâu",
       "beforeImage":"/uploads/anh-truoc.png",
       "afterImage":"/uploads/anh-sau.png"}'
```

Trường `kind` do máy chủ tự đặt thành `compare`; gửi lên giá trị khác cũng bị bỏ qua.

**Khi thư viện còn trống, trang chủ tự dùng hình minh hoạ vẽ sẵn.** Ngay khi bạn tải ảnh thật lên, ảnh của bạn sẽ thay thế. Bạn có thể trộn: chỉ cần một ảnh "so sánh trước/sau" là thanh trượt đã dùng ảnh thật, trong khi lưới bên dưới vẫn giữ hình vẽ nếu chưa tải ảnh nào.

Ảnh được lưu trong `backend/uploads/` và phục vụ qua đường dẫn `/uploads/...`. **Xoá ảnh trong trang quản trị cũng xoá file trên đĩa**, không để lại rác.

### Phân quyền cho phần nội dung

| Vai trò | Xem | Thêm / sửa / ẩn | Xoá |
|---|---|---|---|
| `owner` | ✓ | ✓ | ✓ |
| `staff` | ✓ | ✓ | ✗ |
| `viewer` | ✓ | ✗ | ✗ |

Nhân viên sửa được giá và tải ảnh lên hằng ngày, nhưng chỉ chủ studio mới xoá được. Mọi thao tác đều vào nhật ký.

### API tương ứng

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | `/api/admin/catalog` | read |
| POST | `/api/admin/catalog/:kind` | write |
| PATCH | `/api/admin/catalog/:kind/:id` | write |
| PATCH | `/api/admin/catalog/:kind/:id/active` | write |
| DELETE | `/api/admin/catalog/:kind/:id` | admin |
| POST | `/api/admin/catalog/:kind/reorder` | write |
| POST | `/api/admin/uploads` | write |
| GET | `/api/admin/gallery` | read |
| POST | `/api/admin/gallery` | write |
| PATCH | `/api/admin/gallery/:id` | write |
| PATCH | `/api/admin/gallery/:id/active` | write |
| DELETE | `/api/admin/gallery/:id` | write |
| POST | `/api/admin/gallery/reorder` | write |
| GET | `/api/admin/settings` | read |
| PATCH | `/api/admin/settings` | write |

Tab **Trang chủ** trong trang quản trị dùng hai API `settings` để thay hoặc gỡ ảnh lớn ở đầu trang. Ảnh mới được tải qua `/api/admin/uploads`; nếu chưa đặt ảnh, trang khách tự dùng hình minh hoạ SVG mặc định.

`:kind` nhận một trong: `services` · `addons` · `combos` · `artists`.

Ví dụ đổi giá một dịch vụ:

```bash
curl -X PATCH http://localhost:3000/api/admin/catalog/services/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"price": 699000}'
```

## Gửi tin nhắn Zalo ZNS

Hệ thống gửi tin ở ba thời điểm: **khách vừa đặt lịch**, **trước hẹn 24 giờ**, và **khi bạn đổi trạng thái đơn**.

Mọi lần gửi đều được ghi vào bảng `notification_log`, kèm kết quả, số lần thử và mã tin nhắn. Xem tại tab **Lịch sử thông báo** trong trang quản trị.

### Ba trạng thái của hệ thống

| Trạng thái | Khi nào | Hành vi |
|---|---|---|
| **Chưa cấu hình** | Không có `ZALO_ACCESS_TOKEN` | Ghi log `skipped`, không gửi. Trang vẫn hoạt động bình thường |
| **Chạy thử** | `ZNS_DRY_RUN=1` | Mô phỏng gửi, ghi log `dry_run`. Không có tin nào ra ngoài |
| **Hoạt động** | Có token + template | Gửi thật qua Zalo OA, ghi log `sent` |

Nhờ vậy bạn phát triển và kiểm thử thoải mái mà không sợ gửi tin cho khách thật.

### Bật gửi tin thật

1. Đăng ký Zalo OA và lấy `access_token`.
2. Tạo 3 template ZNS trên trang quản lý Zalo, lấy mã template.
3. Khai báo các biến môi trường ở trên rồi chạy `npm start`.

Tên biến trong template cần khớp với những gì hệ thống gửi lên:

- **Đơn mới**: `ma_don`, `dich_vu`, `ngay_hen`, `gio_hen`, `khach_hang`, `tam_tinh`, `dich_vu_kem`
- **Nhắc hẹn**: `ma_don`, `dich_vu`, `ngay_hen`, `gio_hen`, `khach_hang`
- **Đổi trạng thái**: `ma_don`, `dich_vu`, `ngay_hen`, `gio_hen`, `trang_thai`, `khach_hang`

### Gửi lại khi lỗi

Tin `failed` hoặc `skipped` có nút **Gửi lại** ngay trong bảng. Hệ thống cũng tự thử lại 3 lần khi lỗi tạm thời (mã 108, 109, 111, 112), mỗi lần cách nhau 0,8–2,4 giây.

### Nhắc hẹn tự động

Job chạy nền quét mỗi 15 phút, tìm đơn trong 24 giờ tới và gửi tin nhắc. **Mỗi đơn chỉ nhắc một lần** — hệ thống kiểm tra log trước khi gửi, nên khởi động lại server cũng không gửi trùng.

Bấm **Chạy nhắc hẹn ngay** trong trang quản trị để kiểm tra mà không phải chờ.

## Ghi log

Log được ghi ra file bằng `pino`, tự luân chuyển theo ngày và theo dung lượng:

| File | Nội dung | Giữ lại |
|---|---|---|
| `backend/logs/app.log` | Toàn bộ request + sự kiện | 14 bản |
| `backend/logs/error.log` | Chỉ lỗi (từ mức `error`) | 30 bản |

Mỗi dòng log là JSON, gồm method, đường dẫn, mã trạng thái, thời gian xử lý, IP. **Mật khẩu và token được tự động ẩn** trước khi ghi.

Xem log trực tiếp:

```bash
tail -f backend/logs/app.log
```

Đặt `LOG_PRETTY=1` khi phát triển để log dễ đọc hơn thay vì JSON thô.

## Sao lưu database

```bash
npm run backup
```

Script sẽ khoá ghi tạm thời, sao chép database vào `backend/backups/moc-studio-YYYYMMDD-HHMMSS.db`, rồi mở lại bản sao để **kiểm tra tính toàn vẹn** và đếm số bản ghi. Các bản sao lưu cũ hơn 30 ngày tự động bị xoá (đổi bằng biến `BACKUP_KEEP_DAYS`).

> Ghi chú: tên file sao lưu và tên gói npm vẫn dùng tiền tố `moc-studio` (định danh kỹ thuật cũ) — không ảnh hưởng đến tên hiển thị của website.

Ví dụ kết quả:

```
Đang sao lưu database...
  Nguồn : moc-studio.db
  Đích  : moc-studio-20260911-180358.db
  Kích thước: 132.0 KB
  Kiểm tra tính toàn vẹn: OK
  Nội dung: 4 đơn · 4 dịch vụ · 4 tài khoản · 3 log tin
Sao lưu hoàn tất.
```

Đặt lịch sao lưu tự động hằng ngày bằng cron:

```bash
# 2 giờ sáng mỗi ngày
0 2 * * * cd /duong/dan/backend && npm run backup >> logs/backup.log 2>&1
```

## Xem database

Database là **một file duy nhất**: `backend/db/moc-studio.db` (định dạng SQLite).

### Cách 1 — Xem ngay trong dòng lệnh (không cần cài gì)

Dự án có sẵn công cụ xem database, dùng luôn thư viện đã cài:

```bash
cd backend

npm run db                        # liệt kê 11 bảng kèm số dòng
npm run db -- bookings            # xem 20 đơn đầu tiên
npm run db -- bookings 50         # xem 50 đơn
npm run db -- bookings --all      # xem tất cả
npm run db -- users               # xem tài khoản (mật khẩu tự động bị ẩn)
npm run db -- --schema bookings   # xem cấu trúc bảng: cột, khóa ngoại, chỉ mục
npm run db -- --sql "SELECT code, customer, total FROM bookings WHERE status='pending'"
```

Hoặc bấm đúp vào **`db.bat`** ở thư mục gốc dự án.

Kết quả trông như thế này:

```
  Bảng users  4 dòng tổng cộng

┌────┬──────────┬──────────────┬────────────────┬────────┬────────┐
│ id │ username │ display_name │ password_hash  │ role   │ active │
├────┼──────────┼──────────────┼────────────────┼────────┼────────┤
│ 1  │ admin    │ admin        │ •••••• (đã ẩn) │ owner  │ 1      │
│ 2  │ linh     │ linh         │ •••••• (đã ẩn) │ staff  │ 1      │
│ 3  │ mai      │ mai          │ •••••• (đã ẩn) │ viewer │ 1      │
└────┴──────────┴──────────────┴────────────────┴────────┴────────┘
```

Cột chứa mật khẩu hoặc token được **tự động che** khi hiển thị.

> Lưu ý cú pháp: phải có `--` trước tham số, ví dụ `npm run db -- users`.
> Dấu `--` báo cho npm biết phần sau là tham số truyền cho script, không phải của npm.

### Cách 2 — Phần mềm giao diện (dễ dùng nhất)

**DB Browser for SQLite** — miễn phí, nhẹ, tải tại https://sqlitebrowser.org

Cài xong mở file `D:\Project\Make\backend\db\moc-studio.db`, rồi vào tab **Browse Data** để xem và sửa trực tiếp như Excel.

### Cách 3 — VS Code (bạn đã có sẵn)

1. Mở VS Code, vào tab **Extensions** (Ctrl+Shift+X)
2. Tìm **`SQLite Viewer`** (tác giả Florian Klampfer) → **Install**
3. Bấm vào file `backend/db/moc-studio.db` trong cây thư mục → dữ liệu hiện ra dạng bảng

### Lưu ý khi xem database

**Máy chủ đang chạy vẫn xem được.** SQLite ở chế độ WAL cho phép nhiều người đọc cùng lúc, nên bạn xem dữ liệu thoải mái mà không cần tắt server.

**Đừng sửa trực tiếp khi server đang chạy.** Nếu dùng DB Browser để sửa/xoá dòng, hãy tắt máy chủ trước (Ctrl+C) rồi mở lại sau, tránh hai bên ghi đè nhau. Cách an toàn hơn là dùng trang quản trị `/admin.html` — mọi thao tác ở đó đều đi qua API và được kiểm tra hợp lệ.

**Nếu database bị hỏng**, khôi phục từ bản sao lưu gần nhất:

```bash
cd backend
cp backups/moc-studio-20260911-181050.db db/moc-studio.db
```

**Xem nhanh danh sách 11 bảng**: `bookings` (đơn) · `services` (dịch vụ) · `addons` (dịch vụ kèm) · `combos` (gói) · `artists` (chuyên viên) · `blocked_slots` (giờ khoá) · `notification_log` (lịch sử tin) · `users` (tài khoản) · `sessions` (phiên đăng nhập) · `rate_limits` (bộ đếm chống spam) · `audit_log` (nhật ký thao tác).

## Chống spam

Giới hạn theo IP, trả về HTTP 429 khi vượt:

| Endpoint | Giới hạn |
|---|---|
| Đặt lịch (`POST /api/bookings`) | 5 lần / phút |
| Tra cứu đơn | 20 lần / phút |
| Đọc dữ liệu (dịch vụ, khung giờ) | 120 lần / phút |
| Đăng nhập quản trị | 8 lần / 5 phút |

Bộ đếm được lưu **trong SQLite**, nên chạy nhiều tiến trình cùng lúc vẫn dùng chung hạn mức (khác với lưu trong RAM). Nếu database gặp lỗi, hệ thống **cho request đi qua** thay vì chặn oan — ưu tiên không làm gián đoạn khách hàng.

Mỗi phản hồi kèm header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Khi bị chặn có thêm `Retry-After` cho biết số giây cần chờ.

## Quy tắc nghiệp vụ

**Giờ làm việc** — Thứ 2 đến Thứ 7: 8:00–20:00 · Chủ nhật: 9:00–17:00.

**Chống đặt trùng** — Khi tạo đơn, server kiểm tra lại toàn bộ khung giờ mà ca makeup chiếm dụng. Gói cô dâu 90 phút đặt lúc 10:00 sẽ khoá cả 10:00 và 11:00. Nếu trùng, trả về HTTP 409 kèm mã lỗi `SLOT_TAKEN`.

**Chặn ngày quá khứ** — Không thể đặt lịch cho ngày đã qua, hoặc giờ đã trôi qua trong ngày hôm nay.

**Tính tiền** — Toàn bộ giá được tính lại ở server từ `serviceId` và `addonIds`. Client gửi giá lên cũng không có tác dụng, tránh bị sửa giá.

**Mã đơn** — Định dạng `MC` + ngày + số thứ tự, ví dụ `MC2026091101`.

**Chuẩn hoá số điện thoại** — Tự chuyển `+84912345678` thành `0912345678`. Yêu cầu 10 số bắt đầu bằng `0`.

## Kiểm thử

```bash
# Server phải đang chạy
npm test            # chạy cả ba bộ
node test-auth.js   # chỉ bộ xác thực & phân quyền
```

| Bộ kiểm thử | Số trường hợp | Nội dung |
|---|---|---|
| `test-auth.js` | 54 | Đăng nhập đúng/sai, token giả, phiên hết hạn, ma trận phân quyền ba vai trò, đổi mật khẩu, quản lý tài khoản (tạo/khoá/mở/đặt lại/đăng xuất thiết bị), nhật ký thao tác, rate limit đăng nhập |
| `test-catalog.js` | 68 | CRUD dịch vụ/combo/dịch vụ kèm/chuyên viên, sửa giá, ẩn/hiện, sắp xếp, phân quyền ghi/xoá, tải ảnh lên, thư viện ảnh so sánh trước/sau, dọn file khi xoá |
| `test-e2e.js` | 18 | Vòng tròn đầy đủ: sửa giá và ẩn/hiện dịch vụ trong trang quản trị → kiểm tra trang công khai đổi theo; tải hai ảnh → tạo mục so sánh → xem công khai → xoá → file trên đĩa cũng bị xoá |

Tổng cộng **140 trường hợp**. Cả ba bộ đều tự dọn dẹp dữ liệu thử và tự xoá bộ đếm rate limit khi bắt đầu, nên chạy lại liên tục vẫn cho kết quả như nhau.

> Nếu bị chặn vì rate limit (chỉ xảy ra khi chạy bộ kiểm thử cũ), xoá bộ đếm:
> `node -e "import('./db/database.js').then(({db})=>db.prepare('DELETE FROM rate_limits').run())"`

## Chế độ xem trước

Nếu backend chưa chạy mà mở `index.html`, trang tự chuyển sang chế độ xem trước: hiện dải thông báo, dùng dữ liệu mẫu trong `api-client.js`, và khung giờ sinh cục bộ. Mọi tính năng vẫn bấm được để xem giao diện, nhưng đơn **không được lưu**.

## Việc còn lại nếu triển khai thật

- **HTTPS** — cần đặt sau reverse proxy (Nginx/Caddy) khi đưa lên internet. Server đã bật `trust proxy` và đọc `X-Forwarded-For` đúng cách.
- **Xác thực số điện thoại (OTP)** — hiện chưa gửi OTP, khách có thể nhập số người khác. Cân nhắc thêm OTP (Zalo ZNS hoặc SMS) nếu cần chống đặt lịch phá.
- **Rate limit tập trung** — đã chuyển từ RAM sang SQLite nên nhiều tiến trình dùng chung được. Nếu chạy nhiều máy chủ, nên chuyển sang Redis.
- **Quên mật khẩu tự phục vụ** — hiện chủ studio phải đặt lại mật khẩu hộ. Cân nhắc thêm luồng gửi link đặt lại qua email.
