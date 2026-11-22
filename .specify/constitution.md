# 🏛️ Hiến pháp Dự án (Constitution)

Đây là tài liệu quy chuẩn kỹ thuật dành cho dự án **SCHOOL UNIVERSE**, áp dụng cho mọi đoạn code được viết ra để đảm bảo tính đồng nhất, bảo mật và hiệu suất.

## 1. Công nghệ sử dụng (Tech Stack)
- **Backend / API:** Node.js, Vercel Serverless Functions (`api/action.js`), Express (local dev `server.js`), Firebase Admin SDK (`firebase-admin`).
- **Frontend:** Vanilla HTML/JS/CSS (`public/index.html`) sử dụng TailwindCSS (CDN), Lucide Icons và Firebase Firestore JS SDK (compat CDN) cho real-time `onSnapshot`; trang con `/gm/` dùng React + Vite (`gm-assistant/` → `public/gm/`).
- **Lưu trữ & State Management:** Firebase Cloud Firestore (`werewolf_server/state` làm Source of Truth bị khóa rules, `werewolf_views/{secretToken}` cho từng người chơi, `hub/meta`, `messages`, `match_history`).
- **Deployment:** 100% Vercel (`vercel.json`) + Firebase Firestore.

## 2. Phong cách viết code (Coding Style)
- Giữ code **đơn giản (KISS)** và ưu tiên hiệu năng thực thi của vòng lặp Socket.IO.
- Với **Backend (server.js)**: Hạn chế tối đa blocking code. Các sự kiện (event) phải ngắn gọn. Xử lý timeout/interval bằng `setTimeout/setInterval` nhưng cần check đúng context (ví dụ: đang ở đúng ngày/đêm đó).
- Với **Frontend (index.html)**: Thay đổi DOM trực tiếp bằng JavaScript thuần (`document.getElementById`). Đặt ID rõ ràng cho các element. CSS class tuân thủ utility-first của Tailwind.
- Phải có tính năng bảo mật **Anti-Meta Gaming**: Dữ liệu gửi xuống Client phải luôn được che đi (Masking) trước khi emit. Tuyệt đối không gửi toàn bộ `serverGameState` gốc xuống client.

## 3. Quy chuẩn đặt tên file & biến
- **Thư mục & Tệp tin:** Sử dụng `kebab-case` hoặc `snake_case`. Các thư mục tĩnh gom về `public/`.
- **Biến trạng thái toàn cục:** Viết theo kiểu camelCase (VD: `globalUsers`, `serverGameState`).
- **Sự kiện Socket.IO:** Sử dụng `snake_case` hoặc `kebab-case` mang tính hành động (VD: `start_werewolf_match`, `update_game_state`).
- **Hằng số:** Đặt tên bằng CHỮ_HOA (VD: `WAITING`, `DAY_TRIAL`, `WEREWOLF_TEAM`).

## 4. Xử lý Trạng Thái (State Management)
- Toàn bộ State tập trung ở Backend (`server.js`) đóng vai trò Source of Truth.
- Luôn sử dụng hàm trung gian (như `getMaskedStateForUser(uId)`) để trích xuất State hợp lệ gửi cho đúng Socket ID đó.
- Cập nhật State thường dùng hàm `broadcastGameState()` hoặc emit thẳng tới `io.to(room/socket)`.

## 5. Quy chuẩn viết Unit Test
- Hiện tại dự án chưa cài đặt framework test (VD: Jest, Mocha).
- **Quy tắc khi bổ sung (Tương lai):** Mọi hàm logic độc lập (ví dụ `checkAutoProgress()`, `processCascadingDeaths()`, `getMaskedStateForUser()`) phải được tách rời khỏi Object Socket.IO để có thể test độc lập với các Test Runner.
- Khi viết Test, tập trung mock Object State và xem kết quả sau State có chính xác hay không thay vì mock Event.

## 6. Quy chuẩn Phát hành & Thông báo Cập nhật (Release Versioning)
- Mọi lần đẩy tính năng mới hoặc bản sửa lỗi lớn lên production **BẮT BUỘC** phải tăng phiên bản bằng lệnh:
  `npm run release -- <x.y.z> "<Tên bản cập nhật>" "<Ghi chú 1>" "<Ghi chú 2>"`
- Lệnh này tự động đồng bộ `package.json`, `public/version.json` (có lịch sử changelog) và `APP_VERSION` / `APP_RELEASE_NAME` trong `public/index.html` để người dùng trên cả máy tính và điện thoại nhận ngay thông báo cập nhật nóng hổi.
