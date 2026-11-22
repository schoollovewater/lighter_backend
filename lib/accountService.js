const crypto = require('crypto');
const { getDb } = require('./firebaseAdmin');

const WOLF_ROLES = ['WEREWOLF', 'HIDDEN_WOLF', 'ENRAGED_WOLF', 'SHAMAN_WOLF', 'ALPHA_WOLF'];

function normalizeUsername(raw) {
    return String(raw || '').trim().toLowerCase();
}

function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 20) {
        throw new Error('Tên đăng nhập phải từ 3 đến 20 ký tự.');
    }
    if (!/^[a-z0-9_.]+$/.test(username)) {
        throw new Error('Tên đăng nhập chỉ gồm chữ thường, số, dấu gạch dưới (_) và dấu chấm (.).');
    }
}

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
}

function defaultStats() {
    return {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winsAsWolf: 0,
        winsAsVillager: 0,
        winsAsThird: 0
    };
}

function defaultInbox(uid) {
    return {
        uid,
        friends: [],
        friendRequestsIn: [],
        friendRequestsOut: [],
        dmConversations: {},
        updatedAt: Date.now()
    };
}

async function getSession(db, token) {
    if (!token || typeof token !== 'string' || token.length < 8) return null;
    const snap = await db.collection('sessions').doc(token).get();
    return snap.exists ? snap.data() : null;
}

async function getSecretByUid(db, uid) {
    const snap = await db.collection('user_secrets').doc(uid).get();
    return snap.exists ? snap.data() : null;
}

async function registerAccount(payload) {
    const db = getDb();
    const username = normalizeUsername(payload.username);
    validateUsername(username);

    const password = String(payload.password || '');
    if (password.length < 4 || password.length > 64) {
        throw new Error('Mật khẩu phải từ 4 đến 64 ký tự.');
    }

    const displayName = String(payload.displayName || username).trim().slice(0, 40);
    if (!displayName) throw new Error('Tên hiển thị không được để trống.');
    const avatar = String(payload.avatar || '😎').slice(0, 8);

    const accRef = db.collection('accounts').doc(username);
    const uid = 'u_' + crypto.randomBytes(6).toString('hex');
    const sessionToken = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const now = Date.now();

    const profile = {
        uid,
        username,
        displayName,
        avatar,
        bio: '',
        online: true,
        lastSeen: now,
        createdAt: now,
        stats: defaultStats()
    };
    const inbox = defaultInbox(uid);

    await db.runTransaction(async (tx) => {
        const accSnap = await tx.get(accRef);
        if (accSnap.exists) {
            throw new Error(`Tài khoản @${username} đã tồn tại. Hãy chọn tên khác hoặc đăng nhập.`);
        }
        tx.set(accRef, {
            uid,
            username,
            passwordHash,
            salt,
            sessionToken,
            createdAt: now
        });
        tx.set(db.collection('sessions').doc(sessionToken), {
            uid,
            username,
            createdAt: now
        });
        tx.set(db.collection('user_secrets').doc(uid), {
            uid,
            username,
            sessionToken
        });
        tx.set(db.collection('user_profiles').doc(uid), profile);
        tx.set(db.collection('user_inbox').doc(sessionToken), inbox);
    });

    return { sessionToken, uid, profile, inbox };
}

async function loginAccount(payload) {
    const db = getDb();
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || '');
    if (!username || !password) {
        throw new Error('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
    }

    const accSnap = await db.collection('accounts').doc(username).get();
    if (!accSnap.exists) {
        throw new Error('Tài khoản không tồn tại.');
    }
    const acc = accSnap.data();
    if (!verifyPassword(password, acc.salt, acc.passwordHash)) {
        throw new Error('Mật khẩu không chính xác.');
    }

    const now = Date.now();
    const profileRef = db.collection('user_profiles').doc(acc.uid);
    const inboxRef = db.collection('user_inbox').doc(acc.sessionToken);

    const [profileSnap, inboxSnap] = await Promise.all([profileRef.get(), inboxRef.get()]);
    let profile = profileSnap.exists ? profileSnap.data() : {
        uid: acc.uid,
        username: acc.username,
        displayName: acc.username,
        avatar: '😎',
        bio: '',
        createdAt: acc.createdAt || now,
        stats: defaultStats()
    };
    profile = {
        ...profile,
        online: true,
        lastSeen: now,
        stats: { ...defaultStats(), ...(profile.stats || {}) }
    };

    const inbox = inboxSnap.exists ? inboxSnap.data() : defaultInbox(acc.uid);

    await Promise.all([
        profileRef.set(profile, { merge: true }),
        inboxSnap.exists ? Promise.resolve() : inboxRef.set(inbox)
    ]);

    return {
        sessionToken: acc.sessionToken,
        uid: acc.uid,
        profile,
        inbox
    };
}

