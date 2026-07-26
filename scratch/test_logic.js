// Script giả lập logic test không cần khởi chạy Socket Server
const io = {
    to: () => ({ emit: () => {} }),
    emit: () => {}
};

let serverGameState = {
    status: 'PLAYING', phase: 'NIGHT', day: 1, 
    players: [], 
    nightActiveSteps: ['WEREWOLF_TEAM', 'ALPHA_WOLF'],
    currentNightStepIndex: 1,
    nightActions: {},
    deadTonight: []
};

// --- MOCK HÀM LOGIC CỦA SERVER ---
function processCascadingDeaths(initialDeadArray) {
    initialDeadArray.forEach(id => {
        const p = serverGameState.players.find(x => x.id === id);
        if (p) p.status = 'Dead';
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

    if (wolves >= alive.length - wolves) {
        serverGameState.winner = 'WOLVES';
        return true;
    }
    if (wolves === 0) {
        serverGameState.winner = 'VILLAGERS';
        return true;
    }
    return false;
}

function advanceNightStep() {
    // Chỉ mô phỏng đoạn tính cái chết
    let deadTonight = [];
    
    // Sói thường cắn
    const wolvesTargetId = serverGameState.nightActions['WEREWOLF_TEAM'];
    if (wolvesTargetId) {
        const targetPlayer = serverGameState.players.find(p => p.id === wolvesTargetId);
        if (targetPlayer) {
            const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
            if (effRole === 'CURSED_ONE' && !serverGameState.cursedOneBitten) {
                serverGameState.cursedOneBitten = true;
                targetPlayer.originFaction = 'Ma_Sói';
                targetPlayer.transformedRole = 'WEREWOLF';
            } else {
                deadTonight.push(wolvesTargetId);
            }
        }
    }

    // Sói đầu đàn cắn
    const alphaTargetId = serverGameState.nightActions['ALPHA_WOLF'];
    if (alphaTargetId) {
        const targetPlayer = serverGameState.players.find(p => p.id === alphaTargetId);
        if (targetPlayer) {
            const effRole = targetPlayer.cloneInheritedRole || targetPlayer.role;
            const isAlreadyWolf = (targetPlayer.transformedRole === 'WEREWOLF' && targetPlayer.originFaction === 'Ma_Sói');
            if (effRole === 'CURSED_ONE' && !serverGameState.cursedOneBitten && !isAlreadyWolf) {
                serverGameState.cursedOneBitten = true;
                targetPlayer.originFaction = 'Ma_Sói';
                targetPlayer.transformedRole = 'WEREWOLF';
            } else if (!isAlreadyWolf) {
                if (!deadTonight.includes(alphaTargetId)) deadTonight.push(alphaTargetId);
            }
        }
    }

    processCascadingDeaths(deadTonight);
    checkGameOver();
}

// --- CHẠY TEST CASE ---

console.log('--- TEST CASE 1: Bầy sói cắn Cursed One, Sói đầu đàn cắn trùng Cursed One ---');
serverGameState.players = [
    { id: '1', name: 'Wolf1', role: 'WEREWOLF', originFaction: 'Ma_Sói', status: 'Alive' },
    { id: '2', name: 'Alpha', role: 'ALPHA_WOLF', originFaction: 'Ma_Sói', status: 'Alive' },
    { id: '3', name: 'Cursed', role: 'CURSED_ONE', originFaction: 'Dân_Làng', status: 'Alive' },
];
serverGameState.nightActions = { 'WEREWOLF_TEAM': '3', 'ALPHA_WOLF': '3' };
serverGameState.cursedOneBitten = false;

advanceNightStep();
console.log('Sau đêm:');
console.log('Trạng thái Cursed One:', serverGameState.players.find(p=>p.id==='3').status);
console.log('Faction mới của Cursed One:', serverGameState.players.find(p=>p.id==='3').originFaction);
console.log('Role mới của Cursed One:', serverGameState.players.find(p=>p.id==='3').transformedRole);
if (serverGameState.players.find(p=>p.id==='3').status === 'Alive' && serverGameState.players.find(p=>p.id==='3').originFaction === 'Ma_Sói') {
    console.log('=> PASS: Kẻ bị nguyền sống sót và hóa sói thành công.');
} else {
    console.log('=> FAIL: Kẻ bị nguyền đã chết!');
}

console.log('\n--- TEST CASE 2: Dân bị cắn chết, Sói >= Dân -> Sói Thắng ---');
serverGameState.status = 'PLAYING';
serverGameState.players = [
    { id: '1', name: 'Wolf1', role: 'WEREWOLF', originFaction: 'Ma_Sói', status: 'Alive' },
    { id: '2', name: 'Villager', role: 'VILLAGER', originFaction: 'Dân_Làng', status: 'Alive' },
];
serverGameState.nightActions = { 'WEREWOLF_TEAM': '2' }; // Cắn chết Dân làng
advanceNightStep();
console.log('Winner:', serverGameState.winner);
if (serverGameState.winner === 'WOLVES') {
    console.log('=> PASS: Sói đã thắng game khi số lượng bằng Dân.');
} else {
    console.log('=> FAIL: Game chưa Over.');
}
