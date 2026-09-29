const {AppError} = require("./../utils/AppError");
const jwt = require("jsonwebtoken");
const {UserModel} = require("./../models/user");

const adminAuth = (req, res, next) => {
    // req.headers['authorization'] = "Bearer abc123xyz"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Splits "Bearer <token>"
    console.log("Extracted Token:", token);

    //if token is not passed in the authentication headers
    if(!token || token !== 'adminBearerToken'){
        // return res.status(401).send("Unauthorized: Missing or invalid token format");
        throw new AppError("Unauthorized user!",401)
    }
    //... code to check whether the token is invalid or expired
    // using jwt library checker return the response accordingly

    next();

}

const userAuth = async (req, res, next) => {
    try{
        // Actual JWT Token Authorization
        // Read the token from the req cookies using cookie-parser
        const {token} = req.cookies; // token sent via cookie 
        if(!token) throw new AppError("Unauthorized user!",401);

        const decodedTokenData = await jwt.verify(token, process.env.DEVTINDER_JWT_SECRET_KEY);
        const {_id, tokenVersion} = decodedTokenData;
        const user = await UserModel.findById(_id);
    
        if(!user) throw new AppError("User not found!",404);
        if (tokenVersion !== user.tokenVersion) {
            throw new AppError("Session expired! Please login again.", 401);
        }
    
        req.user = user;
        next();

    } catch (error) {
        next(error);
    }
}

module.exports = {adminAuth, userAuth}
