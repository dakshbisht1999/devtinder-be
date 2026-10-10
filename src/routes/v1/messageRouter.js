// routes/messageRouter.js
const express = require("express");
const messageRouter = express.Router();
const {messageModel} = require("../../models/message");

messageRouter.get("/fetch/:receiverId", async (req, res) => {
    try {
        const senderId = req.user._id; // Logged-in user ki ID middleware se aayegi
        const receiverId = req.params.receiverId; // URL parameter se aayegi

        // Database Query: Un saare messages ko dhoondo jahan:
        // (A ne B ko bheja) YA (B ne A ko bheja)
        const chatHistory = await messageModel.find({
            $or: [
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        }).sort({ createdAt: 1 }); // 1 ka matlab Ascending order (Oldest message upar, Newest neeche)

        // The Standard JSend Format you prefer!
        res.status(200).json({
            message: "Chat history fetched successfully",
            data: chatHistory
        });

    } catch (error) {
        console.error("Error fetching chat history:", error);
        res.status(500).json({ 
            message: "Internal Server Error while fetching chats" 
        });
    }
});

module.exports = messageRouter;