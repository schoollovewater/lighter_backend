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
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let serverMessages = [
    { id: 'm1', topicId: 't1', sender: 'admin', text: 'Chào mừng đến với Lighter Hardcore Arena! Máy chủ sảnh chờ thông minh đã sẵn sàng.', createdAt: Date.now() }
];

let serverTopics = [
    { id: 't1', title: 'Thảo luận chiến thuật Đấu trường Ma Sói Hardcore Lighter 🐺', creator: 'admin', status: 'active', createdAt: Date.now() }
];

let serverMembers = null; 

let serverGameState = {
    status: 'WAITING', phase: 'PRE_GAME', day: 1, players: [], 
    selectedRoles: { VILLAGER: 1, WEREWOLF: 1, TRAITOR: 1, CURSED_ONE: 1, BEAR_TAMER: 1, WITCH: 1, BODYGUARD: 1, HUNTER: 1 },
    currentNightStepIndex: 0, nightActiveSteps: [], nightVotes: {}, 
    actions: { wolvesTarget1: null, wolvesTarget2: null, witchHealUsed: false, witchPoisonTarget: null, protectedId: null, lockedId: null, shamanRuinedId: null, cupidTargets: [], doppelgangerTarget: null, hunterTarget: null },
    logs: ["Hệ thống sảnh chờ Lighter đã sẵn sàng nhận lệnh."], deadTonight: [], dayVotes: {}, hangingTargetId: null, trialVotes: {}, alphaWolfDoubleBiteActive: false
};

// Lưu vết xem Socket ID nào đang đại diện cho User ID nào để xử lý khi ngắt kết nối
const socketUserMap = {};

io.on('connection', (socket) => {
    console.log(`🟢 [SOCKET] Thiết bị kết nối: ${socket.id}`);

    socket.emit('initial_state', {
        messages: serverMessages,
        topics: serverTopics,
        gameState: serverGameState,
        members: serverMembers
    });

    // Khi User đăng nhập thành công ở client, ghi nhận map ID
    socket.on('register_user_session', (userId) => {
        socketUserMap[socket.id] = userId;
        console.log(`🔗 Gắn kết Socket [${socket.id}] với User [${userId}]`);
    });

    socket.on('sync_members', (membersData) => {
        serverMembers = membersData;
        socket.broadcast.emit('update_members', serverMembers);
    });

    socket.on('send_chat_message', (msgData) => {
        serverMessages.push(msgData);
        io.emit('receive_chat_message', msgData); 
    });

    socket.on('propose_topic', (topicData) => {
        serverTopics.push(topicData);
        io.emit('receive_new_topic', topicData);
    });

    socket.on('approve_topic', (topicId) => {
        serverTopics.forEach(t => {
            if (t.status === 'active') t.status = 'archived';
            if (t.id === topicId) t.status = 'active';
        });
        io.emit('topic_approved', serverTopics); 
    });

    socket.on('delete_topic', (topicId) => {
        serverTopics = serverTopics.filter(t => t.id !== topicId);
        io.emit('topic_deleted', serverTopics);
    });

    socket.on('sync_game_state', (newState) => {
        serverGameState = newState;
        socket.broadcast.emit('update_game_state', serverGameState);
    });

    // 🚀 LOGIC CỐT LÕI: Tự động out phòng chờ khi tắt app/ngắt kết nối
    socket.on('disconnect', () => {
        const disconnectedUserId = socketUserMap[socket.id];
        console.log(`🔴 [SOCKET] Thiết bị rời mạng: ${socket.id} (User: ${disconnectedUserId})`);
        
        if (disconnectedUserId && serverGameState.status === 'WAITING') {
            const lengthBefore = serverGameState.players.length;
            // Lọc bỏ user đã ngắt kết nối khỏi danh sách phòng chờ Lobby
            serverGameState.players = serverGameState.players.filter(p => p.id !== disconnectedUserId);
            
            if (serverGameState.players.length !== lengthBefore) {
                console.log(`🚨 [LOBBY] Tự động đá User [${disconnectedUserId}] ra khỏi phòng chờ do ngắt kết nối.`);
                serverGameState.logs.push(`Hệ thống: Người chơi đã ngắt kết nối và rời phòng chờ.`);
                io.emit('update_game_state', serverGameState);
            }
        }
        delete socketUserMap[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Máy chủ Backend đang vận hành mượt mà tại cổng: ${PORT}`);
});