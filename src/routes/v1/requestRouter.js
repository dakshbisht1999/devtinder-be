const express = require("express");
const requestRouter = express.Router();

const { UserModel } = require("./../../models/user");
const {AppError} = require("./../../utils/AppError");
const { connectionRequestModel } = require("../../models/connectionRequest");
const { sendEmail, getEmailServiceNotice } = require("../../utils/sendEmail");

const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const sendNotification = async (message) => {
    try {
        await sendEmail(message);
    } catch (error) {
        // The connection change has already succeeded; keep the API reliable if SES is unavailable.
        console.error("Unable to send connection notification:", error.message);
    }
};


requestRouter.post("/send/:status/:toUserId", async (req, res, next)=>{
    try{
        const fromUserId = req.user._id;
        const toUserId = req.params.toUserId;
        const status = req.params.status; // status: interested, ignored

        if(!req.user.isEmailVerified) throw new AppError("User is not verified",400);

        // check if fromUserId is same as toUserId in the mongoose.Schema using pre middleware

        const toUser = await UserModel.findById(toUserId);
        if(!toUser) throw new AppError("User doesn't exists",404);

        const allowedStatuses = ["interested", "ignored"];
        if(!allowedStatuses.includes(status)) throw new AppError("Invalid Status", 400);

        const existingConnectionRequest = await connectionRequestModel.findOne({
            $or: [
                {fromUserId, toUserId},
                {fromUserId: toUserId, toUserId: fromUserId}
            ]
        })
        if(existingConnectionRequest) throw new AppError("Connection request already exists", 400)

        const connectionRequest = new connectionRequestModel({
            fromUserId, toUserId, status
        })
        const data = await connectionRequest.save();

        if (status === "interested") {
            await sendNotification({
                to: toUser.emailId,
                subject: "You have a new DevTinder connection request",
                text: `${fullName(req.user)} is interested in connecting with you on DevTinder.`,
                html: `<p><strong>${escapeHtml(fullName(req.user))}</strong> is interested in connecting with you on DevTinder.</p>`
            });
        }

        res.send({
            message: status == 'interested' ? "Connection Request sent successfully to "+toUser.firstName : "You have "+status+" "+toUser.firstName,
            success: true,
            data,
            ...(getEmailServiceNotice() && { emailServiceNotice: getEmailServiceNotice() })
        })

    } catch (error){
        next(error);
    }
});

requestRouter.post("/review/:status/:requestId", async (req, res, next)=>{
    try{
        const status = req.params.status; // status: accepted, rejected
        const requestId = req.params.requestId;
        const toUserId = req.user._id; // loggedIn User

        if(!req.user.isEmailVerified) throw new AppError("User is not verified",400);

        // validate status
        const allowedStatuses = ["accepted", "rejected"];
        if(!allowedStatuses.includes(status)) throw new AppError("Invalid status",400);

        // check if this requestId exists in connectionRequests collection along with the status type: interested
        // because if the requestId is valid, status type must be interested to make it accepted or rejected
        const connectionRequest = await connectionRequestModel.findOne({
            _id: requestId,
            toUserId,
            status: "interested"
        })
        if(!connectionRequest) throw new AppError("Connection request not found",404);

        // change the status to accepted/rejected
        connectionRequest.status = status;
        const updatedData = await connectionRequest.save();

        if (status === "accepted") {
            const fromUser = await UserModel.findById(connectionRequest.fromUserId);
            if (fromUser) {
                await sendNotification({
                    to: fromUser.emailId,
                    subject: "Your DevTinder connection request was accepted",
                    text: `${fullName(req.user)} accepted your connection request.`,
                    html: `<p><strong>${escapeHtml(fullName(req.user))}</strong> accepted your connection request.</p>`
                });
            }
        }

        res.send({
            success: true,
            message: "Connection request "+status,
            data: updatedData,
            ...(getEmailServiceNotice() && { emailServiceNotice: getEmailServiceNotice() })
        })
    } catch(error){
        next(error);
    }
})



module.exports = {requestRouter};
