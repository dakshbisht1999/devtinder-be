const {UserModel} = require("./../models/user");
const {AppError} = require("./AppError");
const validator = require("validator");
const bcrypt = require("bcrypt");

const validateSignupData = async (req) => {
    const { firstName, lastName, emailId, password, age, dob } = req.body;
    
    if (!firstName || !lastName || !password || !age || !dob) {
        // const err = new Error("Please provide all required fields");
        // err.statusCode = 400;
        // throw err;

        throw new AppError("Invalid Data!", 400);
    } else if (!emailId || !validator.isEmail(emailId)){
        throw new AppError("Email is not valid!", 400);
    } else if (!password || !validator.isStrongPassword(password)){
        throw new AppError("Please enter a strong password!", 400);
    } else if (await UserModel.findOne({ emailId: emailId })){
        // CASE: Duplicacy Check (Kya email pehle se database mein hai?)
        throw new AppError("This email is already registered. Please signup via different email.", 400);
    }
}

const validateLoginData = async (req) => {
    const {emailId, password} = req.body;
    if(!emailId || !password){
        throw new AppError("Please enter valid email or password!",400)
    }
    
    if(!validator.isEmail(emailId)){
        throw new AppError("Email is not valid!", 400);
    } 

    // check email exists in our record, if not then send error
    const user = await UserModel.findOne({emailId:emailId});
    if(!user) throw new AppError("Invalid Credentials!",401);

    // // fetch the hashPassword and compare with plainPassword
    // const isPasswordMatch = await bcrypt.compare(password, user.password);
    // if(!isPasswordMatch) throw new AppError("Invalid Credentials!!", 401);
        
    // const userObj = user.toObject();
    // delete userObj.password;
    return user;
}

module.exports = {validateSignupData, validateLoginData}