const express = require("express");
const authRouter = express.Router();

const {adminAuth, userAuth} = require("./../../middlewares/auth");
const { UserModel } = require("./../../models/user");
const {AppError} = require("./../../utils/AppError");
const {validateSignupData, validateLoginData, validateEmailData} = require("./../../utils/validation");
const bcrypt = require("bcrypt");
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");
const contactEmail = require("../../utils/contactEmail");
const crypto = require("crypto");
const validator = require("validator");
const { sendEmail, getEmailServiceNotice } = require("../../utils/sendEmail");

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");
const createOtp = () => crypto.randomInt(100000, 1000000).toString();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();

const sendBestEffortEmail = async (message, purpose) => {
    try {
        await sendEmail(message);
    } catch (error) {
        console.error(`Unable to send ${purpose} email:`, error.message);
    }
};

const sendOtpEmail = async (user, otp, purpose) => {
    const subject = purpose === "password reset"
        ? "Your DevTinder password reset code"
        : "Your DevTinder email verification code";
    const text = `Hi ${fullName(user)}, your ${purpose} code is ${otp}. It expires in 5 minutes. Do not share this code.`;
    try {
        await sendEmail({
            to: user.emailId,
            subject,
            text,
            html: `<p>Hi ${escapeHtml(fullName(user))},</p><p>Your ${purpose} code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes. Do not share this code.</p>`
        });
    } catch (error) {
        throw new AppError(`Unable to send ${purpose} email. Please try again.`, 502);
    }
};

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
        await sendBestEffortEmail({
            to: user.emailId,
            subject: "Welcome to DevTinder",
            text: `Hi ${fullName(user)}, your DevTinder account was created successfully.`,
            html: `<p>Hi ${escapeHtml(fullName(user))},</p><p>Your DevTinder account was created successfully.</p>`
        }, "signup");
        
        // console.log("saved the data");
        // const userDocument = await UserModel.findOne({emailId: req.body.emailId}); //returns document/json object
        // const userId = userDocument._id.toString(); //need to convert _id into string using .toString();
        // console.log(userId);
        // 201 status ka matlab hota hai "Created Successfully"
        res.status(201).send({
            message: "User signed up successfully",
            success: true,
            ...(getEmailServiceNotice() && { emailServiceNotice: getEmailServiceNotice() })
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

// Temp Email check API
authRouter.post("/email",async(req,res,next)=>{
    try{
        // Validation of Data
        await validateEmailData(req);
        // console.log("hi")

        const {
            emailComingFrom,
            subject,
            message,
            emailId, 
            name
        } = req.body;

        const emailRes = await contactEmail.run(emailComingFrom, subject, message, emailId, name);
        // console.log(emailRes);
        
        if(emailRes.$metadata.httpStatusCode === 200){
            res.status(emailRes.$metadata.httpStatusCode).send({
                message: "Email sent successfully",
                success: true,
                data: {
                    emailComingFrom,
                    subject,
                    message,
                    emailId, 
                    name
                }
            });
        }else{
            throw new AppError('Something went wrong, try sending direct mail.', 500)
        }
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


// Step 1 of a password reset. Always returns the same message to avoid exposing
// whether an email address is registered.
const requestPasswordResetOtp = async (req, res, next) => {
    try {
        const { emailId } = req.body;
        if (!emailId || !validator.isEmail(emailId)) {
            throw new AppError("Email is not valid!", 400);
        }

        const user = await UserModel.findOne({ emailId: emailId.toLowerCase() });
        if (user) {
            const otp = createOtp();
            user.passwordResetOtpHash = hashOtp(otp);
            user.passwordResetOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
            user.passwordResetTokenHash = undefined;
            user.passwordResetTokenExpiresAt = undefined;
            await user.save();
            // Keep this endpoint account-enumeration safe even if SES rejects an
            // unverified sandbox recipient.
            try {
                await sendOtpEmail(user, otp, "password reset");
            } catch (error) {
                // console.error("Unable to send password reset email:", error.message);
                throw new AppError(error.message, 502);
            }
        }
        res.send({
            success: true,
            message: "If this email is registered, a password reset code has been sent.",
            ...(getEmailServiceNotice() && { emailServiceNotice: getEmailServiceNotice() })
        });
    } catch (error) {
        next(error);
    }
};

// Step 2: validate the OTP before the frontend shows its new-password form.
// A short-lived, HTTP-only cookie authorizes the following reset request.
const verifyPasswordResetOtp = async (req, res, next) => {
    try {
        const { emailId, otp } = req.body;
        if (!emailId || !validator.isEmail(emailId) || !/^\d{6}$/.test(String(otp || ""))) {
            throw new AppError("Email or verification code is invalid!", 400);
        }

        const user = await UserModel.findOne({
            emailId: emailId.toLowerCase(),
            passwordResetOtpHash: hashOtp(String(otp)),
            passwordResetOtpExpiresAt: { $gt: new Date() }
        });
        if (!user) throw new AppError("Verification code is invalid or has expired.", 400);

        const resetToken = jwt.sign(
            { _id: user._id, purpose: "password-reset" },
            process.env.DEVTINDER_JWT_SECRET_KEY,
            { expiresIn: Math.floor(OTP_EXPIRY_MS / 1000) }
        );
        user.passwordResetOtpHash = undefined;
        user.passwordResetOtpExpiresAt = undefined;
        user.passwordResetTokenHash = hashOtp(resetToken);
        user.passwordResetTokenExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
        await user.save();
        res.cookie("passwordResetToken", resetToken, {
            expires: new Date(Date.now() + OTP_EXPIRY_MS),
            httpOnly: true,
            sameSite: "lax"
        });
        res.send({ success: true, message: "OTP verified. You may now set a new password." });
    } catch (error) {
        next(error);
    }
};

// Step 3: only a verified, unexpired reset cookie may set a new password.
// Incrementing tokenVersion invalidates every existing login session.
const resetPassword = async (req, res, next) => {
    try {
        const { newPassword } = req.body;
        const { passwordResetToken } = req.cookies;
        if (!newPassword || !validator.isStrongPassword(newPassword)) {
            throw new AppError("Please enter a strong password!", 400);
        }
        if (!passwordResetToken) throw new AppError("Verify your OTP before resetting the password.", 401);

        let resetTokenData;
        try {
            resetTokenData = jwt.verify(passwordResetToken, process.env.DEVTINDER_JWT_SECRET_KEY);
        } catch {
            throw new AppError("Your password reset session has expired. Request a new OTP.", 401);
        }
        if (resetTokenData.purpose !== "password-reset") {
            throw new AppError("Invalid password reset session.", 401);
        }

        const user = await UserModel.findOne({
            _id: resetTokenData._id,
            passwordResetTokenHash: hashOtp(passwordResetToken),
            passwordResetTokenExpiresAt: { $gt: new Date() }
        });
        if (!user) throw new AppError("Your password reset session has expired. Request a new OTP.", 401);

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetTokenHash = undefined;
        user.passwordResetTokenExpiresAt = undefined;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        res.clearCookie("passwordResetToken");
        res.send({ success: true, message: "Password reset successfully. Please log in again." });
    } catch (error) {
        next(error);
    }
};

// The frontend calls this when it needs a fresh verification email for the
// currently signed-in account.
const requestEmailVerification = async (req, res, next) => {
    try {
        const user = req.user;
        if (user.isEmailVerified) {
            return res.send({ success: true, message: "Email is already verified." });
        }
        const otp = createOtp();
        user.emailVerificationOtpHash = hashOtp(otp);
        user.emailVerificationOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
        await user.save();
        await sendOtpEmail(user, otp, "email verification");
        res.send({ success: true, message: "Email verification code sent." });
    } catch (error) {
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const { otp } = req.body;
        if (!/^\d{6}$/.test(String(otp || ""))) {
            throw new AppError("Verification code is invalid!", 400);
        }
        const user = req.user;
        if (user.isEmailVerified) {
            return res.send({ success: true, message: "Email is already verified." });
        }
        if (user.emailVerificationOtpHash !== hashOtp(String(otp)) || !user.emailVerificationOtpExpiresAt || user.emailVerificationOtpExpiresAt <= new Date()) {
            throw new AppError("Verification code is invalid or has expired.", 400);
        }
        user.isEmailVerified = true;
        user.emailVerificationOtpHash = undefined;
        user.emailVerificationOtpExpiresAt = undefined;
        await user.save();
        res.send({ success: true, message: "Email verified successfully." });
    } catch (error) {
        next(error);
    }
};

authRouter.post(["/forgetPasswordViaOtp", "/forget-password-via-otp"], requestPasswordResetOtp);
authRouter.post(["/forgetPasswordViaOtp/verify", "/forget-password-via-otp/verify"], verifyPasswordResetOtp);
authRouter.post(["/forgetPasswordViaOtp/reset", "/forget-password-via-otp/reset"], resetPassword);
authRouter.post(["/emailVerification", "/email-verification"], userAuth, requestEmailVerification);
authRouter.post(["/emailVerification/verify", "/email-verification/verify"], userAuth, verifyEmail);


module.exports = {authRouter};
