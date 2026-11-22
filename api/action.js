const { executeAction } = require('../lib/gameEngine');
const { getDb } = require('../lib/firebaseAdmin');

function parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.trim()) {
        try {
            return JSON.parse(req.body);
        } catch (_) {
            return {};
        }
    }
    return {};
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        try {
            const db = getDb();
            return res.status(200).json({
                ok: true,
                app: 'SCHOOL UNIVERSE',
                mode: 'vercel-firestore',
                projectId: db.projectId || 'schooluniverse-4cde5'
            });
        } catch (err) {
            return res.status(500).json({ ok: false, error: err.message });
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    try {
        const body = parseBody(req);
        const { token, action, payload } = body;
        const result = await executeAction(token, action, payload || {});
        return res.status(200).json(result);
    } catch (err) {
        console.error('[API /api/action error]', err);
        return res.status(400).json({ ok: false, error: err.message || 'Lỗi xử lý yêu cầu' });
    }
};