async function restoreSession(token) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) return null;

    const now = Date.now();
    const profileRef = db.collection('user_profiles').doc(session.uid);
    const inboxRef = db.collection('user_inbox').doc(token);
    const [profileSnap, inboxSnap] = await Promise.all([profileRef.get(), inboxRef.get()]);
    if (!profileSnap.exists) return null;

    const profile = {
        ...profileSnap.data(),
        online: true,
        lastSeen: now,
        stats: { ...defaultStats(), ...(profileSnap.data().stats || {}) }
    };
    const inbox = inboxSnap.exists ? inboxSnap.data() : defaultInbox(session.uid);

    await Promise.all([
        profileRef.set({ online: true, lastSeen: now }, { merge: true }),
        inboxSnap.exists ? Promise.resolve() : inboxRef.set(inbox)
    ]);

    return {
        sessionToken: token,
        uid: session.uid,
        profile,
        inbox
    };
}

async function markOffline(token) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) return;
    await db.collection('user_profiles').doc(session.uid).set(
        { online: false, lastSeen: Date.now() },
        { merge: true }
    );
}

async function updateProfile(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const updates = { lastSeen: Date.now() };
    if (payload.displayName !== undefined) {
        const dn = String(payload.displayName || '').trim().slice(0, 40);
        if (!dn) throw new Error('Tên hiển thị không được để trống.');
        updates.displayName = dn;
    }
    if (payload.avatar !== undefined) {
        updates.avatar = String(payload.avatar || '😎').slice(0, 8);
    }
    if (payload.bio !== undefined) {
        updates.bio = String(payload.bio || '').trim().slice(0, 140);
    }

    const profileRef = db.collection('user_profiles').doc(session.uid);
    await profileRef.set(updates, { merge: true });
    const updatedSnap = await profileRef.get();
    return { uid: session.uid, profile: updatedSnap.data() };
}

async function sendFriendRequest(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const peerUid = String(payload.peerUid || '').trim();
    if (!peerUid || peerUid === session.uid) throw new Error('Người dùng không hợp lệ.');

    const peerSecret = await getSecretByUid(db, peerUid);
    if (!peerSecret) throw new Error('Không tìm thấy tài khoản người dùng này.');

    const myInboxRef = db.collection('user_inbox').doc(token);
    const peerInboxRef = db.collection('user_inbox').doc(peerSecret.sessionToken);

    await db.runTransaction(async (tx) => {
        const [mySnap, peerSnap] = await Promise.all([tx.get(myInboxRef), tx.get(peerInboxRef)]);
        const myInbox = mySnap.exists ? mySnap.data() : defaultInbox(session.uid);
        const peerInbox = peerSnap.exists ? peerSnap.data() : defaultInbox(peerUid);

        myInbox.friends = myInbox.friends || [];
        myInbox.friendRequestsIn = myInbox.friendRequestsIn || [];
        myInbox.friendRequestsOut = myInbox.friendRequestsOut || [];
        peerInbox.friends = peerInbox.friends || [];
        peerInbox.friendRequestsIn = peerInbox.friendRequestsIn || [];
        peerInbox.friendRequestsOut = peerInbox.friendRequestsOut || [];

        if (myInbox.friends.includes(peerUid)) return;

        // Nếu đối phương đã gửi lời mời trước → tự động thành bạn bè luôn
        if (myInbox.friendRequestsIn.includes(peerUid)) {
            myInbox.friendRequestsIn = myInbox.friendRequestsIn.filter(id => id !== peerUid);
            peerInbox.friendRequestsOut = peerInbox.friendRequestsOut.filter(id => id !== session.uid);
            if (!myInbox.friends.includes(peerUid)) myInbox.friends.push(peerUid);
            if (!peerInbox.friends.includes(session.uid)) peerInbox.friends.push(session.uid);
        } else {
            if (!myInbox.friendRequestsOut.includes(peerUid)) myInbox.friendRequestsOut.push(peerUid);
            if (!peerInbox.friendRequestsIn.includes(session.uid)) peerInbox.friendRequestsIn.push(session.uid);
        }

        const now = Date.now();
        myInbox.updatedAt = now;
        peerInbox.updatedAt = now;
        tx.set(myInboxRef, myInbox);
        tx.set(peerInboxRef, peerInbox);
    });

    return { ok: true };
}

