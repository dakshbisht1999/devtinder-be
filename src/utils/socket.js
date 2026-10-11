const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { getCurrentWeekIdentifier } = require("./weekIdentifier");
const { messageModel } = require("../models/message");
const { UserModel } = require("../models/user");
const { connectionRequestModel } = require("../models/connectionRequest");
const { conversationRoomId, userRoomId } = require("./socketRooms");

const parseCookies = (cookieHeader = "") => {
    return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
        const separator = pair.indexOf("=");
        if (separator !== -1) {
            cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
        }
        return cookies;
    }, {});
};

const isValidUserId = (id) => mongoose.Types.ObjectId.isValid(String(id));

const initializeSocket = (server) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    const io = new Server(server, {
        path: "/api/socket",
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                return callback(new Error("Not allowed by CORS"));
            },
            credentials: true
        }
    });

    io.use(async (socket, next) => {
        try {
            const cookies = parseCookies(socket.handshake.headers.cookie || "");
            const authorization = socket.handshake.headers.authorization || "";
            const token = socket.handshake.auth?.token ||
                (authorization.startsWith("Bearer ") ? authorization.slice(7) : null) ||
                cookies.token;

            if (!token) return next(new Error("Authentication error: No token"));

            const decoded = jwt.verify(token, process.env.DEVTINDER_JWT_SECRET_KEY);
            const user = await UserModel.findById(decoded._id).select("_id tokenVersion");
            if (!user || decoded.tokenVersion !== user.tokenVersion) {
                return next(new Error("Authentication error: Invalid or expired session"));
            }

            socket.userId = user._id.toString();
            return next();
        } catch (error) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    const canAccessConversation = async (firstUserId, secondUserId) => {
        if (!isValidUserId(firstUserId) || !isValidUserId(secondUserId) ||
            String(firstUserId) === String(secondUserId)) return false;

        const [existingMessage, acceptedRequest] = await Promise.all([
            messageModel.exists({
                $or: [
                    { senderId: firstUserId, receiverId: secondUserId },
                    { senderId: secondUserId, receiverId: firstUserId }
                ]
            }),
            connectionRequestModel.exists({
                status: "accepted",
                $or: [
                    { fromUserId: firstUserId, toUserId: secondUserId },
                    { fromUserId: secondUserId, toUserId: firstUserId }
                ]
            })
        ]);
        return Boolean(existingMessage || acceptedRequest);
    };

    const joinConversationParticipants = async (firstUserId, secondUserId, roomId) => {
        await Promise.all([
            io.in(userRoomId(firstUserId)).socketsJoin(roomId),
            io.in(userRoomId(secondUserId)).socketsJoin(roomId)
        ]);
    };

    const emitReceipt = (roomId, messageIds, status, timestamp) => {
        if (messageIds.length === 0) return;
        io.to(roomId).emit("messageStatusUpdated", {
            messageIds: messageIds.map(String),
            status,
            ...(status === "delivered" ? { deliveredAt: timestamp } : { readAt: timestamp })
        });
    };

    const markIncomingDelivered = async (userId, otherUserId, roomId) => {
        const pending = await messageModel.find({
            senderId: otherUserId,
            receiverId: userId,
            status: "sent"
        }).select("_id");
        if (pending.length === 0) return;

        const deliveredAt = new Date();
        const messageIds = pending.map(({ _id }) => _id);
        await messageModel.updateMany(
            { _id: { $in: messageIds }, status: "sent" },
            { $set: { status: "delivered", deliveredAt } }
        );
        emitReceipt(roomId, messageIds, "delivered", deliveredAt);
    };

    io.on("connection", (socket) => {
        const userId = socket.userId;
        const inboxRoom = userRoomId(userId);
        socket.join(inboxRoom);

        socket.on("joinConversation", async ({ otherUserId } = {}) => {
            try {
                if (!await canAccessConversation(userId, otherUserId)) {
                    return socket.emit("chatError", { message: "Conversation not found or access denied" });
                }
                const roomId = conversationRoomId(userId, otherUserId);
                await joinConversationParticipants(userId, otherUserId, roomId);
                await markIncomingDelivered(userId, otherUserId, roomId);
                socket.emit("conversationJoined", { otherUserId: String(otherUserId) });
            } catch (error) {
                console.error("Socket joinConversation error:", error);
                socket.emit("chatError", { message: "Unable to join conversation" });
            }
        });

        socket.on("sendMessage", async ({ receiverId, text } = {}) => {
            try {
                if (!isValidUserId(receiverId) || String(receiverId) === userId) {
                    return socket.emit("chatError", { message: "A valid recipient is required" });
                }
                if (typeof text !== "string" || !text.trim() || text.trim().length > 5000) {
                    return socket.emit("chatError", { message: "Message must be between 1 and 5000 characters" });
                }

                const receiver = await UserModel.findById(receiverId).select("_id");
                if (!receiver) return socket.emit("chatError", { message: "Recipient not found" });

                // Check if the current sender have ever sent a message to this person before
                const haveISentMessageBefore = await messageModel.findOne({
                    senderId: socket.userId,
                    receiverId: receiverId // Ensure parameter matches your payload
                });
                
                // THE LIMIT LOGIC (Only runs if this is a brand new conversation)
                if (!haveISentMessageBefore) {
                    const sender = await UserModel.findById(userId);
                    if (!sender) return socket.emit("chatError", { message: "User not found" });

                    if (!sender.isPremium) {
                        const currentWeek = getCurrentWeekIdentifier();

                        // Reset week if it's a new week
                        if (sender.lastFreeChatWeek !== currentWeek) {
                            sender.freeChatsUsed = 0;
                            sender.lastFreeChatWeek = currentWeek;
                        }

                        // Check if limit is hit
                        if (sender.freeChatsUsed >= 3) {
                            return socket.emit("chatLimitExhausted", {
                                message: "You've reached your limit of 3 new conversations this week!"
                            });
                        }

                        // Deduct limit and save user
                        sender.freeChatsUsed += 1;
                        await sender.save();
                    }
                }

                const message = await messageModel.create({
                    senderId: userId,
                    receiverId,
                    text: text.trim(),
                    status: "sent"
                });
                const roomId = conversationRoomId(userId, receiverId);
                await joinConversationParticipants(userId, receiverId, roomId);

                const receiverSockets = await io.in(userRoomId(receiverId)).fetchSockets();
                if (receiverSockets.length > 0) {
                    message.status = "delivered";
                    message.deliveredAt = new Date();
                    await message.save();
                }

                io.to(roomId).emit("receiveMessage", message);
                if (message.status === "delivered") {
                    emitReceipt(roomId, [message._id], "delivered", message.deliveredAt);
                }
            } catch (error) {
                console.error("Socket send message error:", error);
                socket.emit("chatError", { message: "Failed to send message" });
            }
        });

        socket.on("markMessagesAsRead", async ({ otherUserId, messageIds } = {}) => {
            try {
                if (!await canAccessConversation(userId, otherUserId)) {
                    return socket.emit("chatError", { message: "Conversation not found or access denied" });
                }
                const roomId = conversationRoomId(userId, otherUserId);
                await joinConversationParticipants(userId, otherUserId, roomId);
                await markIncomingDelivered(userId, otherUserId, roomId);

                const filter = {
                    senderId: otherUserId,
                    receiverId: userId,
                    status: { $ne: "read" }
                };
                if (Array.isArray(messageIds) && messageIds.length > 0) {
                    const validMessageIds = messageIds.filter(isValidUserId);
                    if (validMessageIds.length === 0) {
                        return socket.emit("chatError", { message: "No valid message IDs provided" });
                    }
                    filter._id = { $in: validMessageIds };
                }

                const unread = await messageModel.find(filter).select("_id");
                if (unread.length === 0) return;

                const readAt = new Date();
                const ids = unread.map(({ _id }) => _id);
                await messageModel.updateMany(
                    { _id: { $in: ids }, status: { $ne: "read" } },
                    { $set: { status: "read", readAt } }
                );
                emitReceipt(roomId, ids, "read", readAt);
            } catch (error) {
                console.error("Socket markMessagesAsRead error:", error);
                socket.emit("chatError", { message: "Failed to update read status" });
            }
        });

        const relayTyping = async (eventName, payload = {}) => {
            try {
                const { otherUserId } = payload;
                if (!await canAccessConversation(userId, otherUserId)) return;
                const roomId = conversationRoomId(userId, otherUserId);
                await joinConversationParticipants(userId, otherUserId, roomId);
                socket.to(roomId).emit(eventName, {
                    userId,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error(`${eventName} socket error:`, error);
            }
        };

        socket.on("typing", (payload) => relayTyping("typing", payload));
        socket.on("stopTyping", (payload) => relayTyping("stopTyping", payload));
    });

    return io;
};

module.exports = { initializeSocket };