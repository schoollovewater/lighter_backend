const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 
app.use(express.static(path.join(__dirname, 'public')));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- BỘ NHỚ TRẠNG THÁI REAL-TIME ---
let globalUsers = {}; // Lưu vết tất cả người dùng online: { socketId: { id, name, avatar, isHost } }
let serverMessages = [];
let serverGameState = {
    status: 'WAITING', phase: 'PRE_GAME', day: 1, players: [], 
    selectedRoles: { VILLAGER: 1, WEREWOLF: 1, TRAITOR: 1, CURSED_ONE: 1, BEAR_TAMER: 1, WITCH: 1, BODYGUARD: 1, HUNTER: 1 },
    currentNightStepIndex: 0, nightActiveSteps: [], logs: [], deadTonight: [], dayVotes: {}
};

// Trạng thái của trò chơi Gartic Phone
let garticState = {
    status: 'WAITING', // WAITING, PLAYING, REVIEW
    mode: 'NORMAL',    // NORMAL, KNOCKOUT, ANIMATION, SECRET
    currentRound: 1,
    totalRounds: 0,
    books: {}          // Nhật ký vẽ/đoán của từng chuỗi người chơi
};

io.on('connection', (socket) => {
    console.log(`🟢 Thiết bị kết nối: ${socket.id}`);

    // Khi người chơi đặt tên và tham gia vào hệ thống (Không dùng mật khẩu)
    socket.on('join_hub', (userData) => {
        // Nếu là người đầu tiên vào phòng, tự động phong làm Chủ phòng (Host)
        const isFirst = Object.keys(globalUsers).length === 0;
        
        globalUsers[socket.id] = {
            id: socket.id,
            name: userData.name,
            avatar: userData.avatar || '🥷',
            isHost: isFirst
        };

        console.log(`👤 User nhập cuộc: ${userData.name} | Quyền Host: ${isFirst}`);
        
        // Phát dữ liệu tổng quan về máy vừa đăng nhập
        socket.emit('initial_state', {
            myId: socket.id,
            messages: serverMessages,
            gameState: serverGameState,
            garticState: garticState,
            users: Object.values(globalUsers)
        });

        // Phát loa thông báo cho cả làng cập nhật danh sách
        io.emit('update_users_list', Object.values(globalUsers));
    });

    // Đồng bộ tin nhắn văn phòng
    socket.on('send_chat_message', (msgText) => {
        const user = globalUsers[socket.id];
        if (!user) return;
        const msgData = { id: 'm_' + Date.now(), senderName: user.name, senderAvatar: user.avatar, text: msgText };
        serverMessages.push(msgData);
        io.emit('receive_chat_message', msgData);
    });

    // --- ĐỒNG BỘ MA SÓI ---
    socket.on('sync_game_state', (newState) => {
        serverGameState = newState;
        socket.broadcast.emit('update_game_state', serverGameState);
    });

    // --- ĐỒNG BỘ GARTIC PHONE ---
    socket.on('sync_gartic_state', (newState) => {
        garticState = newState;
        socket.broadcast.emit('update_gartic_state', garticState);
    });

    socket.on('submit_gartic_turn', (data) => {
        // Tích hợp lưu dữ liệu vẽ (Base64) hoặc câu đoán của từng vòng vào tập sách của user
        if (garticState.books[data.bookOwnerId]) {
            garticState.books[data.bookOwnerId].push({
                author: globalUsers[socket.id]?.name || 'Ẩn danh',
                type: data.type, // 'TEXT' hoặc 'IMAGE'
                value: data.value
            });
        }
        io.emit('update_gartic_state', garticState);
    });

    // Xử lý khi có người out app, đóng tab trình duyệt
    socket.on('disconnect', () => {
        const userLeaving = globalUsers[socket.id];
        if (userLeaving) {
            console.log(`🔴 User thoát: ${userLeaving.name}`);
            const wasHost = userLeaving.isHost;
            delete globalUsers[socket.id];

            const remainingUsers = Object.values(globalUsers);
            // Nếu thằng rời đi là Chủ phòng, tự động chuyển quyền Chủ phòng cho người tiếp theo
            if (wasHost && remainingUsers.length > 0) {
                remainingUsers[0].isHost = true;
                console.log(`👑 Quyền Chủ phòng tự động chuyển giao cho: ${remainingUsers[0].name}`);
            }

            // Tự động đá ra khỏi phòng chờ Ma Sói nếu đang treo máy
            serverGameState.players = serverGameState.players.filter(p => p.id !== socket.id);

            io.emit('update_users_list', remainingUsers);
            io.emit('update_game_state', serverGameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Lighter Game Hub vận hành tại cổng: ${PORT}`));