async function respondFriendRequest(token, payload, accept) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const peerUid = String(payload.peerUid || '').trim();
    if (!peerUid) throw new Error('Thiếu thông tin người dùng.');

    const peerSecret = await getSecretByUid(db, peerUid);
    if (!peerSecret) throw new Error('Không tìm thấy tài khoản người dùng này.');

    const myInboxRef = db.collection('user_inbox').doc(token);
    const peerInboxRef = db.collection('user_inbox').doc(peerSecret.sessionToken);

    await db.runTransaction(async (tx) => {
        const [mySnap, peerSnap] = await Promise.all([tx.get(myInboxRef), tx.get(peerInboxRef)]);
        const myInbox = mySnap.exists ? mySnap.data() : defaultInbox(session.uid);
        const peerInbox = peerSnap.exists ? peerSnap.data() : defaultInbox(peerUid);

        myInbox.friends = myInbox.friends || [];
        myInbox.friendRequestsIn = (myInbox.friendRequestsIn || []).filter(id => id !== peerUid);
        peerInbox.friends = peerInbox.friends || [];
        peerInbox.friendRequestsOut = (peerInbox.friendRequestsOut || []).filter(id => id !== session.uid);

        if (accept) {
            if (!myInbox.friends.includes(peerUid)) myInbox.friends.push(peerUid);
            if (!peerInbox.friends.includes(session.uid)) peerInbox.friends.push(session.uid);
        }

        const now = Date.now();
        myInbox.updatedAt = now;
        peerInbox.updatedAt = now;
        tx.set(myInboxRef, myInbox);
        tx.set(peerInboxRef, peerInbox);
    });

    return { ok: true };
}

async function removeFriend(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const peerUid = String(payload.peerUid || '').trim();
    const peerSecret = await getSecretByUid(db, peerUid);
    if (!peerSecret) throw new Error('Không tìm thấy tài khoản.');

    const myInboxRef = db.collection('user_inbox').doc(token);
    const peerInboxRef = db.collection('user_inbox').doc(peerSecret.sessionToken);

    await db.runTransaction(async (tx) => {
        const [mySnap, peerSnap] = await Promise.all([tx.get(myInboxRef), tx.get(peerInboxRef)]);
        const myInbox = mySnap.exists ? mySnap.data() : defaultInbox(session.uid);
        const peerInbox = peerSnap.exists ? peerSnap.data() : defaultInbox(peerUid);

        myInbox.friends = (myInbox.friends || []).filter(id => id !== peerUid);
        peerInbox.friends = (peerInbox.friends || []).filter(id => id !== session.uid);

        const now = Date.now();
        myInbox.updatedAt = now;
        peerInbox.updatedAt = now;
        tx.set(myInboxRef, myInbox);
        tx.set(peerInboxRef, peerInbox);
    });

    return { ok: true };
}

