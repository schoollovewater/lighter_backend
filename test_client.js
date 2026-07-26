const io = require('socket.io-client');
const socket = io('http://localhost:3000');
socket.on('connect', () => {
    console.log('Connected');
    socket.emit('join_hub', { name: 'Test', avatar: '🐰', sessionId: '123' });
});
socket.on('initial_state', (data) => {
    console.log('Got initial state', Object.keys(data));
    process.exit(0);
});
socket.on('disconnect', () => {
    console.log('Disconnected');
});
