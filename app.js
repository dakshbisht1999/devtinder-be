// console.log("Hello, World!");

const express = require("express");
const {connectDB} = require("./src/config/database");
const {adminAuth, userAuth} = require("./src/middlewares/auth");
const cookieParser = require('cookie-parser');
const { authRouter } = require("./src/routes/v1/authRouter");
const { profileRouter } = require("./src/routes/v1/profileRouter");
const { requestRouter } = require("./src/routes/v1/requestRouter");
const { userRouter } = require("./src/routes/v1/userRouter");
const {corsConfig} = require("./src/middlewares/cors");

const app = express();

//To connect multiple dbs
// Promise.all([mainDB.asPromise(), adminDB.asPromise()])

//To connect single db only
connectDB()
.then(()=>{
    console.log("Database connection established.")

    // Using cors from npm to handle cors error on backend
    app.use(corsConfig());

    // Ye line add karni hai routes se upar!
    // Ye Postman se aane wale JSON data ko read karke req.body mein daal deti hai
    // Body Raw JSON ko parse karega
    app.use(express.json()); 

    // Body x-www-form-urlencoded ko parse karega
    app.use(express.urlencoded({ extended: true }));

    // Stored cookie ko parse krega saari APIs aur unke middlewares me
    app.use(cookieParser());


    app.use("/api/v1/auth", authRouter);
    app.use("/api/v1/profile", userAuth, profileRouter);
    app.use("/api/v1/request", userAuth, requestRouter);
    app.use("/api/v1/user", userAuth, userRouter);


    // Applying Auth on all "/admin" routes
    app.use("/admin", adminAuth);



    
    //Global Error Handler
    app.use((err,req,res,next)=>{
        // if(err){
        //     res.status(500).send("Something Went Wrong");
        // }

        // --- Mongoose Errors --- Agar ye Mongoose ka Validation Error hai
        if (err.name === "ValidationError") {
            err.statusCode = 400; // Hum khud yahan 400 set kar denge
            
            // Mongoose ke lambe message ("user validation failed...") ko clean karna
            const messages = Object.values(err.errors).map(val => val.message);
            err.message = messages.join(", "); 
        }
        
        // --- Mongoose Errors --- Agar ye duplicate key (email already exists) ka error hai
        if (err.code === 11000) {
            err.statusCode = 400;
            err.message = "This email is already registered!";
        }

        // --- JWT Errors (New Logic) ---
        if (err.name === "TokenExpiredError") {
            err.statusCode = 401;
            err.message = "Session expired! Please login again.";
        }
        if (err.name === "JsonWebTokenError") {
            err.statusCode = 401;
            err.message = "Invalid Token! Unauthorized access.";
        }

        // --- SSL/TLS Upstream Errors (NEW LOGIC) ---
        if (err.message && err.message.includes("tlsv1 alert internal error")) {
            err.statusCode = 502; // 502 Bad Gateway (Upstream server error)
            // Give a clean message to the client instead of the ugly OpenSSL stack trace
            err.message = "Failed to connect to an external service due to a secure connection error."; 
            
            // // Optional: You might want to log the exact error to your console for debugging
            // console.error("External API SSL Error:", err);
        }

        // err.statusCode and err.message from coming from the AppError.js
        // console.log("custom errorStatusCode", err.statusCode);
        // console.log("custom errorMessage", err.message);
        const statusCode = err.statusCode || 500;
        const errorMessage = err.message || "Internal Server Error";

        res.status(statusCode).send({
            message: errorMessage,
            success: false
        })
    });

    app.listen(7777,()=>{
        console.log("Server running on port:7777");
    });
}).catch((err)=>{
    // console.log(err);
    console.error("Database cannot be connected!!", err);
})

