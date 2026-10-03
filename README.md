# DevTinder — Backend (`devtinder-be`)

> Production-grade RESTful API engine for **DevTinder**, built with **Node.js**, **Express 5**, **MongoDB Atlas**, and **AWS SES**, deployed on **AWS EC2** behind an **Nginx** reverse proxy and managed by **PM2**.

---

## 📌 Overview

**DevTinder** is a specialized networking and matchmaking platform designed for software developers to connect, collaborate, find mentors, and build tech projects together.

This repository (`devtinder-be`) contains the complete backend REST API service. It drives the core business logic, including secure session authentication, developer profile management, discovery feed recommendation algorithms, connection request lifecycles, and transactional email delivery.

- **Frontend Repository:** [devtinder-fe](https://github.com/dakshbisht1999/devtinder-fe)
- **Live Application:** [devtinder.dishantbisht.in](https://devtinder.dishantbisht.in)
- **API Base Route:** `/api/v1`

---

## 🏛️ System Architecture

The backend operates as an Express.js service hosted on an AWS EC2 Ubuntu instance, running behind an Nginx reverse proxy with SSL termination and managed continuously via PM2.

```text
               +-------------------------------------------+
               |           Cloudflare DNS (DNS-Only)       |
               +-------------------------------------------+
                                     |
                                     v
                        +---------------------------+
                        |    Nginx (Port 80/443)    |
                        +---------------------------+
                         /                         \
                        v                           v
              Static Frontend Assets          Reverse Proxy (/api/)
                 (/var/www/html)                   |
                                                   v
                                       +-----------------------+
                                       |  Express.js API Server|
                                       |      (Port 7777)      |
                                       |     Managed by PM2    |
                                       +-----------------------+
                                        /          |          \
                                       v           v           v
                                 MongoDB Atlas  AWS SES    JWT / Cookies
```

---

## 🚀 Key Features & Engineering Highlights

- **Authentication & Session Security:**
  - Secure token-based authentication using **JSON Web Tokens (JWT)** delivered via HTTP-only, SameSite-protected cookies.
  - Password hashing and salting with **bcrypt** (10 salt rounds).
  - **Google OAuth 2.0** login verification using Google's official `google-auth-library`.
  - Session invalidation & token versioning logic to force re-authentication upon password changes.

- **Two-Factor OTP Recovery & Email Verification:**
  - Secure 6-digit OTP generation using Node.js `crypto.randomInt()`.
  - Stored as cryptographic SHA-256 hashes with 5-minute expiration windows.
  - Integrated with **AWS SES (v3 SDK)** for reliable transactional email delivery.
  - Built-in AWS SES Sandbox mode detection with notification banners for portfolio environments.

- **Developer Discovery & Smart Feed Algorithm:**
  - Intelligent feed query utilizing MongoDB's `$nin` operator to filter out:
    1. The authenticated user themselves.
    2. Developers the user has already interacted with (`interested` or `ignored`).
    3. Existing mutual connections.
  - Database-level pagination (`skip` and `limit`) to maintain sub-second response times even as user records scale.

- **Connection Request Engine & Data Integrity:**
  - State machine supporting connection transitions: `interested`, `ignored`, `accepted`, and `rejected`.
  - Mongoose `pre("save")` hook preventing self-directed connection requests (`fromUserId === toUserId`).
  - Compound unique index `{ fromUserId: 1, toUserId: 1 }` in MongoDB to prevent duplicate request states.
  - Automatic transactional notifications dispatched to recipients when an `interested` request is received.

- **Mutual Connections with Aggregation Pipelines:**
  - High-performance MongoDB aggregation pipeline (`$match`, `$addFields` with conditional `$cond`, `$lookup`, `$unwind`, `$project`, `$skip`, `$limit`).
  - Resolves connection partner profiles directly on the database engine, eliminating memory-heavy filtering in Node.js.

- **Strict Validation & Centralized Error Handling:**
  - Schema-level and route-level validation with `validator` (emails, strong passwords, image URLs, enums, age constraints).
  - Robust `AppError` operational error abstraction.
  - Centralized Express error handler managing Mongoose `ValidationError`, duplicate key errors (`code: 11000`), JWT expiration (`TokenExpiredError`), and upstream TLS/SSL errors.

- **Cross-Origin & Cookie Configuration:**
  - Dynamic CORS whitelist parser supporting local development (`http://localhost:5173`) and production domains (`https://devtinder.dishantbisht.in`).
  - Explicit credential exchange (`credentials: true`) for secure cross-origin cookie handling.

---

## 🛠️ Tech Stack

| Category | Technology | Purpose |
|---|---|---|
| **Runtime** | [Node.js](https://nodejs.org/) (v20 LTS) | Asynchronous JavaScript runtime engine |
| **Web Framework** | [Express.js](https://expressjs.com/) (v5) | Routing, middleware pipeline, REST API architecture |
| **Database & ODM** | [MongoDB Atlas](https://www.mongodb.com/atlas) & [Mongoose](https://mongoosejs.com/) (v9) | Managed NoSQL document database, schemas, indexes & aggregation |
| **Authentication** | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | JWT session tokens and cryptographic password hashing |
| **OAuth Integration** | [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs) | Server-side Google ID token verification |
| **Email Delivery** | [AWS SDK for JS v3](https://github.com/aws/aws-sdk-js-v3) (`@aws-sdk/client-ses`) | Transactional OTP and notification dispatch via Amazon SES |
| **Validation & Security** | [validator](https://github.com/validatorjs/validator.js), [cookie-parser](https://github.com/expressjs/cookie-parser), [cors](https://github.com/expressjs/cors) | Request sanitization, cookie parsing, and CORS control |
| **Process Manager** | [PM2](https://pm2.keymetrics.io/) | Production process clustering, background execution & auto-restart |
| **Web Server / Proxy** | [Nginx](https://nginx.org/) with [Certbot Let's Encrypt](https://certbot.eff.org/) | Reverse proxy, static asset delivery, SSL/TLS termination |
| **Cloud Hosting** | [AWS EC2](https://aws.amazon.com/ec2/) (Ubuntu) | Production virtual server infrastructure |
| **CI/CD Pipeline** | [GitHub Actions](https://github.com/features/actions) | Automated SCP sync, dependency installation, and PM2 restarts |

---

## 📁 Project Structure

```text
devtinder-be/
├── .github/
│   └── workflows/
│       └── deploy-be.yml          # GitHub Actions automated EC2 deployment workflow
├── src/
│   ├── config/
│   │   └── database.js            # MongoDB Atlas connection configuration with pool options
│   ├── middlewares/
│   │   ├── auth.js                # JWT verification middlewares (userAuth, adminAuth)
│   │   └── cors.js                # Dynamic origin whitelist & credential configuration
│   ├── models/
│   │   ├── user.js                # User schema, password validation, JWT generation methods
│   │   └── connectionRequest.js   # Request schema, compound unique index & pre-save hooks
│   ├── routes/
│   │   └── v1/
│   │       ├── authRouter.js      # Signup, login, Google OAuth, OTP reset, email verification
│   │       ├── profileRouter.js   # View profile, update fields, change password, delete account
│   │       ├── requestRouter.js   # Send connection requests (interested/ignored) & review (accepted/rejected)
│   │       └── userRouter.js      # Paginated feed, mutual connections, received requests, remove connection
│   └── utils/
│       ├── AppError.js            # Custom operational error wrapper with status codes
│       ├── contactEmail.js        # Contact email template helper
│       ├── sendEmail.js           # AWS SES transactional email dispatcher & sandbox notice detector
│       ├── sesClient.js           # AWS SDK v3 SES client instance initialization
│       └── validation.js          # Input validation helpers for registration and profile updates
├── .env                           # Local environment variables (ignored by git)
├── .gitignore                     # Git ignore rules
├── apiList.md                     # Raw API specification reference
├── app.js                         # Application entry point, middleware registration & global error handler
├── BACKEND.md                     # Infrastructure runbook, Nginx, PM2, and system design notes
├── NOTES.md                       # Architectural design decisions, query operators, and learning journal
├── package.json                   # Project dependencies and npm scripts
└── package-lock.json              # Exact dependency lockfile
```

---

## 📡 API Endpoints Reference

All routes are versioned under `/api/v1`.

### 1. Authentication Router (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | Public | Register new developer account with validation |
| `POST` | `/api/v1/auth/login` | Public | Authenticate credentials and issue HTTP-only JWT cookie |
| `POST` | `/api/v1/auth/google` | Public | Authenticate via Google OAuth ID token |
| `POST` | `/api/v1/auth/logout` | Public | Clear JWT session cookie |
| `POST` | `/api/v1/auth/forget-password-via-otp` | Public | Generate and send 6-digit password reset OTP via AWS SES |
| `POST` | `/api/v1/auth/forget-password-via-otp/verify` | Public | Validate OTP and issue temporary reset authorization token |
| `POST` | `/api/v1/auth/forget-password-via-otp/reset` | Verified Token | Update password and invalidate all active user sessions |
| `POST` | `/api/v1/auth/email-verification` | Authenticated | Send email verification OTP to logged-in user |
| `POST` | `/api/v1/auth/email-verification/verify` | Authenticated | Verify OTP and mark email address as verified |

### 2. Profile Router (`/api/v1/profile`)

*All profile endpoints require active authentication (`userAuth` middleware).*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/profile/view` | Fetch profile details of the authenticated developer |
| `PATCH` | `/api/v1/profile/edit` | Update all fields except uneditable ones (`emailId`, `password`) |
| `PATCH` | `/api/v1/profile/password` | Change account password by verifying existing password |
| `DELETE` | `/api/v1/profile/delete` | Permanently delete account and cascade-delete all connection requests |

### 3. Connection Request Router (`/api/v1/request`)

*All request endpoints require active authentication (`userAuth` middleware) and verified email.*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/request/send/:status/:toUserId` | Send request to `:toUserId`. Allowed status: `interested`, `ignored` |
| `POST` | `/api/v1/request/review/:status/:requestId` | Review request `:requestId`. Allowed status: `accepted`, `rejected` |

### 4. User Network & Feed Router (`/api/v1/user`)

*All user network endpoints require active authentication (`userAuth` middleware).*

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/api/v1/user/feed` | `?page=1&limit=10` | Paginated developer discovery feed (excludes self, connections, reviewed) |
| `GET` | `/api/v1/user/connections` | `?page=1&limit=10` | Paginated mutual accepted connections (via MongoDB aggregation) |
| `GET` | `/api/v1/user/requests/received` | `?page=1&limit=10` | Paginated list of pending incoming connection requests |
| `DELETE` | `/api/v1/user/connection/remove/:connectionId` | — | Remove an existing connection record |

---

## ⚙️ Getting Started & Local Setup

### Prerequisites

Ensure you have the following installed locally:
- [Node.js](https://nodejs.org/) (v18.x or v20.x LTS recommended)
- [npm](https://www.npmjs.com/) (v9+)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster connection string (or a local MongoDB instance)
- *(Optional for email features)* AWS SES credentials and verified email identities
- *(Optional for Google sign-in)* Google OAuth Web Client ID

### 1. Clone the Repository

```bash
git clone https://github.com/dakshbisht1999/devtinder-be.git
cd devtinder-be
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=7777

# Database Connection (MongoDB Atlas SRV)
MONGO_URI_DEVTINDER=mongodb+srv://<username>:<password>@cluster0.mongodb.net/devTinder?retryWrites=true&w=majority

# JWT Authentication
DEVTINDER_JWT_SECRET_KEY=your_super_secret_jwt_key_here

# Cross-Origin Resource Sharing (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:5173,https://devtinder.dishantbisht.in,http://localhost:5174,https:dishantbisht.in

# AWS Simple Email Service (SES)
AWS_REGION=your_aws_ses_region
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_SES_SANDBOX=true
EMAIL_FROM=no-reply@dishantbisht.in

# Google OAuth Integration
GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
```

### 4. Run the Development Server

```bash
# Start with hot-reloading via nodemon
npm run dev

# Or run standard node process
npm start
```

The server will initialize the MongoDB connection and listen on `http://localhost:7777`.

---

## 🚦 Production Infrastructure & Deployment

### PM2 Process Management

In production on AWS EC2, the service is managed as a continuous background process using [PM2](https://pm2.keymetrics.io/):

```bash
# Start service
pm2 start app.js --name "dt-be"

# View running process status
pm2 status

# Real-time streaming logs
pm2 logs dt-be

# Restart process
pm2 restart dt-be

# Save PM2 state across EC2 instance reboots
pm2 save
pm2 startup
```

### Nginx Reverse Proxy Configuration

Nginx routes public HTTPS traffic to the internal Express server running on port `7777`.

Location snippet (`/etc/nginx/sites-available/default`):

```nginx
server {
    server_name devtinder.dishantbisht.in;

    # Frontend SPA build directory
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy backend API calls
    location /api/ {
        proxy_pass http://localhost:7777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'keep-alive';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Certificate (Certbot)

Free SSL/TLS certificates provided by Let's Encrypt:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d devtinder.dishantbisht.in
```

---

## 🔄 Automated CI/CD (GitHub Actions)

The repository includes an automated deployment workflow defined in `.github/workflows/deploy-be.yml`.

### Deployment Trigger
To prevent unintentional production restarts during routine documentation updates, deployments are gated by commit message prefixes:
```bash
git commit -m "deploy: update connection request review pipeline"
git push origin main
```
*Any commit message starting with `deploy:`, `DEPLOY:`, or `Deploy:` automatically triggers the pipeline.*

### Pipeline Execution Steps:
1. **Source Synchronization:** Uses `appleboy/scp-action` to copy repository changes into a temporary directory on EC2.
2. **Atomic In-Place Sync:** Uses `rsync` to update the application directory while preserving the production `.env` configuration.
3. **Dependency Clean Install:** Executes `npm ci --production` to ensure locked, deterministic dependencies.
4. **Zero-Downtime Reload:** Restarts the PM2 process (`pm2 restart all --update-env` or `pm2 start app.js --name "dt-be"`).

### Required GitHub Secrets:
- `EC2_HOST`: Elastic IP or public hostname of the EC2 instance.
- `EC2_USERNAME`: SSH username (e.g., `ubuntu`).
- `EC2_SSH_KEY`: Private SSH identity key (`.pem` file content).

---

## 🔮 Future Architecture & Roadmap

Designed for high scalability and advanced system design discussions:

- [ ] **AI Assistant & Semantic Search (RAG Architecture):** Generate developer profile vector embeddings with OpenAI / HuggingFace models, index them using MongoDB Atlas Vector Search (HNSW), and provide natural-language match queries via Server-Sent Events (SSE).
- [ ] **Containerization & Kubernetes Orchestration:** Multi-stage Docker builds (`node:20-alpine`, non-root user) and Kubernetes deployment manifests with Horizontal Pod Autoscaling (HPA) and Redis session offloading.
- [ ] **Automated Reminders (Scheduled Cron Jobs):** Distributed worker queues with BullMQ and Redis to dispatch daily email digests of pending connection requests via AWS SES.
- [ ] **Real-Time Live Chat (WebSockets):** Mount Socket.IO with a Redis adapter for multi-instance horizontal broadcasting, protected by JWT handshake authentication and premium tier paywalls.
- [ ] **Razorpay Payments & Webhooks:** Monetization workflow for premium features with cryptographic HMAC-SHA256 signature verification for atomic subscription upgrades.
- [ ] **Web Push Notifications:** VAPID-based push notifications for instant connection alerts and offline message notices.

---

## 🔗 Related Repositories

| Repository | Description |
|---|---|
| 🖥️ [devtinder-fe](https://github.com/dakshbisht1999/devtinder-fe) | Frontend Single Page Application (React 19, Vite, Tailwind CSS v4, Redux Toolkit) |
| ⚙️ [devtinder-be](https://github.com/dakshbisht1999/devtinder-be) | Backend REST API Service (Node.js, Express, MongoDB Atlas, AWS SES, PM2) |
| 🌐 [Live Platform](https://devtinder.dishantbisht.in) | Production deployment hosted on AWS EC2 with custom domain and SSL |

---

## 👨‍💻 Author

**Dishant Bisht**
- GitHub: [@dakshbisht1999](https://github.com/dakshbisht1999)
- Portfolio / Domain: [dishantbisht.in](https://dishantbisht.in)

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
