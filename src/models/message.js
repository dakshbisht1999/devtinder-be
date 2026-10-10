// models/message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    text: {
        type: String,
        required: true,
    }
}, { timestamps: true });

// here we attach userSchema to the Collection of Database
// 's' as postfix in db automatically, user -> users
const messageModel = mongoose.model("message", messageSchema);

module.exports = {messageModel};