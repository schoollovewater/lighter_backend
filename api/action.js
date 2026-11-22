const { executeAction } = require('../lib/gameEngine');
const { getDb } = require('../lib/firebaseAdmin');
const accountService = require('../lib/accountService');

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
        const { token, action } = body;
        const payload = body.payload || {};

        // --- LUỒNG TÀI KHOẢN & MESSENGER ---
        if (action === 'register') {
            const acc = await accountService.registerAccount(payload);
            const hubRes = await executeAction(acc.sessionToken, 'join_hub', {
                uid: acc.uid,
                username: acc.profile.username,
                name: acc.profile.displayName,
                avatar: acc.profile.avatar
            });
            return res.status(200).json({
                ...hubRes,
                ok: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: acc.inbox
            });
        }

        if (action === 'login') {
            const acc = await accountService.loginAccount(payload);
            const hubRes = await executeAction(acc.sessionToken, 'join_hub', {
                uid: acc.uid,
                username: acc.profile.username,
                name: acc.profile.displayName,
                avatar: acc.profile.avatar
            });
            return res.status(200).json({
                ...hubRes,
                ok: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: acc.inbox
            });
        }

        if (action === 'restore_session') {
            const acc = await accountService.restoreSession(token);
            if (!acc) {
                return res.status(200).json({ ok: false, authenticated: false, error: 'Phiên đăng nhập không hợp lệ.' });
            }
            const hubRes = await executeAction(acc.sessionToken, 'join_hub', {
                uid: acc.uid,
                username: acc.profile.username,
                name: acc.profile.displayName,
                avatar: acc.profile.avatar
            });
            return res.status(200).json({
                ...hubRes,
                ok: true,
                authenticated: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: acc.inbox
            });
        }

        if (action === 'logout') {
            await accountService.markOffline(token);
            try {
                await executeAction(token, 'leave_hub', {});
            } catch (_) {
                // Bỏ qua nếu đã rời sảnh trước đó
            }
            return res.status(200).json({ ok: true });
        }

        if (action === 'update_profile') {
            const updated = await accountService.updateProfile(token, payload);
            let hubRes = {};
            try {
                hubRes = await executeAction(token, 'join_hub', {
                    uid: updated.uid,
                    username: updated.profile.username,
                    name: updated.profile.displayName,
                    avatar: updated.profile.avatar
                });
            } catch (_) {}
            return res.status(200).json({ ...hubRes, ok: true, profile: updated.profile });
        }

        if (action === 'send_friend_request') {
            return res.status(200).json(await accountService.sendFriendRequest(token, payload));
        }
        if (action === 'accept_friend_request') {
            return res.status(200).json(await accountService.respondFriendRequest(token, payload, true));
        }
        if (action === 'decline_friend_request') {
            return res.status(200).json(await accountService.respondFriendRequest(token, payload, false));
        }
        if (action === 'remove_friend') {
            return res.status(200).json(await accountService.removeFriend(token, payload));
        }
        if (action === 'open_dm') {
            return res.status(200).json(await accountService.openDm(token, payload));
        }
        if (action === 'send_dm_message') {
            return res.status(200).json(await accountService.sendDmMessage(token, payload));
        }
        if (action === 'mark_dm_read') {
            return res.status(200).json(await accountService.markDmRead(token, payload));
        }

        // --- LUỒNG GAME & HUB CŨ ---
        const result = await executeAction(token, action, payload);
        return res.status(200).json(result);
    } catch (err) {
        console.error('[API /api/action error]', err);
        return res.status(400).json({ ok: false, error: err.message || 'Lỗi xử lý yêu cầu' });
    }
};
