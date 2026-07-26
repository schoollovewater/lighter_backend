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
const disconnectTimeouts = {};
let serverGameState = {
    status: 'WAITING', phase: 'PRE_GAME', day: 1, players: [], 
    selectedRoles: { 
        VILLAGER: 1, BODYGUARD: 0, WITCH: 1, BEAR_TAMER: 0, SEER: 1, DETECTIVE: 0, MOON_LADY: 0, HUNTER: 0, CLONE: 0,
        WEREWOLF: 1, HIDDEN_WOLF: 0, ENRAGED_WOLF: 0, SHAMAN_WOLF: 0, ALPHA_WOLF: 0,
        CUPID: 0, FOOL: 0, CURSED_ONE: 0
    },
    cupidMode: 1, // 1: Thẻ bài, 2: Nhập hồn ngẫu nhiên
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

function getMaskedStateForUser(uId) {
    let maskedState = JSON.parse(JSON.stringify(serverGameState));
    const me = maskedState.players.find(p => p.id === uId);
    const myEffFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
    const amIWolf = myEffFaction === 'Ma_Sói';

    maskedState.players.forEach(p => {
        let effFaction = p.cloneInheritedFaction || p.originFaction;
        let isWolf = effFaction === 'Ma_Sói';
        let pEffRole = p.transformedRole || p.cloneInheritedRole || p.role;
        if (pEffRole === 'HIDDEN_WOLF') isWolf = false;
        if (maskedState.nightActions && maskedState.nightActions['SHAMAN_WOLF'] === p.id) isWolf = true;
        p.isWolfForSeer = isWolf;

        if (p.id !== uId) {
            let showRole = false;
            if (amIWolf && effFaction === 'Ma_Sói' && pEffRole !== 'HIDDEN_WOLF') {
                showRole = true;
            }
            if (maskedState.status === 'WAITING') {
                showRole = true;
            }
            if (!showRole) {
                p.role = 'UNKNOWN';
                p.originFaction = 'UNKNOWN';
                p.cloneInheritedRole = null;
                p.cloneInheritedFaction = null;
                p.transformedRole = null;
                p.isCupid = false;
            }
            delete p.abilityRemoved;
        }
    });

    if (!amIWolf) {
        delete maskedState.wolfChatHistory;
        delete maskedState.wolfTempVotes;
        delete maskedState.wolfVotes;
    }

    if (me && (me.role === 'BEAR_TAMER' || me.cloneInheritedRole === 'BEAR_TAMER')) {
        const alivePlayers = serverGameState.players.filter(p => p.status === 'Alive');
        const myIndex = alivePlayers.findIndex(p => p.id === uId);
        let hasWolfNeighbor = false;
        if (myIndex !== -1 && alivePlayers.length > 1) {
            const leftPlayer = alivePlayers[(myIndex - 1 + alivePlayers.length) % alivePlayers.length];
            const rightPlayer = alivePlayers[(myIndex + 1) % alivePlayers.length];
            
            [leftPlayer, rightPlayer].forEach(neighbor => {
                let nEffRole = neighbor.transformedRole || neighbor.cloneInheritedRole || neighbor.role;
                let nFaction = neighbor.originFaction;
                if (nEffRole === 'CURSED_ONE' && serverGameState.cursedOneBitten) nFaction = 'Ma_Sói';
                
                if (serverGameState.nightActions && serverGameState.nightActions['SHAMAN_WOLF'] === neighbor.id) {
                    hasWolfNeighbor = true;
                } else if (nEffRole === 'HIDDEN_WOLF') {
                    // Hidden wolf hides
                } else if (nFaction === 'Ma_Sói') {
                    hasWolfNeighbor = true;
                }
            });
        }
        maskedState.bearResult = hasWolfNeighbor;
    }

    // TỐI MẬT: XÓA CÁC THÔNG TIN NHẠY CẢM ĐỂ CHỐNG META-GAMING (SOI DEVTOOLS)
    const meEffRole = me ? (me.cloneInheritedRole || me.role) : null;
    
    if (maskedState.nightActions) {
        const safeActions = {};
        if (meEffRole === 'WITCH') {
            safeActions['WEREWOLF_TEAM'] = maskedState.nightActions['WEREWOLF_TEAM'];
        }
        if (amIWolf) {
            safeActions['WEREWOLF_TEAM'] = maskedState.nightActions['WEREWOLF_TEAM'];
        }
        // Giữ lại action của chính mình (để UI có thể render lại nếu reload)
        if (meEffRole && maskedState.nightActions[meEffRole]) {
            safeActions[meEffRole] = maskedState.nightActions[meEffRole];
        }
        maskedState.nightActions = safeActions;
    }

    if (meEffRole !== 'HUNTER') maskedState.hunterTargets = {};
    if (meEffRole !== 'CLONE') maskedState.cloneTarget = null;
    if (meEffRole !== 'WITCH') maskedState.witchState = { usedSave: maskedState.witchState?.usedSave, usedPoison: maskedState.witchState?.usedPoison }; // Ẩn thông tin, chỉ để lại trạng thái đã dùng hay chưa
    
    const amICupidOrLinked = me && (me.role === 'CUPID' || me.isCupid || (maskedState.cupidLinks || []).includes(me.id));
    if (!amICupidOrLinked && maskedState.phase !== 'DAY_TRIAL') {
        // Nếu game kết thúc hoặc ở màn hình chờ thì có thể show, nếu đang chơi thì ẩn
        if (maskedState.status === 'PLAYING') maskedState.cupidLinks = [];
    }

    return maskedState;
}

function broadcastGameState() {
    const users = Object.values(globalUsers);
    users.forEach(u => {
        io.to(u.id).emit('update_game_state', getMaskedStateForUser(u.id));
    });
}

io.on('connection', (socket) => {
    console.log(`🟢 Thiết bị kết nối: ${socket.id}`);

    // Khi người chơi đặt tên và tham gia vào hệ thống (Không dùng mật khẩu)
    socket.on('join_hub', (userData) => {
        const isFirst = Object.keys(globalUsers).length === 0;
        const sessionId = userData.sessionId || socket.id;

        if (disconnectTimeouts[sessionId]) {
            clearTimeout(disconnectTimeouts[sessionId]);
            delete disconnectTimeouts[sessionId];
        }

        let oldSocketId = null;
        for (const [sid, user] of Object.entries(globalUsers)) {
            if (user.id === sessionId) {
                oldSocketId = sid;
                break;
            }
        }

        if (oldSocketId && oldSocketId !== socket.id) {
            globalUsers[socket.id] = globalUsers[oldSocketId];
            delete globalUsers[oldSocketId];
            console.log(`♻️ User Reconnected: ${userData.name}`);
        } else {
            globalUsers[socket.id] = {
                id: sessionId,
                name: userData.name,
                avatar: userData.avatar || '🐰',
                isHost: isFirst
            };
            console.log(`👋 User nhập cuộc: ${userData.name}`);
        }
        
        socket.emit('initial_state', {
            myId: sessionId,
            messages: serverMessages,
            gameState: getMaskedStateForUser(sessionId),
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

    // Khởi tạo Game Ma Sói
    socket.on('start_werewolf_match', (settings) => {
        serverGameState = {
            id: 'ww_' + Date.now(),
            status: 'WAITING',
            players: [],
            selectedRoles: settings.selectedRoles || serverGameState.selectedRoles,
            cupidMode: settings.cupidMode || serverGameState.cupidMode || 1,
            phase: 'PRE_GAME',
            day: 1,
            nightActiveSteps: [],
            currentNightStepIndex: 0,
            dayVotes: {},
            trialVotes: {},
            trialTarget: null,
            nightActions: {},
            witchState: { usedSave: false, usedPoison: false },
            cupidLinks: [],
            hunterTargets: {},
            cloneTarget: null,
            cursedOneBitten: false,
            moonLadyLastTarget: null,
            wolfChatHistory: [],
            wolfTempVotes: {},
            enragedWolfStacks: 0
        };
        broadcastGameState();
    });

    // --- ĐỒNG BỘ MA SÓI ---
    socket.on('sync_game_state', (newState) => {
        serverGameState = newState;
        broadcastGameState();
    });

    socket.on('start_night', () => {
        if (serverGameState.status !== 'PLAYING') return;
        
        const alivePlayers = serverGameState.players.filter(p => p.status === 'Alive');
        const effRoles = alivePlayers.map(p => p.cloneInheritedRole || p.role);
        const hasCupidMode2Alive = alivePlayers.some(p => p.isCupid);
        
        let steps = [];
        if (serverGameState.day === 1 && (effRoles.includes('CUPID') || hasCupidMode2Alive)) steps.push('CUPID');
        if (alivePlayers.some(p => p.role === 'CLONE')) steps.push('CLONE');
        if (effRoles.includes('MOON_LADY')) steps.push('MOON_LADY');
        if (effRoles.includes('CURSED_ONE')) steps.push('CURSED_ONE');
        if (effRoles.some(r => ['WEREWOLF', 'HIDDEN_WOLF', 'ENRAGED_WOLF', 'SHAMAN_WOLF', 'ALPHA_WOLF'].includes(r))) steps.push('WEREWOLF_TEAM');
        if (effRoles.includes('ALPHA_WOLF')) steps.push('ALPHA_WOLF');
        if (effRoles.includes('ENRAGED_WOLF')) steps.push('ENRAGED_WOLF');
        if (effRoles.includes('SHAMAN_WOLF')) steps.push('SHAMAN_WOLF');
        if (effRoles.includes('BODYGUARD')) steps.push('BODYGUARD');
        if (effRoles.includes('WITCH')) steps.push('WITCH');
        if (effRoles.includes('BEAR_TAMER')) steps.push('BEAR_TAMER');
        if (effRoles.includes('SEER')) steps.push('SEER');
        if (effRoles.includes('DETECTIVE')) steps.push('DETECTIVE');
        if (serverGameState.day === 1 && effRoles.includes('FOOL')) steps.push('FOOL');
        if (effRoles.includes('HUNTER')) steps.push('HUNTER');
        if (effRoles.includes('ENRAGED_WOLF') && serverGameState.enragedWolfStacks > 0) steps.push('ENRAGED_WOLF');
        
        serverGameState.nightActiveSteps = steps;
        serverGameState.currentNightStepIndex = -1;
        serverGameState.phase = 'NIGHT';
        
        advanceNightStep(); // Bắt đầu đếm thời gian và tìm role đầu tiên
        broadcastGameState();
    });

    socket.on('start_day_voting', () => {
        if (serverGameState.status !== 'PLAYING') return;
        serverGameState.phase = 'DAY_VOTING';
        serverGameState.dayVotes = {};
        broadcastGameState();
    });

    socket.on('end_werewolf_game', () => {
        if (!serverGameState) return;
        serverGameState.status = 'WAITING';
        broadcastGameState();
    });

    socket.on('submit_werewolf_vote', ({ voterId, targetId }) => {
        if (!serverGameState.dayVotes) serverGameState.dayVotes = {};
        serverGameState.dayVotes[voterId] = targetId;
        checkAutoProgress();
        broadcastGameState();
    });

    socket.on('submit_werewolf_trial', ({ voterId, vote }) => {
        if (!serverGameState.trialVotes) serverGameState.trialVotes = {};
        serverGameState.trialVotes[voterId] = vote;
        checkAutoProgress();
        broadcastGameState();
    });

    // --- SÓI REAL-TIME VOTE & CHAT ---
    socket.on('send_wolf_chat', (text) => {
        const user = globalUsers[socket.id];
        if (!user || serverGameState.status !== 'PLAYING') return;
        
        const me = serverGameState.players.find(p => p.id === (globalUsers[socket.id]?.id));
        const effFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
        if (effFaction !== 'Ma_Sói') return;

        const msgData = { id: 'wc_' + Date.now(), senderName: user.name, senderAvatar: user.avatar, text: text };
        
        if (!serverGameState.wolfChatHistory) serverGameState.wolfChatHistory = [];
        serverGameState.wolfChatHistory.push(msgData);
        
        serverGameState.players.forEach(p => {
            let pFaction = p.cloneInheritedFaction || p.originFaction;
            if (pFaction === 'Ma_Sói') {
                io.to(p.id).emit('receive_wolf_chat', msgData);
            }
        });
    });

    socket.on('send_wolf_temp_vote', (targetId) => {
        const user = globalUsers[socket.id];
        if (!user || serverGameState.status !== 'PLAYING') return;
        
        const me = serverGameState.players.find(p => p.id === (globalUsers[socket.id]?.id));
        const effFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
        if (effFaction !== 'Ma_Sói') return;

        if (!serverGameState.wolfTempVotes) serverGameState.wolfTempVotes = {};
        const voterId = globalUsers[socket.id]?.id;
        if(voterId) serverGameState.wolfTempVotes[voterId] = targetId;
        
        serverGameState.players.forEach(p => {
            let pFaction = p.cloneInheritedFaction || p.originFaction;
            if (pFaction === 'Ma_Sói') {
                io.to(p.id).emit('update_wolf_temp_votes', serverGameState.wolfTempVotes);
            }
        });
    });

    socket.on('host_kill_player', (playerId) => {
        const p = serverGameState.players.find(x => x.id === playerId);
        if (p) {
            if (p.status === 'Alive') {
                processCascadingDeaths([playerId]);
            } else {
                p.status = 'Alive';
            }
            broadcastGameState();
        }
    });

    socket.on('force_skip_night_step', () => {
        if (serverGameState.phase === 'NIGHT') {
            advanceNightStep();
            broadcastGameState();
        }
    });

    socket.on('toggle_night_pause', () => {
        if (serverGameState.phase === 'NIGHT') {
            serverGameState.isNightPaused = !serverGameState.isNightPaused;
            broadcastGameState();
        }
    });

    socket.on('submit_night_action', ({ role, actionData, playerId }) => {
        if (!serverGameState.nightActions) serverGameState.nightActions = {};
        
        if (role === 'WITCH') {
            if (actionData.save && !serverGameState.witchState.usedSave) {
                serverGameState.witchState.usedSave = true;
                serverGameState.nightActions.witchSave = actionData.save;
            }
            if (actionData.poison && !serverGameState.witchState.usedPoison) {
                serverGameState.witchState.usedPoison = true;
                serverGameState.nightActions.witchPoisonTarget = actionData.poison;
            }
        } else if (role === 'CUPID') {
            serverGameState.cupidLinks = actionData.links;
            
            // Tìm tất cả các thành viên phe Cupid để gửi sự kiện lật bài
            let members = serverGameState.players.filter(p => actionData.links && actionData.links.includes(p.id));
            if (serverGameState.cupidMode === 1) {
                const cupidPlayer = serverGameState.players.find(p => p.role === 'CUPID');
                if (cupidPlayer && !members.find(m => m.id === cupidPlayer.id)) members.push(cupidPlayer);
            } else {
                const cupidPlayer = serverGameState.players.find(p => p.isCupid);
                if (cupidPlayer && !members.find(m => m.id === cupidPlayer.id)) members.push(cupidPlayer);
            }
            
            // Gửi dữ liệu lật bài cho các socket tương ứng
            members.forEach(m => {
                io.to(m.id).emit('show_cupid_identities', members);
            });
        } else if (role === 'HUNTER') {
            serverGameState.hunterTargets[playerId] = actionData.target;
        } else if (role === 'CLONE') {
            if (actionData.target) {
                serverGameState.cloneTarget = actionData.target;
            }
        } else if (role === 'MOON_LADY') {
            serverGameState.nightActions[role] = actionData.target;
            if (actionData.target) {
                const targetPlayer = serverGameState.players.find(p => p.id === actionData.target);
                if (targetPlayer) targetPlayer.isLocked = true;
                serverGameState.moonLadyLastTarget = actionData.target;
            }
        } else if (role === 'WEREWOLF_TEAM') {
            if (!serverGameState.wolfVotes) serverGameState.wolfVotes = {};
            serverGameState.wolfVotes[playerId] = actionData.target;
            serverGameState.nightActions[role] = actionData.target; // Fallback
        } else {
            serverGameState.nightActions[role] = actionData.target;
            if (role === 'BODYGUARD') {
                serverGameState.bodyguardLastTarget = actionData.target;
            }
        }
        
        if (!serverGameState.nightSubmissions) serverGameState.nightSubmissions = [];
        if (!serverGameState.nightSubmissions.includes(playerId)) {
            serverGameState.nightSubmissions.push(playerId);
        }
        
        checkAutoProgress();
        broadcastGameState();
    });

    function getActivePlayersForStep(step) {
        return serverGameState.players.filter(p => {
            if (p.status !== 'Alive' || p.isLocked) return false;
            let baseRole = p.cloneInheritedRole || p.role;
            let effRole = p.transformedRole || baseRole;
            if (step === 'CLONE' && p.role === 'CLONE') return true;
            if (step === 'CURSED_ONE' && baseRole === 'CURSED_ONE') return true;
            if (step === 'WEREWOLF_TEAM') return ['WEREWOLF', 'HIDDEN_WOLF', 'ENRAGED_WOLF', 'SHAMAN_WOLF', 'ALPHA_WOLF'].includes(effRole);
            if (step === 'CUPID') return effRole === 'CUPID' || p.isCupid;
            if (step === 'ALPHA_WOLF' && effRole === 'ALPHA_WOLF') {
                const livingWolvesCount = serverGameState.players.filter(x => x.status === 'Alive' && (x.cloneInheritedFaction || x.originFaction) === 'Ma_Sói').length;
                return livingWolvesCount === 1;
            }
            return effRole === step;
        });
    }

    function checkGameOver() {
        if (serverGameState.status !== 'PLAYING') return false;
        const alive = serverGameState.players.filter(p => p.status === 'Alive');
        
        let wolves = 0;
        alive.forEach(p => {
            const effFaction = p.cloneInheritedFaction || p.originFaction;
            if (effFaction === 'Ma_Sói') wolves++;
        });

        const cupidTeamCount = alive.filter(p => p.role === 'CUPID' || p.isCupid || (serverGameState.cupidLinks && serverGameState.cupidLinks.includes(p.id))).length;
        if (cupidTeamCount > 0 && cupidTeamCount >= alive.length / 2) {
            serverGameState.winner = 'CUPID';
            serverGameState.status = 'WAITING';
            io.emit('game_over_cupid_win');
            return true;
        }

        if (wolves >= alive.length - wolves) {
            serverGameState.winner = 'WOLVES';
            serverGameState.status = 'WAITING';
            io.emit('game_over_wolves_win');
            return true;
        }

        if (wolves === 0) {
            serverGameState.winner = 'VILLAGERS';
            serverGameState.status = 'WAITING';
            io.emit('game_over_villagers_win');
            return true;
        }
        
        return false;
    }

    function checkAutoProgress() {
        if (serverGameState.status !== 'PLAYING') return false;
        let changed = false;
        
        const alivePlayers = serverGameState.players.filter(p => p.status === 'Alive');
        
        if (serverGameState.phase === 'DAY_VOTING') {
            const votes = serverGameState.dayVotes || {};
            if (Object.keys(votes).length >= alivePlayers.length && alivePlayers.length > 0) {
                const counts = {};
                Object.values(votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
                
                let maxVotes = 0;
                let targetId = null;
                let isTie = false;
                
                Object.entries(counts).forEach(([id, c]) => {
                    if (c > maxVotes) {
                        maxVotes = c;
                        targetId = id;
                        isTie = false;
                    } else if (c === maxVotes) {
                        isTie = true;
                    }
                });
                
                if (isTie || !targetId) {
                    serverGameState.phase = 'DAY';
                } else {
                    serverGameState.phase = 'DAY_TRIAL';
                    serverGameState.trialTarget = targetId;
                    serverGameState.trialVotes = {};
                }
                changed = true;
            }
        } else if (serverGameState.phase === 'DAY_TRIAL') {
            const votes = serverGameState.trialVotes || {};
            if (Object.keys(votes).length >= alivePlayers.length - 1 && alivePlayers.length > 0) {
                let tha = 0, treo = 0;
                Object.values(votes).forEach(v => v === 'THA' ? tha++ : treo++);
                
                if (treo > tha) {
                    processCascadingDeaths([serverGameState.trialTarget]);
                }
                serverGameState.phase = 'DAY';
                serverGameState.trialTarget = null;
                changed = true;
            }
        } else if (serverGameState.phase === 'NIGHT') {
            const currentStep = serverGameState.nightActiveSteps[serverGameState.currentNightStepIndex];
            if (!currentStep) return false;
            
            const activePlayers = getActivePlayersForStep(currentStep);
            const submissions = serverGameState.nightSubmissions || [];
            
            if (activePlayers.length === 0 || submissions.length >= activePlayers.length) {
                if (currentStep === 'WEREWOLF_TEAM' && activePlayers.length > 0 && submissions.length >= activePlayers.length) {
                    const votes = serverGameState.wolfVotes || {};
                    const counts = {};
                    Object.values(votes).forEach(t => { if (t) counts[t] = (counts[t] || 0) + 1; });
                    
                    let maxVotes = 0;
                    let targetId = null;
                    let isTie = false;
                    Object.entries(counts).forEach(([id, c]) => {
                        if (c > maxVotes) {
                            maxVotes = c;
                            targetId = id;
                            isTie = false;
                        } else if (c === maxVotes) {
                            isTie = true;
                        }
                    });
                    
                    // Nếu số lượng sói > 1 và bị hòa phiếu -> Bắt vote lại
                    if (isTie && activePlayers.length > 1) {
                        activePlayers.forEach(p => io.to(p.id).emit('wolf_vote_tie'));
                        serverGameState.nightSubmissions = [];
                        serverGameState.wolfVotes = {};
                        return false; 
                    } else if (targetId) {
                        serverGameState.nightActions['WEREWOLF_TEAM'] = targetId;
                    }
                }

                if (currentStep === 'ENRAGED_WOLF') {
                    const action = serverGameState.nightActions['ENRAGED_WOLF'];
                    if (action) {
                        const target = serverGameState.players.find(p => p.id === action);
                        if (target) target.abilityRemoved = true;
                        serverGameState.enragedWolfStacks = Math.max(0, (serverGameState.enragedWolfStacks || 1) - 1);
                    }
                }
                
                advanceNightStep();
                changed = true;
            }
        }
        return changed;
    }

    function processCascadingDeaths(initialDeadArray) {
        let deadList = [...initialDeadArray];
        let queue = [...initialDeadArray];
        let processed = [];
        
        while(queue.length > 0) {
            const dyingId = queue.shift();
            if (processed.includes(dyingId)) continue;
            processed.push(dyingId);
            
            const dyingPlayer = serverGameState.players.find(p => p.id === dyingId);
            if (!dyingPlayer) continue;
            
            // Hunter fires if dies
            if ((dyingPlayer.cloneInheritedRole || dyingPlayer.role) === 'HUNTER') {
                const huntTarget = serverGameState.hunterTargets[dyingId];
                if (huntTarget && !processed.includes(huntTarget) && !queue.includes(huntTarget)) {
                    queue.push(huntTarget);
                    if (!deadList.includes(huntTarget)) deadList.push(huntTarget);
                }
            }
            
            // Cupid pair dies
            if (serverGameState.cupidLinks && serverGameState.cupidLinks.includes(dyingId)) {
                const partnerId = serverGameState.cupidLinks.find(id => id !== dyingId);
                if (partnerId && !processed.includes(partnerId) && !queue.includes(partnerId)) {
                    queue.push(partnerId);
                    if (!deadList.includes(partnerId)) deadList.push(partnerId);
                }
            }
        }
        
        // Apply deaths
        deadList.forEach(id => {
            const p = serverGameState.players.find(x => x.id === id);
            if (p) {
                p.status = 'Dead';
                
                let effFaction = p.cloneInheritedFaction || p.originFaction;
                if (effFaction === 'Ma_Sói' && p.role !== 'ENRAGED_WOLF' && p.cloneInheritedRole !== 'ENRAGED_WOLF') {
                    const enragedWolf = serverGameState.players.find(x => 
                        (x.role === 'ENRAGED_WOLF' || x.cloneInheritedRole === 'ENRAGED_WOLF') && x.status === 'Alive'
                    );
                    if (enragedWolf) {
                        serverGameState.enragedWolfStacks = (serverGameState.enragedWolfStacks || 0) + 1;
                    }
                }
                
                // Clone inheritance check
                if (serverGameState.cloneTarget === id) {
                    const clonePlayer = serverGameState.players.find(x => x.role === 'CLONE' && x.status === 'Alive');
                    if (clonePlayer && !clonePlayer.cloneInheritedRole) {
                        clonePlayer.cloneInheritedRole = p.role;
                        clonePlayer.cloneInheritedFaction = p.originFaction;
                        
                        // Notify clone secretly
                        io.to(clonePlayer.id).emit('clone_inherited', { role: clonePlayer.cloneInheritedRole });
                    }
                }
            }
        });
    }

    function advanceNightStep() {
        serverGameState.currentNightStepIndex++;
        serverGameState.nightSubmissions = [];
        
        while (serverGameState.currentNightStepIndex < serverGameState.nightActiveSteps.length) {
            const step = serverGameState.nightActiveSteps[serverGameState.currentNightStepIndex];
            if (getActivePlayersForStep(step).length > 0) {
                if (step === 'WEREWOLF_TEAM') {
                    serverGameState.wolfVotes = {};
                    serverGameState.wolfTempVotes = {};
                }
                
                // Đặt timeout 3 phút cho các Role thường, 5 phút cho Bầy Sói
                const currentNight = serverGameState.day;
                const currentStepIndex = serverGameState.currentNightStepIndex;
                const timeoutMs = step === 'WEREWOLF_TEAM' ? 300000 : 180000;
                
                serverGameState.isNightPaused = false;
                serverGameState.nightDeadline = Date.now() + timeoutMs;
                
                // Hàm đệ quy check timeout mỗi giây để hỗ trợ Pause
                const checkTimeout = () => {
                    if (serverGameState.phase !== 'NIGHT' || serverGameState.day !== currentNight || serverGameState.currentNightStepIndex !== currentStepIndex) return;
                    
                    if (serverGameState.isNightPaused) {
                        serverGameState.nightDeadline += 1000; // Đẩy lùi deadline nếu đang pause
                    }
                    
                    if (Date.now() >= serverGameState.nightDeadline) {
                        if (step === 'WEREWOLF_TEAM') {
                            const activeWolves = getActivePlayersForStep('WEREWOLF_TEAM');
                            const aliveTargets = serverGameState.players.filter(p => p.status === 'Alive');
                            const randomTarget = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
                            serverGameState.nightActions['WEREWOLF_TEAM'] = randomTarget.id;
                            activeWolves.forEach(p => io.to(p.id).emit('wolf_timeout_forced'));
                        }
                        advanceNightStep();
                        broadcastGameState();
                    } else {
                        setTimeout(checkTimeout, 1000);
                    }
                };
                setTimeout(checkTimeout, 1000);
                
                break;
            }
            serverGameState.currentNightStepIndex++;
        }
        
        if (serverGameState.currentNightStepIndex >= serverGameState.nightActiveSteps.length) {
            // --- AUTO DEATH CALCULATION ENGINE ---
            let deadTonight = [];
            
            // 1. Wolves attack
            const wolvesTargetId = serverGameState.nightActions['WEREWOLF_TEAM'];
            let wolfKillSuccess = false;
            if (wolvesTargetId) {
                const isProtected = serverGameState.nightActions['BODYGUARD'] === wolvesTargetId;
                const isSaved = serverGameState.nightActions.witchSave;
                
                if (!isProtected && !isSaved) {
                    const targetPlayer = serverGameState.players.find(p => p.id === wolvesTargetId);
                    if (targetPlayer) {
                        const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
                        if (effRole === 'CURSED_ONE' && !serverGameState.cursedOneBitten) {
                            serverGameState.cursedOneBitten = true;
                            targetPlayer.originFaction = 'Ma_Sói'; // Cursed one turns into wolf
                            targetPlayer.transformedRole = 'WEREWOLF';
                            io.to(targetPlayer.id).emit('cursed_transformed');
                        } else {
                            deadTonight.push(wolvesTargetId);
                            wolfKillSuccess = true;
                        }
                    }
                }
            }

            // 1.1 Alpha Wolf attack
            const alphaTargetId = serverGameState.nightActions['ALPHA_WOLF'];
            if (alphaTargetId) {
                const isProtected = serverGameState.nightActions['BODYGUARD'] === alphaTargetId;
                if (!isProtected) {
                    const targetPlayer = serverGameState.players.find(p => p.id === alphaTargetId);
                    if (targetPlayer) {
                        const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
                        const isAlreadyWolf = (targetPlayer.transformedRole === 'WEREWOLF' && targetPlayer.originFaction === 'Ma_Sói');
                        if (effRole === 'CURSED_ONE' && !serverGameState.cursedOneBitten && !isAlreadyWolf) {
                            serverGameState.cursedOneBitten = true;
                            targetPlayer.originFaction = 'Ma_Sói';
                            targetPlayer.transformedRole = 'WEREWOLF';
                            io.to(targetPlayer.id).emit('cursed_transformed');
                        } else if (!isAlreadyWolf) {
                            if (!deadTonight.includes(alphaTargetId)) deadTonight.push(alphaTargetId);
                        }
                    }
                }
            }
            
            // 2. Witch poison
            const poisonTargetId = serverGameState.nightActions.witchPoisonTarget;
            if (poisonTargetId && !deadTonight.includes(poisonTargetId)) {
                deadTonight.push(poisonTargetId);
            }
            
            // 3. Process cascading deaths (Cupid, Hunter)
            processCascadingDeaths(deadTonight);
            
            // Clear night actions except persistent ones
            // Xóa trạng thái khóa chức năng của Nguyệt Nữ
            serverGameState.players.forEach(p => p.isLocked = false);

            serverGameState.nightActions = {};
            serverGameState.phase = 'DAY';
            serverGameState.day++;
            serverGameState.dayVotes = {}; 
            serverGameState.trialVotes = {};
            serverGameState.wolfVotes = {};
            
            // Xóa trạng thái khóa chức năng của Nguyệt Nữ
            serverGameState.players.forEach(p => p.isLocked = false);
            
            checkGameOver();
        }
    }

    socket.on('finish_night_step', () => {
        advanceNightStep();
        broadcastGameState();
    });

    socket.on('submit_trial_execution', ({ targetId }) => {
        if (targetId) {
            const targetPlayer = serverGameState.players.find(p => p.id === targetId);
            const effRole = targetPlayer ? (targetPlayer.cloneInheritedRole || targetPlayer.role) : null;
            if (effRole === 'FOOL') {
                serverGameState.winner = 'FOOL';
                serverGameState.status = 'WAITING';
                io.emit('game_over_fool_win', targetPlayer.name);
            } else {
                processCascadingDeaths([targetId]);
            }
        }
        if (serverGameState.status !== 'WAITING') {
            serverGameState.phase = 'DAY';
            serverGameState.trialTarget = null;
            checkGameOver();
        }
        broadcastGameState();
    });

    socket.on('kick_player', ({ playerId }) => {
        const userLeaving = globalUsers[playerId];
        if (userLeaving) {
            console.log(`👢 Bị kick: ${userLeaving.name}`);
            const wasHost = userLeaving.isHost;
            delete globalUsers[playerId];

            const remainingUsers = Object.values(globalUsers);
            if (wasHost && remainingUsers.length > 0) {
                remainingUsers[0].isHost = true;
                console.log(`👑 Quyền Chủ phòng tự động chuyển giao cho: ${remainingUsers[0].name}`);
            }

            if (serverGameState.status === 'PLAYING') {
                const p = serverGameState.players.find(x => x.id === playerId);
                if (p && p.status === 'Alive') p.status = 'Dead';
                if (serverGameState.phase === 'DAY_TRIAL' && serverGameState.trialTarget === playerId) {
                    serverGameState.phase = 'DAY';
                    serverGameState.trialTarget = null;
                    serverGameState.trialVotes = {};
                }
                if (!checkGameOver()) {
                    checkAutoProgress();
                }
            } else {
                serverGameState.players = serverGameState.players.filter(p => p.id !== playerId);
            }
            
            io.emit('update_users_list', remainingUsers);
            broadcastGameState();
            io.sockets.sockets.get(playerId)?.disconnect();
        }
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
            const sessionId = userLeaving.id;
            console.log(`🔌 User mất kết nối: ${userLeaving.name} (Chờ 15s để khôi phục...)`);
            
            delete globalUsers[socket.id];
            io.emit('update_users_list', Object.values(globalUsers));

            disconnectTimeouts[sessionId] = setTimeout(() => {
                const isStillHere = Object.values(globalUsers).some(u => u.id === sessionId);
                if (!isStillHere) {
                    console.log(`💀 User thoát hẳn: ${userLeaving.name}`);
                    
                    if (serverGameState.status === 'PLAYING') {
                        const p = serverGameState.players.find(x => x.id === sessionId);
                        if (p && p.status === 'Alive') p.status = 'Dead';
                        if (serverGameState.phase === 'DAY_TRIAL' && serverGameState.trialTarget === sessionId) {
                            serverGameState.phase = 'DAY';
                            serverGameState.trialTarget = null;
                            serverGameState.trialVotes = {};
                        }
                        if (!checkGameOver()) {
                            checkAutoProgress();
                        }
                    } else {
                        serverGameState.players = serverGameState.players.filter(p => p.id !== sessionId);
                    }
                    
                    broadcastGameState();
                    
                    if (Object.keys(globalUsers).length > 0 && userLeaving.isHost) {
                        const remainingUsers = Object.values(globalUsers);
                        remainingUsers[0].isHost = true;
                        console.log(`👑 Quyền Chủ phòng tự động chuyển giao cho: ${remainingUsers[0].name}`);
                        io.emit('update_users_list', remainingUsers);
                    }
                }
            }, 15000);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 SCHOOL Universe vận hành tại cổng: ${PORT}`));