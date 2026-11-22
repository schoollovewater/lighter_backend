const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let cachedDb = null;

function loadServiceAccount() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
        if (raw.startsWith('{')) {
            return JSON.parse(raw);
        }
        // Hỗ trợ cả chuỗi Base64 để dán lên Vercel không bị lỗi ký tự xuống dòng
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        return JSON.parse(decoded);
    }

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        return {
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
    }

    // Tự tìm file service account local khi chạy dev trên máy
    const rootDir = path.resolve(__dirname, '..');
    const explicitPath = path.join(rootDir, 'firebase-service-account.json');
    if (fs.existsSync(explicitPath)) {
        return JSON.parse(fs.readFileSync(explicitPath, 'utf8'));
    }

    const candidates = fs.readdirSync(rootDir).filter(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
    if (candidates.length > 0) {
        return JSON.parse(fs.readFileSync(path.join(rootDir, candidates[0]), 'utf8'));
    }

    throw new Error(
        'Thiếu cấu hình Firebase Admin SDK. Hãy đặt biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON trên Vercel hoặc đặt file *firebase-adminsdk*.json ở thư mục gốc.'
    );
}

function getDb() {
    if (cachedDb) return cachedDb;

    if (!getApps().length) {
        const serviceAccount = loadServiceAccount();
        initializeApp({
            credential: cert(serviceAccount)
        });
    }

    cachedDb = getFirestore();
    try {
        cachedDb.settings({ ignoreUndefinedProperties: true });
    } catch (_) {
        // settings() chỉ gọi được 1 lần; bỏ qua nếu warm instance đã gọi trước đó
    }
    return cachedDb;
}

module.exports = { getDb };