async function ensureDmRoom(db, myUid, myToken, peerUid) {
    if (!peerUid || peerUid === myUid) throw new Error('Không thể nhắn tin với chính mình.');
    const peerSecret = await getSecretByUid(db, peerUid);
    if (!peerSecret) throw new Error('Không tìm thấy người nhận.');

    const pairKey = [myUid, peerUid].sort().join('__');
    const indexRef = db.collection('dm_index').doc(pairKey);
    const myInboxRef = db.collection('user_inbox').doc(myToken);
    const peerInboxRef = db.collection('user_inbox').doc(peerSecret.sessionToken);

    let dmSecretId = null;

    await db.runTransaction(async (tx) => {
        const [idxSnap, mySnap, peerSnap] = await Promise.all([
            tx.get(indexRef),
            tx.get(myInboxRef),
            tx.get(peerInboxRef)
        ]);
        const now = Date.now();
        if (idxSnap.exists) {
            dmSecretId = idxSnap.data().dmSecretId;
        } else {
            dmSecretId = 'dm_' + crypto.randomUUID().replace(/-/g, '');
            tx.set(indexRef, {
                dmSecretId,
                participants: [myUid, peerUid].sort(),
                createdAt: now
            });
            tx.set(db.collection('dm_threads').doc(dmSecretId), {
                dmSecretId,
                participants: [myUid, peerUid].sort(),
                messages: [],
                updatedAt: now
            });
        }

        const myInbox = mySnap.exists ? mySnap.data() : defaultInbox(myUid);
        const peerInbox = peerSnap.exists ? peerSnap.data() : defaultInbox(peerUid);
        myInbox.dmConversations = myInbox.dmConversations || {};
        peerInbox.dmConversations = peerInbox.dmConversations || {};

        if (!myInbox.dmConversations[peerUid]) {
            myInbox.dmConversations[peerUid] = {
                dmSecretId,
                peerUid,
                lastMessage: '',
                lastSenderId: '',
                lastAt: now,
                unreadCount: 0
            };
            myInbox.updatedAt = now;
            tx.set(myInboxRef, myInbox);
        }
        if (!peerInbox.dmConversations[myUid]) {
            peerInbox.dmConversations[myUid] = {
                dmSecretId,
                peerUid: myUid,
                lastMessage: '',
                lastSenderId: '',
                lastAt: now,
                unreadCount: 0
            };
            peerInbox.updatedAt = now;
            tx.set(peerInboxRef, peerInbox);
        }
    });

    return { dmSecretId, peerToken: peerSecret.sessionToken };
}

async function openDm(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const peerUid = String(payload.peerUid || '').trim();
    const { dmSecretId } = await ensureDmRoom(db, session.uid, token, peerUid);
    await markDmRead(token, { peerUid });
    return { ok: true, dmSecretId, peerUid };
}

async function sendDmMessage(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) throw new Error('Bạn chưa đăng nhập.');

    const peerUid = String(payload.peerUid || '').trim();
    const text = String(payload.text || '').trim().slice(0, 800);
    if (!text) return { ok: true };

    const myProfileSnap = await db.collection('user_profiles').doc(session.uid).get();
    const myProfile = myProfileSnap.exists ? myProfileSnap.data() : { displayName: session.username, avatar: '😎' };

    const { dmSecretId, peerToken } = await ensureDmRoom(db, session.uid, token, peerUid);
    const threadRef = db.collection('dm_threads').doc(dmSecretId);
    const myInboxRef = db.collection('user_inbox').doc(token);
    const peerInboxRef = db.collection('user_inbox').doc(peerToken);

    const now = Date.now();
    const msg = {
        id: 'dm_' + now + '_' + Math.random().toString(36).slice(2, 6),
        senderId: session.uid,
        senderName: myProfile.displayName || session.username,
        senderAvatar: myProfile.avatar || '😎',
        text,
        createdAt: now
    };

    await db.runTransaction(async (tx) => {
        const [threadSnap, mySnap, peerSnap] = await Promise.all([
            tx.get(threadRef),
            tx.get(myInboxRef),
            tx.get(peerInboxRef)
        ]);
        const prevMsgs = threadSnap.exists && Array.isArray(threadSnap.data().messages)
            ? threadSnap.data().messages
            : [];
        const nextMsgs = [...prevMsgs.slice(-199), msg];
        tx.set(threadRef, {
            dmSecretId,
            participants: [session.uid, peerUid].sort(),
            messages: nextMsgs,
            updatedAt: now
        });

        const myInbox = mySnap.exists ? mySnap.data() : defaultInbox(session.uid);
        const peerInbox = peerSnap.exists ? peerSnap.data() : defaultInbox(peerUid);
        myInbox.dmConversations = myInbox.dmConversations || {};
        peerInbox.dmConversations = peerInbox.dmConversations || {};

        myInbox.dmConversations[peerUid] = {
            dmSecretId,
            peerUid,
            lastMessage: text.slice(0, 80),
            lastSenderId: session.uid,
            lastAt: now,
            unreadCount: 0
        };
        const prevUnread = peerInbox.dmConversations[session.uid]?.unreadCount || 0;
        peerInbox.dmConversations[session.uid] = {
            dmSecretId,
            peerUid: session.uid,
            lastMessage: text.slice(0, 80),
            lastSenderId: session.uid,
            lastAt: now,
            unreadCount: prevUnread + 1
        };

        myInbox.updatedAt = now;
        peerInbox.updatedAt = now;
        tx.set(myInboxRef, myInbox);
        tx.set(peerInboxRef, peerInbox);
    });

    return { ok: true, id: msg.id, dmSecretId };
}

