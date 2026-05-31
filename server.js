const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Cấp quyền cho file HTML kết nối vào server

// ==========================================
// 🚀 BƯỚC 3: THÊM DÒNG NÀY VÀO ĐÂY NÈ BẠN
app.use(express.static('public'));
// ==========================================

const server = http.createServer(app);

// Cấu hình Socket.io nhận mọi kết nối từ các nguồn (bao gồm cả local và online)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Quản lý kết nối thời gian thực (Real-time)
io.on('connection', (socket) => {
    console.log(`Có người chơi vừa kết nối! ID Máy: ${socket.id}`);

    // Khi có người ngắt kết nối (tắt tab game)
    socket.on('disconnect', () => {
        console.log(`Người chơi ${socket.id} đã rời phòng.`);
    });
});

// Cấu hình cổng chạy Server (Tương thích hoàn toàn với nền tảng Vercel/Render)
const PORT = process.env.PORT || 5000; 
server.listen(PORT, () => {
    console.log(`Backend Ma Sói đang chạy online tại cổng: ${PORT}`);
});