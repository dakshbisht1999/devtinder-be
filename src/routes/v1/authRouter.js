const express = require("express");
const authRouter = express.Router();

const {adminAuth, userAuth} = require("./../../middlewares/auth");
const { UserModel } = require("./../../models/user");
const {AppError} = require("./../../utils/AppError");
const {validateSignupData, validateLoginData} = require("./../../utils/validation");
const bcrypt = require("bcrypt");
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");

// SignUp API
authRouter.post("/signup",async(req,res,next)=>{
    try{
        // Validation of Data
        await validateSignupData(req);
        // console.log("hi")

        const { firstName, lastName, emailId, password, age,
                gender, photoUrl, about, skills, dob } = req.body;
        
        // Password Encryption
        const passwordHash = await bcrypt.hash(password, 10);

        // Agar upar ki saari conditions paas ho gayi, matlab data ekdum sahi hai
        // Ab hum user ko save karenge
        const user = new UserModel({
            firstName, 
            lastName, 
            emailId, 
            password : passwordHash, 
            gender,
            dob,
            age,
            photoUrl,
            about,
            skills
        })
        await user.save(); // save in database collection
        
        // console.log("saved the data");
        // const userDocument = await UserModel.findOne({emailId: req.body.emailId}); //returns document/json object
        // const userId = userDocument._id.toString(); //need to convert _id into string using .toString();
        // console.log(userId);
        // 201 status ka matlab hota hai "Created Successfully"
        res.status(201).send({
            message: "User signed up successfully",
            success: true
            // data: { ...req.body, userId }
        });
    } catch(error){
        // res.status(400).send("Error saving the user: ", error);
        
        // Agar upar wale throw chalenge, ya database crash hoga, 
        // toh wo sab yahan aayenge aur Global Handler ke paas chale jayenge
        next(error);
    }
});

// Login API
authRouter.post("/login", async (req,res,next)=>{
    try{
        const user = await validateLoginData(req);
        await user.validatePassword(req.body.password);
        
        const token = await user.getJWT();
        
        res.cookie("token", token, {
            expires: new Date(Date.now() + 8 * 3600000), // expires in 8 hours
            httpOnly: true
        });
        const userObj = user.toObject();
        delete userObj.password;
        res.send({
            message: "User logged in successfully",
            // token: token, removed because of security reasons
            success: true,
            data: userObj
        })
    } catch(error){
        next(error);
    }
    
});

// Logout API
authRouter.post("/logout", userAuth, async (req,res,next)=>{
    try{
        // console.log(req.user);

        // 1st step
        // Expire the jwt token using redis blacklist db,
        // or token versioning in user document and jwt payload.
        
        // 2nd step
        // res.clearCookie("token");
        res.cookie("token", null, {
            expires: new Date(Date.now())
        });
        res.send({
            message: "User logged out successfully",
            success: true
        })
    } catch (error){
        next(error);
    }
})


module.exports = {authRouter};