async function markDmRead(token, payload) {
    const db = getDb();
    const session = await getSession(db, token);
    if (!session) return { ok: true };

    const peerUid = String(payload.peerUid || '').trim();
    if (!peerUid) return { ok: true };

    const myInboxRef = db.collection('user_inbox').doc(token);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(myInboxRef);
        if (!snap.exists) return;
        const inbox = snap.data();
        if (inbox.dmConversations && inbox.dmConversations[peerUid]) {
            if (inbox.dmConversations[peerUid].unreadCount === 0) return;
            inbox.dmConversations[peerUid].unreadCount = 0;
            inbox.updatedAt = Date.now();
            tx.set(myInboxRef, inbox);
        }
    });

    return { ok: true };
}

async function recordMatchStats(db, gameState) {
    if (!gameState || !Array.isArray(gameState.players) || !gameState.winner) return;
    const winner = gameState.winner;
    const cupidLinks = Array.isArray(gameState.cupidLinks) ? gameState.cupidLinks : [];

    await Promise.all(
        gameState.players.map(async (p) => {
            if (!p || !p.id) return;
            const profileRef = db.collection('user_profiles').doc(p.id);
            try {
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(profileRef);
                    if (!snap.exists) return;
                    const data = snap.data();
                    const stats = { ...defaultStats(), ...(data.stats || {}) };
                    stats.gamesPlayed += 1;

                    const finalRole = p.transformedRole || p.cloneInheritedRole || p.role;
                    const effFaction = p.cloneInheritedFaction || p.originFaction;
                    const isWolf = effFaction === 'Ma_Sói' || WOLF_ROLES.includes(finalRole);
                    const isCupidMember = p.role === 'CUPID' || p.isCupid || cupidLinks.includes(p.id);
                    const isFool = finalRole === 'FOOL';

                    let won = false;
                    if (winner === 'WOLVES' && isWolf) {
                        won = true;
                        stats.winsAsWolf += 1;
                    } else if (winner === 'VILLAGERS' && !isWolf && !isFool) {
                        won = true;
                        stats.winsAsVillager += 1;
                    } else if (winner === 'CUPID' && isCupidMember) {
                        won = true;
                        stats.winsAsThird += 1;
                    } else if (winner === 'FOOL' && isFool) {
                        won = true;
                        stats.winsAsThird += 1;
                    }

                    if (won) stats.wins += 1;
                    else if (winner !== 'DRAW') stats.losses += 1;

                    tx.set(profileRef, { stats }, { merge: true });
                });
            } catch (err) {
                console.error('[recordMatchStats error]', p.id, err.message);
            }
        })
    );
}

module.exports = {
    registerAccount,
    loginAccount,
    restoreSession,
    markOffline,
    updateProfile,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    openDm,
    sendDmMessage,
    markDmRead,
    recordMatchStats
};
