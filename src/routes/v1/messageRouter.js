// routes/messageRouter.js
const express = require("express");
const messageRouter = express.Router();
const {messageModel} = require("../../models/message");

messageRouter.get("/conversations", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const conversations = await messageModel.aggregate([
            {
                $match: {
                    $or: [{ senderId: userId }, { receiverId: userId }]
                }
            },
            { $sort: { createdAt: -1, _id: -1 } },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"]
                    }
                }
            },
            {
                $group: {
                    _id: "$otherUserId",
                    lastMessage: { $first: "$$ROOT" },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$receiverId", userId] },
                                        { $ne: ["$status", "read"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "otherUser"
                }
            },
            { $unwind: "$otherUser" },
            {
                $project: {
                    _id: 0,
                    user: {
                        _id: "$otherUser._id",
                        firstName: "$otherUser.firstName",
                        lastName: "$otherUser.lastName",
                        photoUrl: "$otherUser.photoUrl"
                    },
                    unreadCount: 1,
                    lastMessage: {
                        _id: "$lastMessage._id",
                        senderId: "$lastMessage.senderId",
                        receiverId: "$lastMessage.receiverId",
                        text: "$lastMessage.text",
                        status: "$lastMessage.status",
                        createdAt: "$lastMessage.createdAt",
                        deliveredAt: "$lastMessage.deliveredAt",
                        readAt: "$lastMessage.readAt"
                    }
                }
            },
            { $sort: { "lastMessage.createdAt": -1, "lastMessage._id": -1 } }
        ]);

        res.status(200).json({
            success: true,
            message: "Conversations fetched successfully",
            data: conversations
        });
    } catch (error) {
        next(error);
    }
});

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