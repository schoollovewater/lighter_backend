const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 

// Cấp quyền cho express truy cập thư mục public
app.use(express.static('public'));

const server = http.createServer(app);

// Cấu hình Socket.io nhận mọi kết nối
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// ==========================================
// 🚀 TRUNG TÂM XỬ LÝ DỮ LIỆU REAL-TIME
io.on('connection', (socket) => {
    console.log(`🟢 Có người chơi vừa kết nối! ID Máy: ${socket.id}`);

    // 1. Lắng nghe tín hiệu: Có người gửi tin nhắn Chat
    socket.on('send_chat_message', (msgData) => {
        // Phát loa phóng thanh truyền tin nhắn này tới TẤT CẢ các thiết bị đang online
        io.emit('receive_chat_message', msgData);
    });

    // 2. Lắng nghe tín hiệu: Có người đề xuất Chủ đề mới
    socket.on('propose_topic', (topicData) => {
        io.emit('receive_new_topic', topicData);
    });

    // 3. Lắng nghe tín hiệu: Admin vừa duyệt một chủ đề
    socket.on('approve_topic', (topicId) => {
        io.emit('topic_approved', topicId);
    });

    // Khi có người ngắt kết nối
    socket.on('disconnect', () => {
        console.log(`🔴 Người chơi ${socket.id} đã rời mạng.`);
    });
});
// ==========================================

// Ép Express trả về file index.html khi truy cập trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cấu hình cổng chạy Server
const PORT = process.env.PORT || 5000; 
server.listen(PORT, () => {
    console.log(`Backend Ma Sói đang chạy online tại cổng: ${PORT}`);
});