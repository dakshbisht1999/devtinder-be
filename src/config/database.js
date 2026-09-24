const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
    // console.log("mongo_uri_devtinder", process.env.MONGO_URI_DEVTINDER)
    await mongoose.connect(
        process.env.MONGO_URI_DEVTINDER,
        {
            maxPoolSize: 10, // Keeps pre-warmed TCP sockets ready
            serverSelectionTimeoutMS: 5000, // Fails fast (5s) instead of hanging if Atlas drops
            socketTimeoutMS: 45000, // Closes inactive sockets to prevent stale connections
        }
    );
}

module.exports = {connectDB};

// // 1. Create Connection A
// const mainDB = mongoose.createConnection(process.env.MONGO_URI_DEVTINDER);

// mainDB.on("connected", () => {
//     console.log("Main App Database connected successfully.");
// });

// // 2. Create Connection B
// const adminDB = mongoose.createConnection(process.env.MONGO_URI_ADMIN);

// adminDB.on("connected", () => {
//     console.log("Admin Database connected successfully.");
// });

// module.exports = {connectDB, mainDB, adminDB};
