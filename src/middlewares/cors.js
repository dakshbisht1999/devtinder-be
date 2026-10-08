const cors = require("cors")

const corsConfig = ()=>{
    // app.use(cors()); // Dangerous way of handling cors
    // Best way of handling cors error with allowed origins
    // 1. Parse the ALLOWED_ORIGINS string into an Array
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:5173"]; // Fallback for safety

    // 2. Configure CORS Middleware
    return cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, or Postman)
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            } else {
                return callback(
                    new Error("CORS Policy Error: This origin is not allowed!")
                );
            }
        },
        credentials: true, // Crucial for passing HTTP-Only cookies/JWTs
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    });
};

module.exports = {corsConfig}