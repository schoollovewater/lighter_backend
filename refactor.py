import re

with open('server.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add disconnectTimeouts
text = text.replace('const serverMessages = [];', 'const serverMessages = [];\nconst disconnectTimeouts = {};')

# 2. Replace join_hub
join_hub_pattern = re.compile(r"socket\.on\('join_hub', \(userData\) => \{.*?(?=socket\.emit\('initial_state')", re.DOTALL)
replacement_1 = '''socket.on('join_hub', (userData) => {
        const isFirst = Object.keys(globalUsers).length === 0;
        const sessionId = userData.sessionId || socket.id;

        if (disconnectTimeouts.get(sessionId)) {
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
            console.log(♻️ User Reconnected: );
        } else {
            globalUsers[socket.id] = {
                id: sessionId,
                name: userData.name,
                avatar: userData.avatar || '🐰',
                isHost: isFirst
            };
            console.log(👋 User nhập cuộc: );
        }
        
        '''

text = join_hub_pattern.sub(replacement_1, text)

# 3. Replace myId: socket.id inside join_hub
text = text.replace("myId: socket.id,", "myId: sessionId,")
text = text.replace("gameState: getMaskedStateForUser(socket.id),", "gameState: getMaskedStateForUser(sessionId),")

# 4. Replace other socket.id usages
text = text.replace("const me = serverGameState.players.find(p => p.id === socket.id);", "const me = serverGameState.players.find(p => p.id === (globalUsers[socket.id]?.id));")
text = text.replace("serverGameState.wolfTempVotes[socket.id] = targetId;", "const voterId = globalUsers[socket.id]?.id;\n        if(voterId) serverGameState.wolfTempVotes[voterId] = targetId;")

# 5. Replace disconnect
disconnect_pattern = re.compile(r"socket\.on\('disconnect', \(\) => \{.*?(?=\}\);)", re.DOTALL)
new_disconnect = '''socket.on('disconnect', () => {
        const userLeaving = globalUsers[socket.id];
        if (userLeaving) {
            const sessionId = userLeaving.id;
            console.log(🔌 User mất kết nối:  (Chờ 15s để khôi phục...));
            
            delete globalUsers[socket.id];
            io.emit('update_users_list', Object.values(globalUsers));

            disconnectTimeouts[sessionId] = setTimeout(() => {
                const isStillHere = Object.values(globalUsers).some(u => u.id === sessionId);
                if (!isStillHere) {
                    console.log(💀 User thoát hẳn: );
                    
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
                        console.log(👑 Quyền Chủ phòng tự động chuyển giao cho: );
                        io.emit('update_users_list', remainingUsers);
                    }
                }
            }, 15000);
        }
    '''

text = disconnect_pattern.sub(new_disconnect, text)

# Fix a dictionary error: javascript doesn't have dict.get(), it should be checking truthiness
text = text.replace("if (disconnectTimeouts.get(sessionId)) {", "if (disconnectTimeouts[sessionId]) {")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
