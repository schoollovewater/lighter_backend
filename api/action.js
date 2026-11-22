const { executeAction } = require('../lib/gameEngine');
const { getDb } = require('../lib/firebaseAdmin');
const accountService = require('../lib/accountService');
const roomService = require('../lib/roomService');

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

async function joinRoomHubSafe(token, profile, roomId) {
    if (!roomId || !profile) return {};
    try {
        return await executeAction(
            token,
            'join_hub',
            {
                uid: profile.uid,
                username: profile.username,
                name: profile.displayName,
                avatar: profile.avatar
            },
            roomId
        );
    } catch (_) {
        return {};
    }
}

async function tryAutoJoinCodeOnAuth(token, joinCode) {
    const cleanCode = String(joinCode || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) return null;
    try {
        return await roomService.joinRoomByCode(token, { code: cleanCode });
    } catch (_) {
        return null;
    }
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
                mode: 'vercel-firestore-multiroom',
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
        const roomId = body.roomId || payload.roomId || null;

        // --- LUỒNG TÀI KHOẢN & MESSENGER (HỖ TRỢ TỰ VÀO PHÒNG KHI CÓ joinCode) ---
        if (action === 'register') {
            const acc = await accountService.registerAccount(payload);
            const joined = await tryAutoJoinCodeOnAuth(acc.sessionToken, payload.joinCode);
            const finalInbox = joined?.inbox || acc.inbox;
            const activeRoomId = joined?.roomId || null;
            const hubRes = activeRoomId ? await joinRoomHubSafe(acc.sessionToken, acc.profile, activeRoomId) : {};
            return res.status(200).json({
                ...hubRes,
                ok: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: finalInbox,
                room: joined?.room || null,
                activeRoomId
            });
        }

        if (action === 'login') {
            const acc = await accountService.loginAccount(payload);
            const joined = await tryAutoJoinCodeOnAuth(acc.sessionToken, payload.joinCode);
            const finalInbox = joined?.inbox || acc.inbox;
            const activeRoomId = joined?.roomId || finalInbox?.activeRoomId || finalInbox?.rooms?.[0]?.roomId || null;
            const hubRes = activeRoomId ? await joinRoomHubSafe(acc.sessionToken, acc.profile, activeRoomId) : {};
            return res.status(200).json({
                ...hubRes,
                ok: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: finalInbox,
                room: joined?.room || null,
                activeRoomId
            });
        }

        if (action === 'restore_session') {
            const acc = await accountService.restoreSession(token);
            if (!acc) {
                return res.status(200).json({ ok: false, authenticated: false, error: 'Phiên đăng nhập không hợp lệ.' });
            }
            const joined = await tryAutoJoinCodeOnAuth(acc.sessionToken, payload.joinCode);
            const finalInbox = joined?.inbox || acc.inbox;
            const activeRoomId = joined?.roomId || finalInbox?.activeRoomId || finalInbox?.rooms?.[0]?.roomId || null;
            const hubRes = activeRoomId ? await joinRoomHubSafe(acc.sessionToken, acc.profile, activeRoomId) : {};
            return res.status(200).json({
                ...hubRes,
                ok: true,
                authenticated: true,
                sessionToken: acc.sessionToken,
                myId: acc.uid,
                profile: acc.profile,
                inbox: finalInbox,
                room: joined?.room || null,
                activeRoomId
            });
        }

        if (action === 'logout') {
            await accountService.markOffline(token);
            if (roomId) {
                try { await executeAction(token, 'leave_hub', {}, roomId); } catch (_) {}
            }
            return res.status(200).json({ ok: true });
        }

        if (action === 'update_profile') {
            const updated = await accountService.updateProfile(token, payload);
            const hubRes = roomId ? await joinRoomHubSafe(token, updated.profile, roomId) : {};
            return res.status(200).json({ ...hubRes, ok: true, profile: updated.profile });
        }

        // --- LUỒNG QUẢN LÝ NHÓM ĐỘC LẬP (MULTI-GROUP) ---
        if (action === 'create_room') {
            const created = await roomService.createRoom(token, payload);
            const acc = await accountService.restoreSession(token);
            const hubRes = await joinRoomHubSafe(token, acc?.profile, created.roomId);
            return res.status(200).json({
                ...hubRes,
                ok: true,
                room: created.room,
                roomId: created.roomId,
                activeRoomId: created.roomId,
                inbox: created.inbox
            });
        }

        if (action === 'join_room_by_code') {
            const joined = await roomService.joinRoomByCode(token, payload);
            const acc = await accountService.restoreSession(token);
            const hubRes = await joinRoomHubSafe(token, acc?.profile, joined.roomId);
            return res.status(200).json({
                ...hubRes,
                ok: true,
                room: joined.room,
                roomId: joined.roomId,
                activeRoomId: joined.roomId,
                inbox: joined.inbox
            });
        }

        if (action === 'switch_room') {
            const prevRoomId = payload.prevRoomId || roomId;
            const targetRoomId = payload.targetRoomId || payload.roomId;
            if (prevRoomId && prevRoomId !== targetRoomId) {
                try { await executeAction(token, 'leave_hub', {}, prevRoomId); } catch (_) {}
            }
            const switched = await roomService.switchRoom(token, { roomId: targetRoomId });
            const acc = await accountService.restoreSession(token);
            const hubRes = await joinRoomHubSafe(token, acc?.profile, switched.roomId);
            return res.status(200).json({
                ...hubRes,
                ok: true,
                room: switched.room,
                roomId: switched.roomId,
                activeRoomId: switched.roomId,
                inbox: switched.inbox
            });
        }

        if (action === 'leave_room') {
            const targetRoomId = payload.roomId || roomId;
            if (targetRoomId) {
                try { await executeAction(token, 'leave_hub', {}, targetRoomId); } catch (_) {}
            }
            const left = await roomService.leaveRoom(token, { roomId: targetRoomId });
            let hubRes = {};
            if (left.nextRoomId) {
                const acc = await accountService.restoreSession(token);
                hubRes = await joinRoomHubSafe(token, acc?.profile, left.nextRoomId);
            }
            return res.status(200).json({
                ...hubRes,
                ok: true,
                inbox: left.inbox,
                activeRoomId: left.nextRoomId
            });
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

        // --- LUỒNG GAME & HUB THEO NHÓM (ROOM-SCOPED) ---
        const result = await executeAction(token, action, payload, roomId);
        return res.status(200).json(result);
    } catch (err) {
        console.error('[API /api/action error]', err);
        return res.status(400).json({ ok: false, error: err.message || 'Lỗi xử lý yêu cầu' });
    }
};
