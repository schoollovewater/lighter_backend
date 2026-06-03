const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 

// Phục vụ giao diện Frontend tĩnh từ thư mục "public"
app.use(express.static(path.join(__dirname, 'public')));

// CHỈNH SỬA SỬA LỖI EXPRESS 5: Chuyển hẳn sang định dạng RegExp thuần /.*/ 
// Loại bỏ hoàn toàn chuỗi nháy đơn và cặp dấu ngoặc đơn để không bị bẻ lỗi "Unexpected ("
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);

// Khởi tạo máy chủ Socket.io hỗ trợ kết nối thời gian thực
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// ==========================================
// 🧠 BỘ NHỚ TRẠNG THÁI TRÊN SERVER (IN-MEMORY STATE)
// ==========================================
let serverMessages = [
    { id: 'm1', topicId: 't1', sender: 'admin', text: 'Chào mừng đến với Lighter Hardcore Arena! Máy chủ Socket.io đã sẵn sàng vận hành.', createdAt: Date.now() }
];

let serverTopics = [
    { id: 't1', title: 'Thảo luận chiến thuật Đấu trường Ma Sói Hardcore Lighter 🐺', creator: 'admin', status: 'active', createdAt: Date.now() }
];

let serverMembers = null; 

let serverGameState = {
    status: 'WAITING', 
    phase: 'PRE_GAME', 
    day: 1,
    players: [], 
    selectedRoles: { 
        VILLAGER: 1, 
        WEREWOLF: 1, 
        TRAITOR: 1, 
        CURSED_ONE: 1, 
        BEAR_TAMER: 1, 
        WITCH: 1, 
        BODYGUARD: 1, 
        HUNTER: 1 
    },
    currentNightStepIndex: 0,
    nightActiveSteps: [], 
    nightVotes: {}, 
    actions: { 
        wolvesTarget1: null, 
        wolvesTarget2: null, 
        witchHealUsed: false, 
        witchPoisonTarget: null, 
        protectedId: null, 
        lockedId: null, 
        shamanRuinedId: null, 
        cupidTargets: [], 
        doppelgangerTarget: null, 
        hunterTarget: null 
    },
    logs: ["Hệ thống máy chủ Lighter đã sẵn sàng nhận lệnh."],
    deadTonight: [],
    dayVotes: {}, 
    hangingTargetId: null, 
    trialVotes: {},
    alphaWolfDoubleBiteActive: false
};

// ==========================================
// 🚀 QUẢN LÝ KẾT NỐI REAL-TIME
// ==========================================
io.on('connection', (socket) => {
    console.log(`🟢 [SOCKET] Thiết bị kết nối thành công: ${socket.id}`);

    // Gửi trạng thái ban đầu khi client vừa kết nối vào phòng
    socket.emit('initial_state', {
        messages: serverMessages,
        topics: serverTopics,
        gameState: serverGameState,
        members: serverMembers
    });

    // Đồng bộ danh sách người chơi
    socket.on('sync_members', (membersData) => {
        serverMembers = membersData;
        socket.broadcast.emit('update_members', membersData);
    });

    // Xử lý gửi tin nhắn văn phòng
    socket.on('send_chat_message', (msgData) => {
        serverMessages.push(msgData);
        io.emit('receive_chat_message', msgData); 
    });

    // Đề xuất chủ đề mới
    socket.on('propose_topic', (topicData) => {
        serverTopics.push(topicData);
        io.emit('receive_new_topic', topicData);
    });

    // Phê duyệt chủ đề chính (Admin duyệt)
    socket.on('approve_topic', (topicId) => {
        serverTopics.forEach(t => {
            if (t.status === 'active') t.status = 'archived';
            if (t.id === topicId) t.status = 'active';
        });
        io.emit('topic_approved', serverTopics); 
    });

    // Xóa chủ đề
    socket.on('delete_topic', (topicId) => {
        serverTopics = serverTopics.filter(t => t.id !== topicId);
        io.emit('topic_deleted', serverTopics);
    });

    // Đồng bộ trạng thái phòng game Ma Sói thời gian thực
    socket.on('sync_game_state', (newState) => {
        serverGameState = newState;
        socket.broadcast.emit('update_game_state', serverGameState);
    });

    socket.on('disconnect', () => {
        console.log(`🔴 [SOCKET] Thiết bị đã rời mạng: ${socket.id}`);
    });
});

// Chạy máy chủ tại cổng quy định
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Máy chủ Backend đang vận hành mượt mà tại cổng: ${PORT}`);
});