# 🏛️ Kiến trúc Dự án (Architecture)

Tài liệu này mô tả bức tranh tổng thể về dự án **SCHOOL Universe (Lighter Backend)**, làm cơ sở để tiếp tục phát triển các tính năng (Spec) tiếp theo một cách an toàn mà không phá vỡ logic cũ.

## 1. Cấu trúc Thư mục và File
- `server.js`: **[HOÀN THÀNH 70%]** Trái tim của ứng dụng Backend. Chứa logic Express.js cho static files, và Socket.IO cho toàn bộ real-time logic (Lobby, Chat, Werewolf Engine, Gartic Phone).
- `public/`: Thư mục chứa tài nguyên tĩnh của Frontend.
  - `public/index.html`: **[HOÀN THÀNH 70%]** Toàn bộ giao diện người dùng (UI) Single Page Application, viết bằng HTML thuần, TailwindCSS (CDN) và tương tác với DOM qua JavaScript.
- `GAME_FLOW.md`: Mô tả luật chơi, luồng game chi tiết.
- `package.json`: Chứa metadata dự án và các dependencies (express, socket.io, cors).
- `vercel.json`: Cấu hình deploy lên nền tảng Vercel.
- `.specify/`: Thư mục cấu hình cho Spec Kit (chứa constitution và các config liên quan).

## 2. Kiến trúc Tổng quan (High-Level Architecture)
- **Monolithic Real-time Server:** Dự án sử dụng mô hình Server-Client thông qua WebSocket (Socket.IO).
- **In-memory State:** Dữ liệu (globalUsers, serverGameState, garticState) được giữ trực tiếp trên RAM của tiến trình Node.js thay vì dùng Database rời (MongoDB/Redis) để ưu tiên tốc độ cao.
- **Vanilla Frontend:** Không sử dụng framework Frontend (React/Vue). UI được render/update hoàn toàn qua Vanilla JS event listeners.

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
