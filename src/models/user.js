const mongoose = require("mongoose");
const { AppError } = require("../utils/AppError");
// const {Schema} = mongoose;
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    firstName:{
        type: String,
        required: true,
        minLength: 3,
        maxLength: 30,
        immutable: true
    },
    lastName:{
        type: String,
        required: true,
        immutable: true
    },
    emailId:{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        immutable: true,
        validate(value){
            if(!validator.isEmail(value)){
                throw new AppError("Invalid email address: " + value,400)
            }
        }
    },
    password:{
        type: String,
        required: true,
        validate(value){
            if(!validator.isStrongPassword(value)){
                throw new AppError("Password is not strong: " + value,400)
            }
        }
    },
    gender:{
        type: String,
        // Custom validators
        // validate(value){
        //     if(!['male','female','others'].includes(value)){
        //         throw new AppError("Gender data is not valid!",400)
        //     }
        // },

        // Built-in validators
        enum: {
            values: ['male','female','others'],
            message: "{VALUE} is not a valid gender!"
        }
    },
    dob:{
        type: String,
        required: true
    },
    age:{
        type: Number,
        required: true,
        min: 18,
        max: 100
    },
    photoUrl:{
        type: String,
        default: "https://geographyandyou.com/images/user-profile.png",
        validate(value){
            if(!validator.isURL(value)){
                throw new AppError("Invalid photo url: " + value,400)
            }
        }
    },
    about:{
        type: String,
        default: "This is the default about of the user!"
    },
    skills:{
        type: [String]
    },
    // roles: {
    //     type: [String],
    //     enum: ['user', 'editor', 'admin'],
    //     default: ['user']
    // }
}, {
    timestamps: true // automatically adds createdAt and updatedAt fields to every new User.
});

userSchema.methods.getJWT = async function() {
    const user = this;

    const token = await jwt.sign(
        {
            _id: user._id
        },
        process.env.DEVTINDER_JWT_SECRET_KEY,
        {
            expiresIn: "8h"
        }
    );

    return token;
};

userSchema.methods.validatePassword = async function (plainPassword){
    const user = this;
    const isPasswordMatch = await bcrypt.compare(plainPassword, user.password);
    if(!isPasswordMatch) throw new AppError("Invalid Credentials!!", 401);
};

// here we attach userSchema to the Collection of Database
// 's' as postfix in db automatically, user -> users
const UserModel = mongoose.model("user", userSchema);


module.exports = {UserModel}