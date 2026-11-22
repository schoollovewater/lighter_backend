# 🏛️ Kiến trúc Dự án (Architecture)

Tài liệu này mô tả bức tranh tổng thể về dự án **SCHOOL UNIVERSE**, làm cơ sở để tiếp tục phát triển các tính năng (Spec) tiếp theo một cách an toàn mà không phá vỡ logic cũ.

## 1. Cấu trúc Thư mục và File
- `api/action.js`: Endpoint Serverless duy nhất trên Vercel (`POST /api/action` & `GET /api/action`) xử lý toàn bộ hành động game, chống gian lận và ghi dữ liệu vào Firebase Firestore.
- `lib/firebaseAdmin.js`: Khởi tạo Firebase Admin SDK (đọc từ biến môi trường `FIREBASE_SERVICE_ACCOUNT_JSON` trên Vercel hoặc file `*firebase-adminsdk*.json` khi chạy local).
- `lib/gameEngine.js`: Động cơ Ma Sói 17 roles + Sảnh chờ + Gartic Phone + Voice Signaling, chạy bằng Firestore Transaction và xuất bản `werewolf_views/{secretToken}` đã che vai trò cho từng người chơi.
- `server.js`: Express server dùng cho chạy local (`npm start`), mount cùng handler `api/action.js` như Vercel để đảm bảo môi trường dev và production đồng nhất 100%.
- `firestore.rules`: Bộ Security Rules chặn client đọc `werewolf_server/state` và cấm liệt kê `werewolf_views`.
- `public/`: Thư mục chứa tài nguyên tĩnh của Frontend.
  - `public/index.html`: Giao diện chính (Online Hub, Đấu Trường Ma Sói Online, Gartic Phone, Lịch Sử Đấu), lắng nghe real-time từ Firebase Firestore (`onSnapshot`) và gửi hành động tới `/api/action`.
  - `public/gm/`: Bản build tĩnh của ứng dụng **Trợ Lý Quản Trò Ma Sói Offline** (truy cập qua `/gm`).
- `gm-assistant/`: Mã nguồn React + Vite của trang con Trợ Lý Quản Trò Offline (build ra `public/gm/` bằng `npm run build:gm`).

## 2. Kiến trúc Tổng quan (High-Level Architecture)
- **100% Serverless Real-time (Vercel + Firebase Firestore):**
  - Vercel host tĩnh toàn bộ Frontend (`/`, `/gm/`) và chạy Serverless Function `/api/action`.
  - Firebase Firestore lưu trữ vĩnh viễn (Chat, Lịch sử trận đấu, Trạng thái phòng) và đẩy cập nhật real-time (`onSnapshot`) về trình duyệt với độ trễ thấp, không bị ngủ như Render Free.
- **Anti-Meta Gaming Tuyệt Đối:** State gốc nằm ở `werewolf_server/state` (Rules chặn 100% client). Mỗi người chơi giữ 1 `secretToken` bí mật riêng để chỉ đọc đúng `werewolf_views/{secretToken}` đã mask cho chính mình.
- **Vanilla Frontend:** Không sử dụng framework Frontend ở bản Online (`public/index.html`). UI cập nhật trực tiếp qua Vanilla JS + TailwindCSS.

## 3. Tình trạng các Module (Modules Status)

### 3.1. Các module đã HOÀN THÀNH (Có thể tái sử dụng/tham chiếu)
- **Hệ thống Sảnh chờ (Lobby & Hub):** Đăng nhập không mật khẩu, quản lý quyền Host (Chủ phòng), phân phối trạng thái initial_state, đồng bộ danh sách online, hệ thống Chat Văn Phòng.
- **Engine Đấu trường Ma Sói (Werewolf Game):**
  - Quản lý State/Phase (WAITING, PRE_GAME, NIGHT, DAY, DAY_VOTING, DAY_TRIAL).
  - Hoàn thiện luồng xử lý tự động (checkAutoProgress, processCascadingDeaths, advanceNightStep).
  - Tích hợp 17 Roles (Dân, Bảo vệ, Phù thủy, Tiên tri, Gấu, Tiên tri, Nguyệt Nữ, Thợ Săn, Nhân bản, Sói, Sói Ẩn, Sói Pháp sư, Sói Cuồng nộ, Sói Đầu đàn, Cupid, Kẻ bị nguyền, Thằng ngốc).
  - Hàm `getMaskedStateForUser()` để bảo mật Anti-meta gaming (Anti-cheat).
  - Tích hợp UI hiển thị Card, Tooltip, Night Progress Bar.

### 3.2. Các module ĐANG BỎ DỞ (Cần phát triển)
- **Gartic Phone SCHOOL:** 
  - Backend đã có State cơ bản (`garticState`) và các event (`sync_gartic_state`, `submit_gartic_turn`), nhưng cấu trúc book và turn logic chưa hoàn thiện hoàn toàn.
  - Frontend UI canvas để vẽ hình chưa được triển khai hoàn chỉnh.
- **Tách nhỏ Code (Refactoring - Tương lai):** `server.js` hiện tại khoảng ~760 dòng và `index.html` ~1500 dòng. Khi dự án lớn hơn, cần cân nhắc chia tách thành các sub-module (ví dụ `socket_werewolf.js`, `socket_gartic.js`, `public/js/werewolf.js`...).

## 4. Ghi chú cho các Tính năng Mới (Spec Mới)
- Khi thêm Spec mới liên quan đến UI: Tìm kiếm và chèn element vào đúng Pane trong `public/index.html` (ví dụ `pane-workspace`, `pane-arena`). Tận dụng lại các CSS class của Tailwind có sẵn (như `bg-moss-card`, `border-moss`, `glow-fire`).
- Khi thêm Spec mới liên quan đến Logic Game: Tìm đến khối comment tương ứng trong `server.js` (ví dụ `// --- ĐỒNG BỘ MA SÓI ---`) và tiếp tục mở rộng. Chú ý luồng cập nhật State và gọi hàm `broadcastGameState()`.
