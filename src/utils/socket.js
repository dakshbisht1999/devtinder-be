const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getCurrentWeekIdentifier } = require("./weekIdentifier");
const { messageModel } = require("../models/message");
const { UserModel } = require("../models/user");

const parseCookies = (cookieHeader = "") => {
    return cookieHeader
        .split(";")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const index = part.indexOf("=");
            if (index === -1) return acc;
            const key = part.slice(0, index).trim();
            const value = part.slice(index + 1).trim();
            acc[key] = value;
            return acc;
        }, {});
};

const initializeSocket = (server) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    // Initialize Socket.io with CORS matching your Axios setup
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

    // Secure the Socket Connection (Authentication Middleware)
    io.use((socket, next) => {
        try {
            // console.log("1. Socket trying to connect...");

            const cookieHeader = socket.handshake.headers.cookie;
            // console.log("2. Cookie Header:", cookieHeader);

            const cookies = parseCookies(cookieHeader || "");
            const token = socket.handshake.auth?.token ||
                (socket.handshake.headers.authorization && socket.handshake.headers.authorization.startsWith("Bearer ")
                    ? socket.handshake.headers.authorization.split(" ")[1]
                    : null) ||
                cookies.token;

            if (!token) {
                // console.log("🚨 BLOCKING: No token found in cookies");
                return next(new Error("Authentication error: No token"));
            }

            // Verify the JWT token
            const decoded = jwt.verify(token, process.env.DEVTINDER_JWT_SECRET_KEY);
            socket.userId = decoded._id; // Attach userId to the socket for later use
            // console.log("3. Socket Auth Success for User:", socket.userId);
            next();
        } catch (err) {
            // console.log("🚨 BLOCKING: Token verification failed", err.message);
            next(new Error("Authentication error: Invalid token"));
        }
    });

    // Handle Connections
    io.on("connection", (socket) => {
        const userId = socket.userId;
        // console.log(`User connected: ${userId}`);

        // Join a "Private Room" using the user's ID so others can send messages directly to them
        socket.join(userId.toString());

        // Listen for new messages from the React frontend
        socket.on("sendMessage", async ({ receiverId, text }) => {
            try {
                // 1. CONVERSATION UNLOCK CHECK
                // Did these two users ever talk before?
                const existingConversation = await messageModel.findOne({
                    $or: [
                        { senderId: userId, receiverId: receiverId },
                        { senderId: receiverId, receiverId: userId }
                    ]
                });

                // If no previous message exists, this is an UNLOCK attempt
                if (!existingConversation) {
                    const user = await UserModel.findById(userId);

                    if (!user.isPremium) {
                        const currentWeek = getCurrentWeekIdentifier();

                        // 2. THE LAZY EVALUATION (Reset limit if it's a new week)
                        if (user.lastFreeChatWeek !== currentWeek) {
                            user.freeChatsUsed = 0;
                            user.lastFreeChatWeek = currentWeek;
                        }

                        // 3. CHECK THE LIMIT
                        if (user.freeChatsUsed >= 3) {
                            // Block the message! Tell frontend to show the "Premium Coming Soon" banner
                            return socket.emit("chatLimitExhausted", {
                                message: "You've reached your limit of 3 new conversations this week!"
                            });
                        }

                        // 4. DEDUCT LIMIT (Increment usage)
                        user.freeChatsUsed += 1;
                        await user.save();
                    } else {
                        // PREP FOR PHASE 2 (Premium User Logic)
                        // If chatCredits > 0 -> deduct credit. Else -> emit exhaust event.
                        console.log('testing')
                    }
                }

                // 5. SAVE THE MESSAGE TO DATABASE
                const newMessage = new messageModel({
                    senderId: userId,
                    receiverId: receiverId,
                    text: text
                });
                await newMessage.save();

                // 6. DELIVER THE MESSAGE IN REAL-TIME
                // Send to the receiver's private room
                io.to(receiverId.toString()).emit("receiveMessage", newMessage);
                
                // Send back to the sender so their UI updates immediately
                socket.emit("receiveMessage", newMessage);

            } catch (error) {
                console.error("Socket send message error:", error);
                socket.emit("error", { message: "Failed to send message" });
            }
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${userId}`);
        });
    });
}

module.exports = {initializeSocket};