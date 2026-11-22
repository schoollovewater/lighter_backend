const express = require('express');
const cors = require('cors');
const path = require('path');
const actionHandler = require('./api/action');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/plain', limit: '5mb' })); // Hỗ trợ navigator.sendBeacon

// Mount cùng 1 API handler như Vercel Serverless (/api/action)
app.all('/api/action', (req, res) => actionHandler(req, res));

// Phục vụ static assets (Online Hub + Offline GM Assistant tại /gm/)
app.use(express.static(path.join(__dirname, 'public')));

app.get(/^\/gm(\/.*)?$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gm', 'index.html'));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SCHOOL UNIVERSE (Vercel + Firebase mode) chạy tại cổng: ${PORT}`));
