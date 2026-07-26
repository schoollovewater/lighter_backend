# SCHOOL Universe - Bảng Luồng Trò Chơi (Game Flow)

Tài liệu này lưu trữ lại cấu trúc, luồng hoạt động và trạng thái hiện tại của dự án **SCHOOL Universe** để bạn có thể dễ dàng theo dõi và phát triển tiếp sau này.

---

## 1. Kiến Trúc Hệ Thống (Architecture)
- **Backend:** Node.js, Express, Socket.IO.
- **Frontend:** Vanilla HTML/JS, TailwindCSS.
- **Quản lý dữ liệu:** In-memory (lưu trên RAM server qua các biến toàn cục).
  - `globalUsers`: Lưu trữ thông tin người chơi (socketId, name, avatar, isHost).
  - `serverGameState`: Trạng thái game Ma Sói.
  - `garticState`: Trạng thái game Gartic Phone.

---

## 2. Sảnh Chờ (Hub) & Cơ Chế Hoạt Động
- Không yêu cầu tạo tài khoản/mật khẩu, chỉ cần nhập Tên + chọn Avatar.
- **Hệ thống Chủ phòng (Host):**
  - Người đầu tiên kết nối vào server tự động nhận quyền Host.
  - Nếu Host thoát, hệ thống tự động chuyển quyền Host cho người kế tiếp trong danh sách.
- **Tab Văn Phòng Chat:** Là không gian chat chung thời gian thực cho mọi người trong Hub.

---

## 3. Đấu Trường Ma Sói (Werewolf Hardcore)

### 3.1. Các Trạng Thái Chính (Status)
- `WAITING`: Mọi người đăng ký tham gia (Ghi danh). Host cấu hình số lượng các vai trò.
- `PLAYING`: Trận đấu đang diễn ra.

### 3.2. Vòng Lặp Trò Chơi (Game Phases)
Game chạy xoay vòng qua các pha sau:
1. **PRE_GAME:** Chuẩn bị, Host ấn khởi trận -> Server trộn bài và chia chức色 năng ngẫu nhiên.
2. **NIGHT (Ban Đêm):**
   - Quản trò (Host) điều phối gọi từng chức năng dậy.
   - Các Role thức dậy theo thứ tự quy định trong `nightActiveSteps` (VD: Cupid -> Sói -> Phù thủy -> Tiên tri).
   - **Auto Death Calculation:** Khi hết đêm, server tự động tính toán ai chết dựa trên tương tác chéo (Sói cắn + Phù thủy cứu/độc + Bảo vệ + Chết chùm Cupid/Thợ săn).
3. **DAY (Ban Ngày):** Thông báo người chết trong đêm. Mọi người thảo luận.
4. **DAY_VOTING (Bỏ phiếu):** Thời gian mọi người bỏ phiếu (Vote) cho người mình nghi ngờ là Sói.
5. **DAY_TRIAL (Tòa án tối cao):** Người bị Vote nhiều nhất lên bục. Làng tiếp tục bỏ phiếu **TREO CỔ** hoặc **THA BỔNG**. Xử xong sẽ sang Đêm tiếp theo.

### 3.3. Danh sách Vai trò (Roles) đã chốt
- **Cupid (Thần Tình Yêu - Phe thứ 3):**
  - Cấu hình 2 chế độ:
    - *Chế độ 1 (Bài độc lập)*: 1 người cầm thẻ Cupid, chọn 2 người làm tình nhân. Phe Cupid có 3 người.
    - *Chế độ 2 (Nhập hồn)*: Dành cho ít người. Server chọn ngẫu nhiên 1 người (đang giữ role khác) gán làm Cupid. Người này chọn thêm 1 người. Phe Cupid có 2 người.
  - Cơ chế đêm 1: Sau khi chọn, màn hình của phe Cupid sáng lên, lật mở toàn bộ vai trò thật sự của nhau. Cupid bấm "Xác nhận" thì mới qua lượt đi ngủ.
  - Điều kiện thắng: Cuối bất kỳ pha nào, nếu số lượng người của phe Cupid bằng 1/2 (50%) tổng số người chơi còn sống (VD: 3/6, 2/4, 1/2) thì Phe thứ 3 lập tức chiến thắng.

- **Phe Dân:** Dân làng, Bảo vệ, Phù thủy, Trưởng tộc gấu, Tiên tri, Thám tử, Nguyệt nữ, Thợ săn, Nhân bản.
- **Phe Sói:** Sói thường, Sói ẩn, Sói cuồng nộ, Sói pháp sư.
- **Khác:** Thằng ngốc, Kẻ bị nguyền.

---

## 4. Gartic Phone SCHOOL

### 4.1. Các Chế Độ Chơi (Modes)
- **Normal:** Luân phiên viết câu -> vẽ hình -> đoán câu -> vẽ hình.
- **Knockout:** Thời gian vẽ siêu tốc, chậm sẽ bị loại.
- **Animation:** Chế tạo ảnh động (nhiều người cùng vẽ các frame của 1 chủ đề).
- **Secret:** Che giấu mọi diễn biến cho đến khi tổng kết.

