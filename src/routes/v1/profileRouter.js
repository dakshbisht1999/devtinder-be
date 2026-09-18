const express = require("express");
const profileRouter = express.Router();

const { UserModel } = require("./../../models/user");
const {AppError} = require("./../../utils/AppError");
const bcrypt = require("bcrypt");

// GET Profile API - get user information
profileRouter.get("/view", (req,res,next)=>{
    try{
        const user = req.user.toObject();

        delete user.password;
        res.send({
            data: user,
            success: true
        });
    } catch(error){
        next(error)
    }
});


// PUT (Total Replacement) vs PATCH (Partial Update)
// Patch Profile API - update data of the user
profileRouter.patch("/edit", async(req,res,next)=>{
    try{
        // const userId = req.query?.userId;
        // const emailId = req.query?.emailId;
        const user = req.user.toObject();
        const userId = user._id;
        const data = req.body;
        if(data.password || data.emailId){
            // delete data.password || data['password']
            // console.log('deleted password')
            throw new AppError("Update not allowed!",400)
        }
        if(userId){
            // const user = await UserModel.findByIdAndUpdate({_id: userId}, data);
            const user = await UserModel.findByIdAndUpdate(userId, data, {runValidators:true, returnDocument:'after'});
            if(!user) throw new AppError("Enter valid userId",400);
            
            res.send({
                message: "Profile updated successfully",
                success: true
            });
        }
        // if (!userId && emailId) { //update via email
        //     const user = await UserModel.findOneAndUpdate({emailId: emailId}, data, {runValidators:true, returnDocument:'after'});
        //     if(!user) throw new AppError("Enter valid emailId",400);
            
        //     res.send("User updated successfully via email");
        // }
        throw new AppError("Enter either userId or emailId to update the user.", 400);
    } catch (error){
        next(error);
    }
});


// PATCH Profile API - password specific
profileRouter.patch("/password", async(req,res,next)=>{
    try {
        const user = req.user;
        const userId = user._id.toString();
        const {currentPassword, newPassword} = req.body;

        await user.validatePassword(currentPassword);

        const encryptedPassword = await bcrypt.hash(newPassword, 10);
        const isUpdated = await UserModel.findByIdAndUpdate(userId, {password:encryptedPassword}, {runValidators:true, returnDocument:'after'});
        if(!isUpdated) throw new AppError("Unable to update password!",400);

        // logout from every other devices for security purposes 
        // or if correct - then validate the password everytime with api call using auth
        // or create a passwordUpdatedAt key along with each user in the database, and update the key everytime when the user changes the password
          // and verify the passwordUpdatedAt time and JWT iat time, so that if the JWT is older than the passwordUpdatedAt then need to login again.
        res.send({
            message: "Password changed successfully",
            success: true
        });
    } catch (error) {
        next(error);
    }
});


// Delete Profile API
profileRouter.delete("/delete", async(req,res,next)=>{
    try{
        const user = req.user.toObject();
        const userId = user._id;
        const isDeleted = await UserModel.findByIdAndDelete(userId);
        if(!isDeleted) throw new AppError("Enter valid userId",400);
        
        res.send({
            message: "User profile deleted successfully",
            success: true
        });
    } catch (error){
        next(error);
    }
});

// GET Profile API - by email
// profileRouter.get("/user", async(req,res,next)=>{
//     try{
//         const user = await UserModel.findOne({emailId: req.query.emailId})
//         if(!user){
//             throw new AppError("User not found",404);
//         }

//         // we can add multiple business logics like
//         // logged in user cannot see his/her user details in the feed
//         res.send(user);
//     } catch (error) {
//         next(error);
//     }
// });


module.exports = {profileRouter};