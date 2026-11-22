const crypto = require('crypto');
const { getDb } = require('./firebaseAdmin');

const SERVER_DOC_PATH = ['werewolf_server', 'state'];
const HUB_META_PATH = ['hub', 'meta'];

const WOLF_ROLES = ['WEREWOLF', 'HIDDEN_WOLF', 'ENRAGED_WOLF', 'SHAMAN_WOLF', 'ALPHA_WOLF'];

function createDefaultGameState() {
    return {
        id: 'ww_' + Date.now(),
        status: 'WAITING',
        phase: 'PRE_GAME',
        day: 1,
        players: [],
        selectedRoles: {
            VILLAGER: 1, BODYGUARD: 0, WITCH: 1, BEAR_TAMER: 0, SEER: 1, DETECTIVE: 0, MOON_LADY: 0, HUNTER: 0, CLONE: 0,
            WEREWOLF: 1, HIDDEN_WOLF: 0, ENRAGED_WOLF: 0, SHAMAN_WOLF: 0, ALPHA_WOLF: 0,
            CUPID: 0, FOOL: 0, CURSED_ONE: 0
        },
        cupidMode: 1,
        nightActiveSteps: [],
        currentNightStepIndex: 0,
        nightSubmissions: [],
        nightDeadline: 0,
        pausedRemainingMs: 0,
        isNightPaused: false,
        dayVotes: {},
        trialVotes: {},
        trialTarget: null,
        nightActions: {},
        witchState: { usedSave: false, usedPoison: false },
        cupidLinks: [],
        cupidAwaitingConfirm: false,
        hunterTargets: {},
        cloneTarget: null,
        cursedOneBitten: false,
        moonLadyLastTarget: null,
        bodyguardLastTarget: null,
        morningDead: [],
        morningDay: 0,
        wolfChatHistory: [],
        wolfTempVotes: {},
        wolfVotes: {},
        enragedWolfStacks: 0,
        winner: null
    };
}

function createDefaultServerDoc() {
    return {
        users: {},
        tokenToPlayer: {},
        playerToToken: {},
        gameState: createDefaultGameState(),
        garticState: {
            status: 'WAITING',
            mode: 'NORMAL',
            currentRound: 1,
            totalRounds: 0,
            books: {}
        },
        userEvents: {},
        globalEvent: {},
        version: 1,
        updatedAt: Date.now()
    };
}

