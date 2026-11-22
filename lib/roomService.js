const crypto = require('crypto');
const { getDb } = require('./firebaseAdmin');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(len = 6) {
    let out = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
}

function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

async function getSessionOrThrow(db, token) {
    if (!token || typeof token !== 'string' || token.length < 8) {
        throw new Error('Bạn chưa đăng nhập.');
    }
    const snap = await db.collection('sessions').doc(token).get();
    if (!snap.exists) throw new Error('Phiên đăng nhập không hợp lệ.');
    return snap.data();
}

async function verifyRoomMembership(db, roomId, uid) {
    if (!roomId || typeof roomId !== 'string') {
        throw new Error('Chưa chọn nhóm chơi.');
    }
    const snap = await db.collection('rooms').doc(roomId).get();
    if (!snap.exists) throw new Error('Nhóm này không tồn tại hoặc đã bị xóa.');
    const room = snap.data();
    if (!Array.isArray(room.members) || !room.members.includes(uid)) {
        throw new Error('Bạn không phải thành viên của nhóm này.');
    }
    return room;
}

async function createRoom(token, payload = {}) {
    const db = getDb();
    const session = await getSessionOrThrow(db, token);

    const name = String(payload.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Tên nhóm không được để trống.');
    const icon = String(payload.icon || '🐺').slice(0, 8);

    const roomId = 'rm_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();

    let code = '';
    for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = generateInviteCode(6);
        const existing = await db.collection('room_codes').doc(candidate).get();
        if (!existing.exists) {
            code = candidate;
            break;
        }
    }
    if (!code) throw new Error('Không thể tạo mã mời, vui lòng thử lại.');

    const roomDoc = {
        roomId,
        name,
        icon,
        code,
        ownerUid: session.uid,
        members: [session.uid],
        createdAt: now,
        updatedAt: now
    };

    const roomSummary = {
        roomId,
        name,
        icon,
        code,
        isOwner: true,
        joinedAt: now
    };

    const inboxRef = db.collection('user_inbox').doc(token);
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const inboxSnap = await tx.get(inboxRef);
        const inbox = inboxSnap.exists
            ? inboxSnap.data()
            : { uid: session.uid, friends: [], friendRequestsIn: [], friendRequestsOut: [], dmConversations: {}, rooms: [] };
        const prevRooms = Array.isArray(inbox.rooms) ? inbox.rooms.filter(r => r.roomId !== roomId) : [];
        inbox.rooms = [roomSummary, ...prevRooms];
        inbox.activeRoomId = roomId;
        inbox.updatedAt = now;
        updatedInbox = inbox;

        tx.set(db.collection('rooms').doc(roomId), roomDoc);
        tx.set(db.collection('room_codes').doc(code), { roomId, name, icon, createdAt: now });
        tx.set(db.collection('room_hubs').doc(roomId), {
            roomId,
            users: [],
            garticState: { status: 'WAITING', mode: 'NORMAL', currentRound: 1, totalRounds: 0, books: {} },
            updatedAt: now
        });
        tx.set(db.collection('room_chats').doc(roomId), { roomId, messages: [], updatedAt: now });
        tx.set(db.collection('room_histories').doc(roomId), { roomId, matches: [], updatedAt: now });
        tx.set(inboxRef, inbox);
    });

    return { ok: true, room: roomDoc, roomId, inbox: updatedInbox };
}

async function joinRoomByCode(token, payload = {}) {
    const db = getDb();
    const session = await getSessionOrThrow(db, token);

    const code = normalizeCode(payload.code);
    if (!code || code.length < 4) {
        throw new Error('Mã mời nhóm không hợp lệ.');
    }

    const codeSnap = await db.collection('room_codes').doc(code).get();
    if (!codeSnap.exists) {
        throw new Error(`Không tìm thấy nhóm nào với mã "${code}". Hãy kiểm tra lại mã mời!`);
    }
    const { roomId } = codeSnap.data();

    const roomRef = db.collection('rooms').doc(roomId);
    const inboxRef = db.collection('user_inbox').doc(token);
    const now = Date.now();
    let finalRoom = null;
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const [roomSnap, inboxSnap] = await Promise.all([tx.get(roomRef), tx.get(inboxRef)]);
        if (!roomSnap.exists) throw new Error('Nhóm này không còn tồn tại.');

        const room = roomSnap.data();
        const members = Array.isArray(room.members) ? [...room.members] : [];
        if (!members.includes(session.uid)) {
            members.push(session.uid);
        }
        room.members = members;
        room.updatedAt = now;
        finalRoom = room;

        const inbox = inboxSnap.exists
            ? inboxSnap.data()
            : { uid: session.uid, friends: [], friendRequestsIn: [], friendRequestsOut: [], dmConversations: {}, rooms: [] };
        const prevRooms = Array.isArray(inbox.rooms) ? inbox.rooms.filter(r => r.roomId !== roomId) : [];
        inbox.rooms = [
            {
                roomId: room.roomId,
                name: room.name,
                icon: room.icon || '🐺',
                code: room.code,
                isOwner: room.ownerUid === session.uid,
                joinedAt: now
            },
            ...prevRooms
        ];
        inbox.activeRoomId = roomId;
        inbox.updatedAt = now;
        updatedInbox = inbox;

        tx.set(roomRef, room);
        tx.set(inboxRef, inbox);
    });

    return { ok: true, room: finalRoom, roomId, inbox: updatedInbox };
}

async function switchRoom(token, payload = {}) {
    const db = getDb();
    const session = await getSessionOrThrow(db, token);
    const roomId = String(payload.roomId || '').trim();
    const room = await verifyRoomMembership(db, roomId, session.uid);

    const inboxRef = db.collection('user_inbox').doc(token);
    const now = Date.now();
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(inboxRef);
        const inbox = snap.exists ? snap.data() : { uid: session.uid, rooms: [] };
        inbox.activeRoomId = roomId;
        inbox.updatedAt = now;
        updatedInbox = inbox;
        tx.set(inboxRef, inbox);
    });

    return { ok: true, room, roomId, inbox: updatedInbox };
}

async function leaveRoom(token, payload = {}) {
    const db = getDb();
    const session = await getSessionOrThrow(db, token);
    const roomId = String(payload.roomId || '').trim();
    if (!roomId) throw new Error('Thiếu mã nhóm.');

    const roomRef = db.collection('rooms').doc(roomId);
    const inboxRef = db.collection('user_inbox').doc(token);
    const now = Date.now();
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const [roomSnap, inboxSnap] = await Promise.all([tx.get(roomRef), tx.get(inboxRef)]);
        if (roomSnap.exists) {
            const room = roomSnap.data();
            room.members = (room.members || []).filter(uid => uid !== session.uid);
            if (room.ownerUid === session.uid && room.members.length > 0) {
                room.ownerUid = room.members[0];
            }
            room.updatedAt = now;
            tx.set(roomRef, room);
        }

        const inbox = inboxSnap.exists ? inboxSnap.data() : { uid: session.uid, rooms: [] };
        inbox.rooms = (inbox.rooms || []).filter(r => r.roomId !== roomId);
        if (inbox.activeRoomId === roomId) {
            inbox.activeRoomId = inbox.rooms[0]?.roomId || null;
        }
        inbox.updatedAt = now;
        updatedInbox = inbox;
        tx.set(inboxRef, inbox);
    });

    return { ok: true, inbox: updatedInbox, nextRoomId: updatedInbox.activeRoomId };
}

module.exports = {
    createRoom,
    joinRoomByCode,
    switchRoom,
    leaveRoom,
    verifyRoomMembership
};
