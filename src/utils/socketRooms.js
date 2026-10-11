const crypto = require("crypto");

const getRoomSecret = () => {
    const secret = process.env.SOCKET_ROOM_SECRET || process.env.DEVTINDER_JWT_SECRET_KEY;
    if (!secret) {
        throw new Error("SOCKET_ROOM_SECRET or DEVTINDER_JWT_SECRET_KEY must be configured");
    }
    return secret;
};

const signRoomName = (payload) => crypto
    .createHmac("sha256", getRoomSecret())
    .update(payload)
    .digest("hex");

const conversationRoomId = (firstUserId, secondUserId) => {
    const participants = [String(firstUserId), String(secondUserId)].sort();
    if (!participants[0] || !participants[1] || participants[0] === participants[1]) {
        throw new TypeError("A conversation room requires two different user IDs");
    }
    return `conversation:${signRoomName(`${participants[0]}:${participants[1]}`)}`;
};

const userRoomId = (userId) => {
    if (!userId) throw new TypeError("A user room requires a user ID");
    return `user:${signRoomName(String(userId))}`;
};

module.exports = { conversationRoomId, userRoomId };
