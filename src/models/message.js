// models/message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
    },
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
    status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent",
        required: true,
    },
    deliveredAt: {
        type: Date,
        default: null,
    },
    readAt: {
        type: Date,
        default: null,
    }
}, { timestamps: true });

// Support both sides of the bidirectional conversation lookup, ordered by time.
messageSchema.index({ senderId:  1, receiverId: 1, createdAt: 1 });
messageSchema.index({ receiverId: 1, senderId:  1, createdAt: 1 });

// here we attach userSchema to the Collection of Database
// 's' as postfix in db automatically, user -> users
const messageModel = mongoose.model("message", messageSchema);

module.exports = {messageModel};