function getMaskedStateForUser(gameState, uId) {
    const maskedState = JSON.parse(JSON.stringify(gameState));
    const me = maskedState.players.find(p => p.id === uId);
    const myEffFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
    const amIWolf = myEffFaction === 'Ma_Sói';
    const meEffRole = me ? (me.cloneInheritedRole || me.role) : null;
    const canSeeSeerFlag = Boolean(
        me && me.status === 'Alive' && !me.abilityRemoved && (meEffRole === 'SEER' || meEffRole === 'DETECTIVE')
    );

    maskedState.players.forEach(p => {
        const effFaction = p.cloneInheritedFaction || p.originFaction;
        let isWolf = effFaction === 'Ma_Sói';
        const pEffRole = p.transformedRole || p.cloneInheritedRole || p.role;
        if (pEffRole === 'HIDDEN_WOLF') isWolf = false;
        if (maskedState.nightActions && maskedState.nightActions['SHAMAN_WOLF'] === p.id) isWolf = true;

        if (canSeeSeerFlag) {
            p.isWolfForSeer = isWolf;
        } else {
            delete p.isWolfForSeer;
        }

        if (p.id !== uId) {
            let showRole = false;
            if (amIWolf && effFaction === 'Ma_Sói' && pEffRole !== 'HIDDEN_WOLF') {
                showRole = true;
            }
            if (maskedState.status === 'WAITING' || maskedState.status === 'GAME_OVER') {
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

    if (me && (me.role === 'BEAR_TAMER' || me.cloneInheritedRole === 'BEAR_TAMER') && !me.abilityRemoved) {
        const alivePlayers = gameState.players.filter(p => p.status === 'Alive');
        const myIndex = alivePlayers.findIndex(p => p.id === uId);
        let hasWolfNeighbor = false;
        if (myIndex !== -1 && alivePlayers.length > 1) {
            const leftPlayer = alivePlayers[(myIndex - 1 + alivePlayers.length) % alivePlayers.length];
            const rightPlayer = alivePlayers[(myIndex + 1) % alivePlayers.length];

            [leftPlayer, rightPlayer].forEach(neighbor => {
                const nEffRole = neighbor.transformedRole || neighbor.cloneInheritedRole || neighbor.role;
                let nFaction = neighbor.cloneInheritedFaction || neighbor.originFaction;
                if (nEffRole === 'CURSED_ONE' && gameState.cursedOneBitten) nFaction = 'Ma_Sói';

                if (gameState.nightActions && gameState.nightActions['SHAMAN_WOLF'] === neighbor.id) {
                    hasWolfNeighbor = true;
                } else if (nEffRole === 'HIDDEN_WOLF') {
                    // Sói ẩn qua mặt Gấu
                } else if (nFaction === 'Ma_Sói') {
                    hasWolfNeighbor = true;
                }
            });
        }
        maskedState.bearResult = hasWolfNeighbor;
    }

    if (maskedState.nightActions) {
        const safeActions = {};
        if (meEffRole === 'WITCH' && !maskedState.witchState?.usedSave) {
            safeActions['WEREWOLF_TEAM'] = maskedState.nightActions['WEREWOLF_TEAM'];
        }
        if (amIWolf) {
            safeActions['WEREWOLF_TEAM'] = maskedState.nightActions['WEREWOLF_TEAM'];
        }
        if (meEffRole && maskedState.nightActions[meEffRole]) {
            safeActions[meEffRole] = maskedState.nightActions[meEffRole];
        }
        maskedState.nightActions = safeActions;
    }

    if (meEffRole !== 'HUNTER') maskedState.hunterTargets = {};
    if (meEffRole !== 'CLONE') maskedState.cloneTarget = null;
    if (meEffRole !== 'WITCH') {
        maskedState.witchState = {
            usedSave: Boolean(maskedState.witchState?.usedSave),
            usedPoison: Boolean(maskedState.witchState?.usedPoison)
        };
    }

    const amICupidOrLinked = me && (me.role === 'CUPID' || me.isCupid || (maskedState.cupidLinks || []).includes(me.id));
    if (!amICupidOrLinked && maskedState.status === 'PLAYING') {
        maskedState.cupidLinks = [];
    }

    return maskedState;
}

function getActivePlayersForStep(gameState, step) {
    return gameState.players.filter(p => {
        if (p.status !== 'Alive' || p.isLocked) return false;
        const baseRole = p.cloneInheritedRole || p.role;
        const effRole = p.transformedRole || baseRole;
        if (step === 'CLONE' && p.role === 'CLONE') return true;
        if (step === 'CURSED_ONE' && baseRole === 'CURSED_ONE') return true;
        if (step === 'WEREWOLF_TEAM') return WOLF_ROLES.includes(effRole);
        if (step === 'CUPID') return effRole === 'CUPID' || p.isCupid;
        return effRole === step;
    });
}

function pushUserEvent(state, playerId, key, data = {}) {
    if (!state.userEvents) state.userEvents = {};
    if (!state.userEvents[playerId]) state.userEvents[playerId] = {};
    state.userEvents[playerId][key] = {
        ...data,
        nonce: Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    };
}

function setGameOver(state, winner, extra = {}) {
    const gs = state.gameState;
    gs.winner = winner;
    gs.status = 'GAME_OVER';
    gs.cupidAwaitingConfirm = false;
    state.globalEvent = {
        ...(state.globalEvent || {}),
        gameOver: {
            winner,
            ...extra,
            nonce: Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        }
    };
    state._recordHistory = true;
}

function checkGameOver(state) {
    const gs = state.gameState;
    if (gs.status !== 'PLAYING') return false;
    const alive = gs.players.filter(p => p.status === 'Alive');

    if (alive.length === 0) {
        setGameOver(state, 'DRAW');
        return true;
    }

    let wolves = 0;
    alive.forEach(p => {
        const effFaction = p.cloneInheritedFaction || p.originFaction;
        if (effFaction === 'Ma_Sói') wolves++;
    });

    const cupidTeamCount = alive.filter(
        p => p.role === 'CUPID' || p.isCupid || (gs.cupidLinks && gs.cupidLinks.includes(p.id))
    ).length;
    if (cupidTeamCount > 0 && cupidTeamCount >= alive.length / 2) {
        setGameOver(state, 'CUPID');
        return true;
    }

    if (wolves === 0) {
        setGameOver(state, 'VILLAGERS');
        return true;
    }

    if (wolves >= alive.length - wolves) {
        setGameOver(state, 'WOLVES');
        return true;
    }

    return false;
}

function processCascadingDeaths(state, initialDeadArray) {
    const gs = state.gameState;
    const deadList = [...initialDeadArray];
    const queue = [...initialDeadArray];
    const processed = [];

    while (queue.length > 0) {
        const dyingId = queue.shift();
        if (processed.includes(dyingId)) continue;
        processed.push(dyingId);

        const dyingPlayer = gs.players.find(p => p.id === dyingId);
        if (!dyingPlayer) continue;

        if ((dyingPlayer.cloneInheritedRole || dyingPlayer.role) === 'HUNTER' && !dyingPlayer.abilityRemoved) {
            const huntTarget = gs.hunterTargets ? gs.hunterTargets[dyingId] : null;
            if (huntTarget && !processed.includes(huntTarget) && !queue.includes(huntTarget)) {
                queue.push(huntTarget);
                if (!deadList.includes(huntTarget)) deadList.push(huntTarget);
            }
        }

        if (gs.cupidLinks && gs.cupidLinks.includes(dyingId)) {
            const partnerId = gs.cupidLinks.find(id => id !== dyingId);
            if (partnerId && !processed.includes(partnerId) && !queue.includes(partnerId)) {
                queue.push(partnerId);
                if (!deadList.includes(partnerId)) deadList.push(partnerId);
            }
        }
    }

    // Pass 1: Đánh dấu toàn bộ người chết
    deadList.forEach(id => {
        const p = gs.players.find(x => x.id === id);
        if (p) p.status = 'Dead';
    });

    // Pass 2: Hậu quả chết (Sói Cuồng Nộ & Nhân Bản)
    deadList.forEach(id => {
        const p = gs.players.find(x => x.id === id);
        if (!p) return;

        const effFaction = p.cloneInheritedFaction || p.originFaction;
        if (effFaction === 'Ma_Sói' && p.role !== 'ENRAGED_WOLF' && p.cloneInheritedRole !== 'ENRAGED_WOLF') {
            const enragedWolf = gs.players.find(
                x => (x.role === 'ENRAGED_WOLF' || x.cloneInheritedRole === 'ENRAGED_WOLF') && x.status === 'Alive'
            );
            if (enragedWolf) {
                gs.enragedWolfStacks = (gs.enragedWolfStacks || 0) + 1;
            }
        }

        if (gs.cloneTarget === id) {
            const clonePlayer = gs.players.find(x => x.role === 'CLONE' && x.status === 'Alive');
            if (clonePlayer && !clonePlayer.cloneInheritedRole) {
                clonePlayer.cloneInheritedRole = p.role;
                clonePlayer.cloneInheritedFaction = p.cloneInheritedFaction || p.originFaction;
                if (p.transformedRole) clonePlayer.transformedRole = p.transformedRole;
                pushUserEvent(state, clonePlayer.id, 'cloneInherited', {
                    role: clonePlayer.transformedRole || clonePlayer.cloneInheritedRole
                });
            }
        }
    });

    return deadList;
}

function advanceNightStep(state) {
    const gs = state.gameState;
    gs.currentNightStepIndex++;
    gs.nightSubmissions = [];
    gs.cupidAwaitingConfirm = false;

    if (gs.currentNightStepIndex < gs.nightActiveSteps.length) {
        const step = gs.nightActiveSteps[gs.currentNightStepIndex];
        const activePlayers = getActivePlayersForStep(gs, step);

        if (step === 'WEREWOLF_TEAM') {
            gs.wolfVotes = {};
            gs.wolfTempVotes = {};
        }

        let timeoutMs = 15000;
        if (activePlayers.length > 0) {
            timeoutMs = step === 'WEREWOLF_TEAM' ? 300000 : 180000;
        } else {
            timeoutMs = Math.floor(Math.random() * 5000) + 10000;
        }

        gs.isNightPaused = false;
        gs.pausedRemainingMs = 0;
        gs.nightDeadline = Date.now() + timeoutMs;
        return;
    }

    // --- KẾT THÚC ĐÊM: TÍNH TOÁN TỬ VONG ---
    const deadTonight = [];

    const wolvesTargetId = gs.nightActions['WEREWOLF_TEAM'];
    if (wolvesTargetId) {
        const isProtected = gs.nightActions['BODYGUARD'] === wolvesTargetId;
        const isSaved = gs.nightActions.witchSave;

        if (!isProtected && !isSaved) {
            const targetPlayer = gs.players.find(p => p.id === wolvesTargetId);
            if (targetPlayer) {
                const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
                if (effRole === 'CURSED_ONE' && !gs.cursedOneBitten) {
                    gs.cursedOneBitten = true;
                    targetPlayer.originFaction = 'Ma_Sói';
                    targetPlayer.transformedRole = 'WEREWOLF';
                    pushUserEvent(state, targetPlayer.id, 'cursedTransformed', {});
                } else {
                    deadTonight.push(wolvesTargetId);
                }
            }
        }
    }

    const alphaTargetId = gs.nightActions['ALPHA_WOLF'];
    if (alphaTargetId) {
        const isProtected = gs.nightActions['BODYGUARD'] === alphaTargetId;
        if (!isProtected) {
            const targetPlayer = gs.players.find(p => p.id === alphaTargetId);
            if (targetPlayer) {
                const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
                const isAlreadyWolf = targetPlayer.transformedRole === 'WEREWOLF' && targetPlayer.originFaction === 'Ma_Sói';
                if (effRole === 'CURSED_ONE' && !gs.cursedOneBitten && !isAlreadyWolf) {
                    gs.cursedOneBitten = true;
                    targetPlayer.originFaction = 'Ma_Sói';
                    targetPlayer.transformedRole = 'WEREWOLF';
                    pushUserEvent(state, targetPlayer.id, 'cursedTransformed', {});
                } else if (!isAlreadyWolf) {
                    if (!deadTonight.includes(alphaTargetId)) deadTonight.push(alphaTargetId);
                }
            }
        }
    }

    const poisonTargetId = gs.nightActions.witchPoisonTarget;
    if (poisonTargetId && !deadTonight.includes(poisonTargetId)) {
        deadTonight.push(poisonTargetId);
    }

    const allDeadTonight = processCascadingDeaths(state, deadTonight);

    gs.players.forEach(p => { p.isLocked = false; });
    gs.morningDead = [...allDeadTonight];
    gs.morningDay = gs.day;

    gs.nightActions = {};
    gs.phase = 'DAY';
    gs.day++;
    gs.dayVotes = {};
    gs.trialVotes = {};
    gs.wolfVotes = {};
    gs.nightDeadline = 0;
    gs.pausedRemainingMs = 0;
    gs.isNightPaused = false;
    gs.cupidAwaitingConfirm = false;

    checkGameOver(state);
}

function checkAutoProgress(state) {
    const gs = state.gameState;
    if (gs.status !== 'PLAYING') return false;
    const alivePlayers = gs.players.filter(p => p.status === 'Alive');

    if (gs.phase === 'DAY_VOTING') {
        const votes = gs.dayVotes || {};
        if (Object.keys(votes).length >= alivePlayers.length && alivePlayers.length > 0) {
            const counts = {};
            Object.values(votes).forEach(t => { counts[t] = (counts[t] || 0) + 1; });

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
                gs.phase = 'DAY';
                gs.dayVotes = {};
            } else {
                gs.phase = 'DAY_TRIAL';
                gs.trialTarget = targetId;
                gs.trialVotes = {};
            }
            return true;
        }
    } else if (gs.phase === 'DAY_TRIAL') {
        const votes = gs.trialVotes || {};
        if (Object.keys(votes).length >= alivePlayers.length - 1 && alivePlayers.length > 0) {
            let tha = 0;
            let treo = 0;
            Object.values(votes).forEach(v => (v === 'THA' ? tha++ : treo++));

            if (treo > tha && gs.trialTarget) {
                const targetPlayer = gs.players.find(p => p.id === gs.trialTarget);
                const effRole = targetPlayer ? (targetPlayer.cloneInheritedRole || targetPlayer.role) : null;
                if (effRole === 'FOOL') {
                    setGameOver(state, 'FOOL', { foolName: targetPlayer.name });
                } else {
                    processCascadingDeaths(state, [gs.trialTarget]);
                }
            }
            if (gs.status !== 'GAME_OVER') {
                gs.phase = 'DAY';
                gs.trialTarget = null;
                gs.trialVotes = {};
                checkGameOver(state);
            }
            return true;
        }
    } else if (gs.phase === 'NIGHT') {
        const currentStep = gs.nightActiveSteps[gs.currentNightStepIndex];
        if (!currentStep) return false;

        const activePlayers = getActivePlayersForStep(gs, currentStep);
        const submissions = gs.nightSubmissions || [];

        if (activePlayers.length > 0 && submissions.length >= activePlayers.length) {
            if (currentStep === 'WEREWOLF_TEAM') {
                const votes = gs.wolfVotes || {};
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

                if (isTie && activePlayers.length > 1) {
                    activePlayers.forEach(p => pushUserEvent(state, p.id, 'wolfVoteTie', {}));
                    gs.nightSubmissions = [];
                    gs.wolfVotes = {};
                    return false;
                } else if (targetId) {
                    gs.nightActions['WEREWOLF_TEAM'] = targetId;
                }
            }

            if (currentStep === 'ENRAGED_WOLF') {
                const action = gs.nightActions['ENRAGED_WOLF'];
                if (action && (gs.enragedWolfStacks || 0) > 0) {
                    const target = gs.players.find(p => p.id === action);
                    if (target) target.abilityRemoved = true;
                    gs.enragedWolfStacks = Math.max(0, gs.enragedWolfStacks - 1);
                }
            }

            advanceNightStep(state);
            return true;
        }
    }
    return false;
}

function applyAction(state, token, action, payload = {}) {
    const gs = state.gameState;
    const myId = state.tokenToPlayer[token] || null;
    const meUser = myId ? state.users[myId] : null;
    const response = { ok: true };

    if (action === 'join_hub') {
        const name = String(payload.name || '').trim().slice(0, 40);
        const avatar = String(payload.avatar || '😎').slice(0, 8);
        if (!name) throw new Error('Tên không được để trống');

        let playerId = myId;
        if (!playerId) {
            playerId = 'u_' + crypto.randomBytes(5).toString('hex');
            state.tokenToPlayer[token] = playerId;
            state.playerToToken[playerId] = token;
        }

        const existingUsers = Object.values(state.users);
        const hasHost = existingUsers.some(u => u.isHost);
        const isHost = state.users[playerId] ? state.users[playerId].isHost : !hasHost;

        state.users[playerId] = {
            id: playerId,
            name,
            avatar,
            isHost,
            inVoice: state.users[playerId]?.inVoice || false,
            lastSeen: Date.now()
        };

        // Cập nhật tên/avatar nếu đang trong danh sách chờ
        const inLobby = gs.players.find(p => p.id === playerId);
        if (inLobby && gs.status === 'WAITING') {
            inLobby.name = name;
            inLobby.avatar = avatar;
        }

        response.myId = playerId;
        return response;
    }

    if (!myId || !meUser) {
        throw new Error('Phiên đăng nhập chưa hợp lệ. Hãy vào lại sảnh chờ.');
    }
    meUser.lastSeen = Date.now();

    if (action === 'heartbeat') {
        response.noBroadcast = true;
        return response;
    }

    if (action === 'leave_hub') {
        const wasHost = meUser.isHost;
        delete state.users[myId];

        const remaining = Object.values(state.users);
        if (wasHost && remaining.length > 0) {
            remaining[0].isHost = true;
        }

        if (gs.status === 'PLAYING') {
            const p = gs.players.find(x => x.id === myId);
            if (p && p.status === 'Alive') p.status = 'Dead';
            if (gs.phase === 'DAY_TRIAL' && gs.trialTarget === myId) {
                gs.phase = 'DAY';
                gs.trialTarget = null;
                gs.trialVotes = {};
            }
            if (!checkGameOver(state)) checkAutoProgress(state);
        } else {
            gs.players = gs.players.filter(p => p.id !== myId);
        }
        return response;
    }

    if (action === 'join_werewolf_lobby') {
        if (gs.status !== 'WAITING') return response;
        if (!gs.players.find(p => p.id === myId)) {
            gs.players.push({
                id: myId,
                name: meUser.name,
                avatar: meUser.avatar,
                status: 'Alive'
            });
        }
        return response;
    }

    if (action === 'leave_werewolf_lobby') {
        if (gs.status !== 'WAITING') return response;
        gs.players = gs.players.filter(p => p.id !== myId);
        return response;
    }

    if (action === 'update_werewolf_settings') {
        if (!meUser.isHost || gs.status !== 'WAITING') return response;
        if (payload.selectedRoles && typeof payload.selectedRoles === 'object') {
            gs.selectedRoles = { ...gs.selectedRoles, ...payload.selectedRoles };
        }
        if (payload.cupidMode !== undefined) {
            gs.cupidMode = parseInt(payload.cupidMode, 10) === 2 ? 2 : 1;
        }
        return response;
    }

    if (action === 'start_werewolf_match') {
        if (!meUser.isHost) throw new Error('Chỉ Chủ phòng mới có thể bắt đầu!');
        const totalRoles = Object.values(gs.selectedRoles || {}).reduce((a, b) => a + b, 0);
        const totalPlayers = gs.players.length;
        if (totalPlayers === 0) throw new Error('Phòng chờ đang trống!');
        if (totalRoles !== totalPlayers) throw new Error(`Số bài (${totalRoles}) không khớp số người chơi (${totalPlayers})!`);

        const rolesDeck = [];
        Object.entries(gs.selectedRoles).forEach(([role, count]) => {
            if (role === 'CUPID' && gs.cupidMode === 2) {
                for (let i = 0; i < count; i++) rolesDeck.push('VILLAGER');
            } else {
                for (let i = 0; i < count; i++) rolesDeck.push(role);
            }
        });
        for (let i = rolesDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolesDeck[i], rolesDeck[j]] = [rolesDeck[j], rolesDeck[i]];
        }

        gs.players = gs.players.map((p, idx) => {
            const role = rolesDeck[idx];
            return {
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                role,
                status: 'Alive',
                originFaction: WOLF_ROLES.includes(role) ? 'Ma_Sói' : 'Dân_Làng',
                isLocked: false,
                isCupid: false
            };
        });

        if (gs.cupidMode === 2 && (gs.selectedRoles['CUPID'] || 0) > 0) {
            const randomIdx = Math.floor(Math.random() * gs.players.length);
            gs.players[randomIdx].isCupid = true;
        }

        gs.id = 'ww_' + Date.now();
        gs.status = 'PLAYING';
        gs.phase = 'PRE_GAME';
        gs.day = 1;
        gs.nightActiveSteps = [];
        gs.currentNightStepIndex = 0;
        gs.nightSubmissions = [];
        gs.nightDeadline = 0;
        gs.pausedRemainingMs = 0;
        gs.isNightPaused = false;
        gs.dayVotes = {};
        gs.trialVotes = {};
        gs.trialTarget = null;
        gs.nightActions = {};
        gs.witchState = { usedSave: false, usedPoison: false };
        gs.cupidLinks = [];
        gs.cupidAwaitingConfirm = false;
        gs.hunterTargets = {};
        gs.cloneTarget = null;
        gs.cursedOneBitten = false;
        gs.moonLadyLastTarget = null;
        gs.bodyguardLastTarget = null;
        gs.morningDead = [];
        gs.morningDay = 0;
        gs.wolfChatHistory = [];
        gs.wolfTempVotes = {};
        gs.wolfVotes = {};
        gs.enragedWolfStacks = 0;
        gs.winner = null;
        state.userEvents = {};
        state.globalEvent = {};
        return response;
    }

    if (action === 'start_night') {
        if (gs.status !== 'PLAYING' || !meUser.isHost) return response;
        const allPlayers = gs.players;
        const effRoles = allPlayers.map(p => p.cloneInheritedRole || p.role);
        const hasCupidMode2 = allPlayers.some(p => p.isCupid);

        const steps = [];
        if (gs.day === 1 && (effRoles.includes('CUPID') || hasCupidMode2)) steps.push('CUPID');
        if (allPlayers.some(p => p.role === 'CLONE')) steps.push('CLONE');
        if (effRoles.includes('MOON_LADY')) steps.push('MOON_LADY');
        if (effRoles.includes('CURSED_ONE')) steps.push('CURSED_ONE');
        if (effRoles.some(r => WOLF_ROLES.includes(r))) steps.push('WEREWOLF_TEAM');
        if (effRoles.includes('ALPHA_WOLF')) steps.push('ALPHA_WOLF');
        if (effRoles.includes('ENRAGED_WOLF')) steps.push('ENRAGED_WOLF');
        if (effRoles.includes('SHAMAN_WOLF')) steps.push('SHAMAN_WOLF');
        if (effRoles.includes('BODYGUARD')) steps.push('BODYGUARD');
        if (effRoles.includes('WITCH')) steps.push('WITCH');
        if (effRoles.includes('BEAR_TAMER')) steps.push('BEAR_TAMER');
        if (effRoles.includes('SEER')) steps.push('SEER');
        if (effRoles.includes('DETECTIVE')) steps.push('DETECTIVE');
        if (gs.day === 1 && effRoles.includes('FOOL')) steps.push('FOOL');
        if (effRoles.includes('HUNTER')) steps.push('HUNTER');

        gs.nightActions = {};
        gs.wolfVotes = {};
        gs.wolfTempVotes = {};
        gs.cupidAwaitingConfirm = false;
        gs.nightActiveSteps = steps;
        gs.currentNightStepIndex = -1;
        gs.phase = 'NIGHT';

        advanceNightStep(state);
        return response;
    }

    if (action === 'submit_night_action') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'NIGHT') return response;
        const role = payload.role;
        const actionData = payload.actionData || {};
        if (!gs.nightActions) gs.nightActions = {};

        const actingPlayer = gs.players.find(p => p.id === myId);
        if (!actingPlayer || actingPlayer.status !== 'Alive' || actingPlayer.isLocked) return response;

        const abilitySealed = Boolean(actingPlayer.abilityRemoved);
        if (!abilitySealed) {
            if (role === 'WITCH') {
                if (actionData.save && !gs.witchState.usedSave) {
                    gs.witchState.usedSave = true;
                    gs.nightActions.witchSave = true;
                }
                if (actionData.poison && !gs.witchState.usedPoison) {
                    gs.witchState.usedPoison = true;
                    gs.nightActions.witchPoisonTarget = actionData.poison;
                }
            } else if (role === 'CUPID') {
                gs.cupidLinks = actionData.links || [];
                if (actionData.links && actionData.links.length === 2) {
                    const members = gs.players
                        .filter(p => actionData.links.includes(p.id))
                        .map(p => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role }));
                    const cupidPlayer = gs.cupidMode === 1
                        ? gs.players.find(p => p.role === 'CUPID')
                        : gs.players.find(p => p.isCupid);
                    if (cupidPlayer && !members.find(m => m.id === cupidPlayer.id)) {
                        members.push({ id: cupidPlayer.id, name: cupidPlayer.name, avatar: cupidPlayer.avatar, role: cupidPlayer.role });
                    }
                    gs.cupidAwaitingConfirm = true;
                    members.forEach(m => pushUserEvent(state, m.id, 'cupidReveal', { members }));
                    return response;
                }
            } else if (role === 'HUNTER') {
                gs.hunterTargets[myId] = actionData.target || null;
            } else if (role === 'CLONE') {
                if (actionData.target) gs.cloneTarget = actionData.target;
            } else if (role === 'MOON_LADY') {
                gs.nightActions[role] = actionData.target || null;
                gs.moonLadyLastTarget = actionData.target || null;
                if (actionData.target) {
                    const targetPlayer = gs.players.find(p => p.id === actionData.target);
                    if (targetPlayer) targetPlayer.isLocked = true;
                }
            } else if (role === 'WEREWOLF_TEAM') {
                if (!gs.wolfVotes) gs.wolfVotes = {};
                gs.wolfVotes[myId] = actionData.target || null;
                gs.nightActions[role] = actionData.target || null;
            } else if (role === 'ALPHA_WOLF') {
                const livingWolvesCount = gs.players.filter(
                    x => x.status === 'Alive' && (x.cloneInheritedFaction || x.originFaction) === 'Ma_Sói'
                ).length;
                if (livingWolvesCount === 1) {
                    gs.nightActions[role] = actionData.target || null;
                }
            } else {
                gs.nightActions[role] = actionData.target || null;
                if (role === 'BODYGUARD') {
                    gs.bodyguardLastTarget = actionData.target || null;
                }
            }
        }

        if (!gs.nightSubmissions) gs.nightSubmissions = [];
        if (!gs.nightSubmissions.includes(myId)) gs.nightSubmissions.push(myId);

        checkAutoProgress(state);
        return response;
    }

    if (action === 'finish_night_step') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'NIGHT') return response;
        const currentStep = gs.nightActiveSteps[gs.currentNightStepIndex];
        const mePlayer = gs.players.find(p => p.id === myId);
        const isCupid = mePlayer && (mePlayer.role === 'CUPID' || mePlayer.isCupid);
        if (!meUser.isHost && !(currentStep === 'CUPID' && isCupid)) return response;

        gs.cupidAwaitingConfirm = false;
        advanceNightStep(state);
        return response;
    }

    if (action === 'force_skip_night_step') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'NIGHT' || !meUser.isHost) return response;
        gs.cupidAwaitingConfirm = false;
        advanceNightStep(state);
        return response;
    }

    if (action === 'toggle_night_pause') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'NIGHT') return response;
        if (!gs.isNightPaused) {
            gs.isNightPaused = true;
            gs.pausedRemainingMs = Math.max(1000, (gs.nightDeadline || Date.now()) - Date.now());
        } else {
            gs.isNightPaused = false;
            gs.nightDeadline = Date.now() + (gs.pausedRemainingMs || 30000);
            gs.pausedRemainingMs = 0;
        }
        return response;
    }

    if (action === 'check_night_timeout') {
        if (
            gs.status !== 'PLAYING' ||
            gs.phase !== 'NIGHT' ||
            gs.isNightPaused ||
            !gs.nightDeadline ||
            Date.now() < gs.nightDeadline
        ) {
            response.noBroadcast = true;
            return response;
        }
        if (
            payload.expectedDay !== undefined &&
            (gs.day !== payload.expectedDay || gs.currentNightStepIndex !== payload.expectedStepIndex)
        ) {
            response.noBroadcast = true;
            return response;
        }

        const step = gs.nightActiveSteps[gs.currentNightStepIndex];
        const activePlayers = getActivePlayersForStep(gs, step);
        if (step === 'WEREWOLF_TEAM' && activePlayers.length > 0) {
            const aliveTargets = gs.players.filter(p => p.status === 'Alive');
            if (aliveTargets.length > 0) {
                const randomTarget = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
                gs.nightActions['WEREWOLF_TEAM'] = randomTarget.id;
                activePlayers.forEach(p => pushUserEvent(state, p.id, 'wolfTimeoutForced', {}));
            }
        }
        advanceNightStep(state);
        return response;
    }

    if (action === 'send_wolf_chat') {
        if (gs.status !== 'PLAYING') return response;
        const me = gs.players.find(p => p.id === myId);
        const effFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
        if (effFaction !== 'Ma_Sói') return response;
        const text = String(payload.text || '').trim().slice(0, 400);
        if (!text) return response;

        if (!gs.wolfChatHistory) gs.wolfChatHistory = [];
        gs.wolfChatHistory.push({
            id: 'wc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            senderName: meUser.name,
            senderAvatar: meUser.avatar,
            text
        });
        if (gs.wolfChatHistory.length > 80) gs.wolfChatHistory = gs.wolfChatHistory.slice(-80);
        return response;
    }

    if (action === 'send_wolf_temp_vote') {
        if (gs.status !== 'PLAYING') return response;
        const me = gs.players.find(p => p.id === myId);
        const effFaction = me ? (me.cloneInheritedFaction || me.originFaction) : null;
        if (effFaction !== 'Ma_Sói') return response;
        if (!gs.wolfTempVotes) gs.wolfTempVotes = {};
        gs.wolfTempVotes[myId] = payload.targetId || null;
        return response;
    }

    if (action === 'start_day_voting') {
        if (gs.status !== 'PLAYING' || !meUser.isHost) return response;
        gs.phase = 'DAY_VOTING';
        gs.dayVotes = {};
        return response;
    }

    if (action === 'submit_werewolf_vote') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'DAY_VOTING') return response;
        const voter = gs.players.find(p => p.id === myId);
        const target = gs.players.find(p => p.id === payload.targetId);
        if (!voter || voter.status !== 'Alive' || !target || target.status !== 'Alive') return response;

        if (!gs.dayVotes) gs.dayVotes = {};
        gs.dayVotes[myId] = payload.targetId;
        checkAutoProgress(state);
        return response;
    }

    if (action === 'host_lock_day_votes') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'DAY_VOTING' || !meUser.isHost) return response;
        const votes = gs.dayVotes || {};
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

        if (isTie || !targetId) {
            gs.phase = 'DAY';
            gs.dayVotes = {};
        } else {
            gs.phase = 'DAY_TRIAL';
            gs.trialTarget = targetId;
            gs.trialVotes = {};
        }
        return response;
    }

    if (action === 'submit_werewolf_trial') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'DAY_TRIAL') return response;
        const voter = gs.players.find(p => p.id === myId);
        if (!voter || voter.status !== 'Alive') return response;
        if (myId === gs.trialTarget) return response;
        if (payload.vote !== 'THA' && payload.vote !== 'TREO') return response;

        if (!gs.trialVotes) gs.trialVotes = {};
        gs.trialVotes[myId] = payload.vote;
        checkAutoProgress(state);
        return response;
    }

    if (action === 'host_finalize_trial') {
        if (gs.status !== 'PLAYING' || gs.phase !== 'DAY_TRIAL' || !meUser.isHost) return response;
        const votes = gs.trialVotes || {};
        let tha = 0;
        let treo = 0;
        Object.values(votes).forEach(v => (v === 'THA' ? tha++ : treo++));

        if (treo > tha && gs.trialTarget) {
            const targetPlayer = gs.players.find(p => p.id === gs.trialTarget);
            const effRole = targetPlayer ? (targetPlayer.cloneInheritedRole || targetPlayer.role) : null;
            if (effRole === 'FOOL') {
                setGameOver(state, 'FOOL', { foolName: targetPlayer.name });
            } else {
                processCascadingDeaths(state, [gs.trialTarget]);
            }
        }
        if (gs.status !== 'GAME_OVER') {
            gs.phase = 'DAY';
            gs.trialTarget = null;
            gs.trialVotes = {};
            checkGameOver(state);
        }
        return response;
    }

    if (action === 'host_kill_player') {
        if (!meUser.isHost) return response;
        const p = gs.players.find(x => x.id === payload.playerId);
        if (p) {
            if (p.status === 'Alive') {
                processCascadingDeaths(state, [payload.playerId]);
            } else {
                p.status = 'Alive';
            }
            if (gs.status === 'PLAYING') {
                if (!checkGameOver(state)) checkAutoProgress(state);
            }
        }
        return response;
    }

    if (action === 'kick_player') {
        if (!meUser.isHost) return response;
        const targetId = payload.playerId;
        const targetUser = state.users[targetId];
        if (!targetUser) return response;

        const wasHost = targetUser.isHost;
        delete state.users[targetId];
        pushUserEvent(state, targetId, 'kicked', {});

        const remaining = Object.values(state.users);
        if (wasHost && remaining.length > 0) remaining[0].isHost = true;

        if (gs.status === 'PLAYING') {
            const p = gs.players.find(x => x.id === targetId);
            if (p && p.status === 'Alive') p.status = 'Dead';
            if (gs.phase === 'DAY_TRIAL' && gs.trialTarget === targetId) {
                gs.phase = 'DAY';
                gs.trialTarget = null;
                gs.trialVotes = {};
            }
            if (!checkGameOver(state)) checkAutoProgress(state);
        } else {
            gs.players = gs.players.filter(p => p.id !== targetId);
        }
        return response;
    }

    if (action === 'end_werewolf_game') {
        if (!meUser.isHost) return response;
        gs.status = 'WAITING';
        gs.phase = 'PRE_GAME';
        gs.cupidAwaitingConfirm = false;
        gs.nightDeadline = 0;
        return response;
    }

    if (action === 'sync_gartic_state') {
        if (payload.garticState && typeof payload.garticState === 'object') {
            state.garticState = payload.garticState;
        }
        return response;
    }

    if (action === 'submit_gartic_turn') {
        const { bookOwnerId, type, value } = payload;
        if (state.garticState?.books?.[bookOwnerId]) {
            state.garticState.books[bookOwnerId].push({
                author: meUser.name || 'Ẩn danh',
                type,
                value
            });
        }
        return response;
    }

    if (action === 'join_voice_channel') {
        meUser.inVoice = true;
        return response;
    }

    if (action === 'leave_voice_channel') {
        meUser.inVoice = false;
        return response;
    }

    throw new Error(`Hành động không hợp lệ: ${action}`);
}

