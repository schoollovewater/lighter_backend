const crypto = require('crypto');
const { getDb } = require('./firebaseAdmin');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ADMIN_USERNAME = 'school';
const DIRECTORY_DOC_PATH = ['room_directory', 'index'];

function generateInviteCode(len = 6) {
    let out = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
}

function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

async function getSessionOrThrow(db, token) {
    if (!token || typeof token !== 'string' || token.length < 8) {
        throw new Error('Bạn chưa đăng nhập.');
    }
    const snap = await db.collection('sessions').doc(token).get();
    if (!snap.exists) throw new Error('Phiên đăng nhập không hợp lệ.');
    return snap.data();
}

function isAdminSession(session) {
    return Boolean(session && String(session.username || '').toLowerCase() === ADMIN_USERNAME);
}

async function verifyRoomMembership(db, roomId, uid) {
    if (!roomId || typeof roomId !== 'string') {
        throw new Error('Chưa chọn phòng chơi.');
    }
    const snap = await db.collection('rooms').doc(roomId).get();
    if (!snap.exists) throw new Error('Phòng này không tồn tại hoặc đã bị xóa.');
    const room = snap.data();
    if (!Array.isArray(room.members) || !room.members.includes(uid)) {
        throw new Error('Bạn chưa mở khóa phòng này. Hãy nhập mã phòng để vào!');
    }
    return room;
}

function upsertDirectoryEntry(dirData, roomDoc) {
    const list = Array.isArray(dirData?.rooms) ? [...dirData.rooms] : [];
    const entry = {
        roomId: roomDoc.roomId,
        name: roomDoc.name,
        icon: roomDoc.icon || '🐺',
        memberCount: Array.isArray(roomDoc.members) ? roomDoc.members.length : 1,
        createdAt: roomDoc.createdAt || Date.now()
    };
    const idx = list.findIndex(r => r.roomId === roomDoc.roomId);
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    return { rooms: list, updatedAt: Date.now() };
}

async function createRoom(token, payload = {}) {
    const db = getDb();
    const session = await getSessionOrThrow(db, token);

    if (!isAdminSession(session)) {
        throw new Error('Chỉ tài khoản quản trị (@school) mới có quyền tạo phòng mới!');
    }

    const name = String(payload.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Tên phòng không được để trống.');
    const icon = String(payload.icon || '🐺').slice(0, 8);

    const customCode = normalizeCode(payload.customCode || payload.code || '');
    let code = '';
    if (customCode) {
        if (customCode.length < 3 || customCode.length > 16) {
            throw new Error('Mã / mật khẩu phòng phải từ 3 đến 16 ký tự chữ hoặc số.');
        }
        const existing = await db.collection('room_codes').doc(customCode).get();
        if (existing.exists) {
            throw new Error(`Mã phòng "${customCode}" đã được dùng cho phòng khác. Hãy chọn mã khác!`);
        }
        code = customCode;
    } else {
        for (let attempt = 0; attempt < 6; attempt++) {
            const candidate = generateInviteCode(6);
            const existing = await db.collection('room_codes').doc(candidate).get();
            if (!existing.exists) {
                code = candidate;
                break;
            }
        }
    }
    if (!code) throw new Error('Không thể tạo mã phòng, vui lòng thử lại.');

    const roomId = 'rm_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();

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
    const dirRef = db.collection(DIRECTORY_DOC_PATH[0]).doc(DIRECTORY_DOC_PATH[1]);
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const [inboxSnap, dirSnap] = await Promise.all([tx.get(inboxRef), tx.get(dirRef)]);
        const inbox = inboxSnap.exists
            ? inboxSnap.data()
            : { uid: session.uid, friends: [], friendRequestsIn: [], friendRequestsOut: [], dmConversations: {}, rooms: [] };
        const prevRooms = Array.isArray(inbox.rooms) ? inbox.rooms.filter(r => r.roomId !== roomId) : [];
        inbox.rooms = [roomSummary, ...prevRooms];
        inbox.activeRoomId = roomId;
        inbox.updatedAt = now;
        updatedInbox = inbox;

        const nextDir = upsertDirectoryEntry(dirSnap.exists ? dirSnap.data() : {}, roomDoc);

        tx.set(db.collection('rooms').doc(roomId), roomDoc);
        tx.set(db.collection('room_codes').doc(code), { roomId, name, icon, createdAt: now });
        tx.set(dirRef, nextDir);
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
    const expectedRoomId = payload.roomId ? String(payload.roomId).trim() : null;

    if (!code || code.length < 3) {
        throw new Error('Vui lòng nhập mật khẩu / mã phòng hợp lệ.');
    }

    let roomId = expectedRoomId;
    if (!roomId) {
        const codeSnap = await db.collection('room_codes').doc(code).get();
        if (!codeSnap.exists) {
            throw new Error(`Mã phòng "${code}" không chính xác!`);
        }
        roomId = codeSnap.data().roomId;
    }

    const roomRef = db.collection('rooms').doc(roomId);
    const inboxRef = db.collection('user_inbox').doc(token);
    const dirRef = db.collection(DIRECTORY_DOC_PATH[0]).doc(DIRECTORY_DOC_PATH[1]);
    const now = Date.now();
    let finalRoom = null;
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const [roomSnap, inboxSnap, dirSnap] = await Promise.all([
            tx.get(roomRef),
            tx.get(inboxRef),
            tx.get(dirRef)
        ]);
        if (!roomSnap.exists) throw new Error('Phòng này không còn tồn tại.');

        const room = roomSnap.data();
        if (normalizeCode(room.code) !== code) {
            throw new Error('Mật khẩu (Mã phòng) không chính xác!');
        }

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

        const nextDir = upsertDirectoryEntry(dirSnap.exists ? dirSnap.data() : {}, room);

        tx.set(roomRef, room);
        tx.set(inboxRef, inbox);
        tx.set(dirRef, nextDir);
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
    if (!roomId) throw new Error('Thiếu mã phòng.');

    const roomRef = db.collection('rooms').doc(roomId);
    const inboxRef = db.collection('user_inbox').doc(token);
    const dirRef = db.collection(DIRECTORY_DOC_PATH[0]).doc(DIRECTORY_DOC_PATH[1]);
    const now = Date.now();
    let updatedInbox = null;

    await db.runTransaction(async (tx) => {
        const [roomSnap, inboxSnap, dirSnap] = await Promise.all([
            tx.get(roomRef),
            tx.get(inboxRef),
            tx.get(dirRef)
        ]);
        if (roomSnap.exists) {
            const room = roomSnap.data();
            room.members = (room.members || []).filter(uid => uid !== session.uid);
            if (room.ownerUid === session.uid && room.members.length > 0) {
                room.ownerUid = room.members[0];
            }
            room.updatedAt = now;
            tx.set(roomRef, room);
            tx.set(dirRef, upsertDirectoryEntry(dirSnap.exists ? dirSnap.data() : {}, room));
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