### 4.2. Vòng Lặp Trò Chơi
- `TEXT TURN`: Người chơi gõ một câu mô tả kỳ quặc.
- `DRAW TURN`: Người chơi vẽ dựa trên câu mô tả nhận được (Đã có canvas tích hợp cọ vẽ, bảng màu).
- Hệ thống tuần hoàn (Circular array) chuyển bài giữa những người chơi. Tất cả bài viết/vẽ đều được lưu vào biến `books`.

### 4.3. Review Zone (Triển lãm)
- Sau khi qua hết số vòng bằng số người chơi, game chuyển sang pha kết thúc để mọi người cùng xem lại tác phẩm của nhau.

---

## 5. Tiến Độ Hiện Tại & Việc Cần Làm (TODOs)
*(Cập nhật mới nhất sau khi hoàn thiện 17 Roles)*

**✅ ĐÃ HOÀN THÀNH BỘ 17 ROLES & HỆ THỐNG MA SÓI (SẴN SÀNG KIỂM THỬ):**
- Dựng UI/UX xịn sò với TailwindCSS và Cấu trúc Socket.IO chuẩn xác.
- **Lobby Setup Mới:** Bố cục 3 cột (Dân, Sói, Đột Biến), hiển thị thẻ bài (Card) có Tooltip. Tự động kiểm tra Balance Bar và khoá nút Start nếu chưa đủ bài. Chặn thêm quá 1 vai trò đặc biệt.
- **Giao Diện Đêm Mới:** Thanh tiến trình Ban Đêm (Night Progress Bar) trực quan để theo dõi thứ tự thức dậy.
- **Engine Logic Mới:** Fix kẹt luồng bằng cơ chế Force Skip và Pause/Resume cho Quản Trò, cùng timeout tự động.
- **Anti-Meta Gaming:** Đã bảo mật tuyệt đối dữ liệu trả về `serverGameState` bằng hàm Masking, xoá toàn bộ dấu vết nạn nhân và vai trò để chống gian lận qua F12 (DevTools).
- **Phe Dân Làng (9 Roles):** 
  - *Dân Làng:* Suy luận bắt Sói.
  - *Bảo Vệ:* Khóa bảo vệ 1 người 2 đêm liên tiếp; Chặn Sói nhưng không chặn Độc Phù Thủy.
  - *Phù Thủy:* Dùng 2 bình độc lập (có thể xài chung 1 đêm, có thể tự cứu).
  - *Tiên Tri:* Đã chống cheat soi nhiều người; bị lừa bởi Sói Ẩn và Bùa Sói Pháp Sư.
  - *Thám Tử:* Soi 2 người cùng phe; khóa chống cheat thành công.
  - *Trưởng Tộc Gấu:* Thức dậy ban đêm, hệ thống tự ngửi 2 người sống bên cạnh (bỏ qua xác chết). Có thể bị lừa.
  - *Nguyệt Nữ:* Khóa chức năng đêm, không khóa 1 người 2 đêm liên tiếp.
  - *Thợ Săn:* Thức dậy mỗi đêm để ghim bắn (chống lộ thời gian). Chết chùm vô danh.
  - *Nhân Bản:* Cướp role của mục tiêu khi mục tiêu ngã xuống.
- **Phe Ma Sói (5 Roles):** 
  - *Sói Thường:* Vote đa số cắn chung.
  - *Sói Ẩn:* Soi ra dân.
  - *Sói Pháp Sư:* Yểm bùa mục tiêu thành Sói.
  - *Sói Cuồng Nộ:* Lấy điểm phẫn nộ từ cái chết của đồng đội để tước năng lực vĩnh viễn (gọi dậy mỗi đêm để đánh lừa Làng).
  - *Sói Đầu Đàn:* Nếu là con sói cuối cùng, được cắn thêm 1 mạng (gọi dậy mỗi đêm để đánh lừa Làng).
- **Phe Thứ 3 / Đột Biến (3 Roles):** 
  - *Thằng Ngốc:* Kẻ chán đời. Bị Làng treo cổ là lập tức Game Over và thắng duy nhất.
  - *Kẻ Bị Nguyền:* Hóa Sói khi bị cắn.
  - *Thần Tình Yêu:* Ghép đôi sinh mệnh, chết chùm đệ quy.

**🚀 CẦN BÀN & HOÀN THIỆN TIẾP (TODO HÔM SAU):**
1. **Kiểm thử (Debug) hệ thống Ma Sói:** 
   - Test các trường hợp chết chùm (Thợ Săn, Cupid).
   - Test Tòa Án (Treo cổ Thằng Ngốc, hòa phiếu).
2. **Gartic Phone (Tam sao thất bản):**
   - Hoàn thiện logic thuật toán luân chuyển lượt (người A truyền qua người B).
   - Hoàn thiện giao diện Triển lãm (hiển thị hình ảnh/câu chữ trong `books`).