async function executeAction(token, action, payload = {}) {
    const db = getDb();
    if (!token || typeof token !== 'string' || token.length < 8) {
        throw new Error('Thiếu secretToken hợp lệ');
    }

    // Các hành động không cần khóa transaction game state (nhanh hơn rất nhiều)
    if (action === 'send_chat_message') {
        const text = String(payload.text || '').trim().slice(0, 600);
        if (!text) return { ok: true };

        const serverSnap = await db.collection(SERVER_DOC_PATH[0]).doc(SERVER_DOC_PATH[1]).get();
        const serverData = serverSnap.exists ? serverSnap.data() : null;
        const myId = serverData?.tokenToPlayer?.[token];
        const meUser = myId ? serverData?.users?.[myId] : null;
        if (!meUser) throw new Error('Bạn chưa vào sảnh chờ');

        const msgId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        await db.collection('messages').doc(msgId).set({
            id: msgId,
            senderId: myId,
            senderName: meUser.name,
            senderAvatar: meUser.avatar,
            text,
            createdAt: Date.now()
        });
        return { ok: true, id: msgId };
    }

    if (action === 'voice_signal') {
        const { targetId, signal } = payload;
        if (!targetId || !signal) return { ok: true };

        const serverSnap = await db.collection(SERVER_DOC_PATH[0]).doc(SERVER_DOC_PATH[1]).get();
        const serverData = serverSnap.exists ? serverSnap.data() : null;
        const senderId = serverData?.tokenToPlayer?.[token];
        const targetToken = serverData?.playerToToken?.[targetId];
        if (!senderId || !targetToken) return { ok: true };

        const inboxRef = db.collection('voice_inbox').doc(targetToken);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(inboxRef);
            const prev = snap.exists && Array.isArray(snap.data().signals) ? snap.data().signals : [];
            const next = [
                ...prev.slice(-39),
                {
                    id: 'vs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    senderId,
                    signal,
                    ts: Date.now()
                }
            ];
            tx.set(inboxRef, { signals: next, updatedAt: Date.now() });
        });
        return { ok: true };
    }

    // Các hành động thay đổi trạng thái dùng Firestore Transaction chống race condition
    const serverRef = db.collection(SERVER_DOC_PATH[0]).doc(SERVER_DOC_PATH[1]);
    const hubMetaRef = db.collection(HUB_META_PATH[0]).doc(HUB_META_PATH[1]);

    const txResult = await db.runTransaction(async (tx) => {
        const snap = await tx.get(serverRef);
        const state = snap.exists ? snap.data() : createDefaultServerDoc();
        if (!state.users) state.users = {};
        if (!state.tokenToPlayer) state.tokenToPlayer = {};
        if (!state.playerToToken) state.playerToToken = {};
        if (!state.gameState) state.gameState = createDefaultGameState();
        if (!state.userEvents) state.userEvents = {};
        if (!state.globalEvent) state.globalEvent = {};

        const prevStatus = state.gameState.status;
        const result = applyAction(state, token, action, payload);
        const shouldRecordHistory = Boolean(state._recordHistory && prevStatus !== 'GAME_OVER');
        delete state._recordHistory;

        state.version = (state.version || 0) + 1;
        state.updatedAt = Date.now();

        tx.set(serverRef, state);

        if (!result.noBroadcast) {
            const publicUsers = Object.values(state.users).map(u => ({
                id: u.id,
                name: u.name,
                avatar: u.avatar,
                isHost: Boolean(u.isHost),
                inVoice: Boolean(u.inVoice)
            }));

            tx.set(hubMetaRef, {
                users: publicUsers,
                garticState: state.garticState,
                updatedAt: state.updatedAt
            });

            // Đồng bộ masked view riêng cho từng người chơi online + người vừa bị kick
            const tokensToUpdate = new Set();
            Object.keys(state.users).forEach(pid => {
                const t = state.playerToToken[pid];
                if (t) tokensToUpdate.add(t);
            });
            if (action === 'kick_player' && payload.playerId && state.playerToToken[payload.playerId]) {
                tokensToUpdate.add(state.playerToToken[payload.playerId]);
            }
            tokensToUpdate.add(token);

            tokensToUpdate.forEach(t => {
                const pid = state.tokenToPlayer[t];
                if (!pid) return;
                const viewRef = db.collection('werewolf_views').doc(t);
                tx.set(viewRef, {
                    myId: pid,
                    gameState: getMaskedStateForUser(state.gameState, pid),
                    userEvents: state.userEvents[pid] || {},
                    globalEvent: state.globalEvent || {},
                    updatedAt: state.updatedAt
                });
            });
        }

        if (shouldRecordHistory) {
            const matchId = state.gameState.id || ('ww_' + Date.now());
            const histRef = db.collection('match_history').doc(matchId);
            tx.set(histRef, {
                id: matchId,
                winner: state.gameState.winner,
                dayCount: state.gameState.day,
                endedAt: Date.now(),
                players: state.gameState.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    avatar: p.avatar,
                    role: p.role,
                    finalRole: p.transformedRole || p.cloneInheritedRole || p.role,
                    status: p.status
                }))
            });
        }

        return result;
    });

    return txResult;
}

module.exports = {
    createDefaultGameState,
    createDefaultServerDoc,
    getMaskedStateForUser,
    applyAction,
    executeAction
};
