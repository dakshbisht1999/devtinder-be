# DevTinder — Backend (`devtinder-be`) Documentation & Runbook

> Production-ready RESTful backend API for **DevTinder**, built with **Node.js**, **Express**, **MongoDB Atlas**, **AWS SES**, and managed with **PM2** behind an **Nginx** reverse proxy.

---

## 📌 Architecture Overview

The backend service serves as the core business logic engine for DevTinder. It handles secure user authentication, profile data, developer feed algorithm, matchmaking and connection request states, and dynamic transactional email delivery via AWS SES.

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

## 🛠️ Tech Stack & Key Libraries

- **Runtime:** [Node.js](https://nodejs.org/) (v18.x / v20.x+)
- **Framework:** [Express.js](https://expressjs.com/)
- **Database:** [MongoDB Atlas](https://www.mongodb.com/atlas) with [Mongoose ODM](https://mongoosejs.com/)
- **Authentication:** `jsonwebtoken` (JWT) stored in HTTP-only `Set-Cookie`, `bcrypt` for password hashing
- **Email Service:** [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3) (`@aws-sdk/client-ses`)
- **Process Manager:** [PM2](https://pm2.keymetrics.io/)
- **Reverse Proxy & Web Server:** Nginx with Certbot SSL

---

## 🔐 CORS & Security Configuration

Because the frontend and backend communicate with session cookies over HTTP/HTTPS, CORS must explicitly allow origins and permit credentials.

### Express Middleware Setup
```javascript
import cors from 'cors';

const allowedOrigins = [
  'http://localhost:5173',
  'https://devtinder.dishantbisht.in'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true, // Crucial for cross-origin cookie exchange
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
```

### Cookie Configuration
When setting JWT tokens in response headers:
```javascript
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true for HTTPS
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

---

## 🗄️ Database Setup (MongoDB Atlas)

1. Create a cluster on **MongoDB Atlas**.
2. **Network Access**:
   - Go to **Security > Network Access**.
   - Add the **Public IPv4 address** of your EC2 instance (e.g., `54.252.117.220`).
   - If using a dynamic IP during initial testing, `0.0.0.0/0` can be used temporarily with strong user credentials.
3. **Database Access**: Create a dedicated database user with `readWriteAnyDatabase` or scoped to `devTinder`.
4. Copy the SRV connection string into `.env`:
   ```env
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/devTinder?retryWrites=true&w=majority
   ```

---

## 📧 AWS SES (Simple Email Service) Setup

The backend utilizes AWS SES (v3 SDK) for transactional communications (such as OTP-based password resets).

### 1. IAM User & Permissions
1. Open the **AWS IAM Console**.
2. Create a user (e.g., `devtinder-ses-user`).
3. Attach policy:
   - `AmazonSESFullAccess` (or a least-privilege policy allowing `ses:SendEmail` and `ses:SendRawEmail`).
4. Generate an **Access Key ID** and **Secret Access Key** under the **Security credentials** tab.

### 2. Verify Identities in SES Console
1. Navigate to **Amazon SES > Verified identities**.
2. **Verify Domain Identity:**
   - Add your root domain (e.g., `dishantbisht.in`).
   - Add the generated DKIM and TXT records to your DNS manager (e.g., Cloudflare/GoDaddy).
3. **Sandbox Mode Note:**
   - If AWS SES account is in **Sandbox mode**, recipient email addresses must also be individually verified under Verified identities before sending emails.
   - The frontend displays `EmailServiceNotice` when sandbox mode limitations apply.

### 3. AWS SDK v3 Implementation

```bash
npm install @aws-sdk/client-ses
```

```javascript
// src/utils/sesClient.js
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

export const sendEmail = async ({ toAddress, subject, bodyHtml, bodyText }) => {
  const params = {
    Source: process.env.SES_SENDER_EMAIL, // verified sender in SES
    Destination: {
      ToAddresses: [toAddress]
    },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: subject
      },
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: bodyHtml
        },
        Text: {
          Charset: 'UTF-8',
          Data: bodyText || ''
        }
      }
    }
  };

  const command = new SendEmailCommand(params);
  return await sesClient.send(command);
};
```

---

## 🚦 PM2 Process Management

PM2 ensures the Node.js API process stays alive continuously, restarts on crashes, and runs as a background service.

### Global Installation
```bash
npm install pm2@latest -g
```

### Process Management Commands
```bash
# Start backend service using npm script
pm2 start npm --name "dt-be" -- start
# OR using entry file directly:
pm2 start src/app.js --name "dt-be"

# Check status of running processes
pm2 list
pm2 status

# Real-time streaming logs
pm2 logs
pm2 logs dt-be

# Restart process (zero-downtime cluster mode optionally with -i max)
pm2 restart dt-be

# Flush existing log files
pm2 flush dt-be

# Stop or remove service
pm2 stop dt-be
pm2 delete dt-be

# Persist PM2 across server reboot
pm2 startup
pm2 save
```

---

## 🌐 Nginx Reverse Proxy Configuration

Nginx acts as the front-facing web server on ports 80/443, routing incoming `/api/` calls to the Node.js Express server on port `7777`.

### File: `/etc/nginx/sites-available/default`

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html index.htm;

    server_name devtinder.dishantbisht.in;

    # Frontend Single Page Application Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend Node.js Express API Proxy
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

### Test & Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
# or
sudo systemctl restart nginx
```

---

## 🛡️ Custom Domain & SSL (Certbot)

1. **DNS Setup**:
   - Registrar: GoDaddy / Cloudflare.
   - Set nameservers to Cloudflare.
   - In Cloudflare DNS records:
     - Type: `A`
     - Name: `devtinder.dishantbisht.in`
     - Value: `<EC2-Public-IP>` (e.g. `54.252.117.220`)
     - Proxy status: **DNS only** (bypasses Cloudflare proxy so Certbot can verify HTTP-01 challenge).
2. **Certbot Installation & SSL Generation**:
   ```bash
   sudo apt update
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d devtinder.dishantbisht.in
   ```
   Certbot will automatically update the Nginx configuration to add HTTPS listeners on port 443 and auto-renew certificates.

---

## 🔑 Environment Variables Specification

Create `.env` in the backend root directory:

```env
# Application
PORT=7777
NODE_ENV=production

# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/devTinder?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# CORS
ALLOWED_ORIGINS=http://localhost:5173,https://devtinder.dishantbisht.in

# AWS Simple Email Service (SES)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SES_SENDER_EMAIL=support@dishantbisht.in

# Email service status notice (optional banner message)
EMAIL_SERVICE_NOTICE=
```

---

## 🚀 AWS EC2 Deployment Runbook

### Step 1: Connect to the Server
```bash
chmod 400 devTinder-secret.pem
ssh -i "devTinder-secret.pem" ubuntu@ec2-43-204-96-49.ap-south-1.compute.amazonaws.com
```

### Step 2: Install Node.js & Dependencies
```bash
sudo apt update && sudo apt upgrade -y
# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# Verify
node -v
npm -v
```

### Step 3: Clone & Setup Backend App
```bash
git clone https://github.com/<your-username>/devtinder-be.git
cd devtinder-be

npm install --production
nano .env   # Paste production environment variables
```

### Step 4: Launch Backend with PM2
```bash
sudo npm install -g pm2
pm2 start npm --name "dt-be" -- start
pm2 save
pm2 startup
```

---

## 🔄 Automated CI/CD (GitHub Actions)

In your `devtinder-be` repository, create `.github/workflows/deploy-be.yml`:

```yaml
name: Deploy DevTinder Backend to EC2

on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/devtinder-be
            git pull origin main
            npm ci --production
            pm2 restart dt-be
            pm2 status
```

### Required GitHub Secrets in Backend Repo:
- `EC2_HOST`: EC2 public IP or domain
- `EC2_USERNAME`: `ubuntu`
- `EC2_SSH_KEY`: Content of `devTinder-secret.pem`

---

## 📡 API Endpoints Reference

### Authentication (`/api/v1`)
- `POST /signup`: Register a new developer user.
- `POST /login`: Authenticate and issue HTTP-only JWT cookie.
- `POST /logout`: Invalidate session and clear auth cookie.
- `POST /auth/google`: Verify Google credential token and establish session.

### Profile & Account (`/api/v1/profile`)
- `GET /profile/view`: Retrieve currently authenticated developer profile.
- `PATCH /profile/edit`: Update editable profile fields (bio, skills, photo, age, gender).
- `PATCH /profile/password`: Change account password.
- `DELETE /profile/delete`: Delete developer account and wipe associated requests.

### Password Recovery via OTP (`/api/v1/auth`)
- `POST /auth/forgot-password-otp`: Send OTP to registered user email via AWS SES.
- `POST /auth/verify-reset-otp`: Validate OTP and update password.

### Connection Requests (`/api/v1/request`)
- `POST /request/send/:status/:userId`: Send request with status `interested` or `ignored`.
- `POST /request/review/:status/:requestId`: Review received request with status `accepted` or `rejected`.

### User Feed & Network (`/api/v1/user`)
- `GET /user/feed`: Retrieve paginated candidates filtered against own profile, existing connections, and reviewed requests.
- `GET /user/connections`: Retrieve list of all mutual accepted connections.
- `GET /user/requests/received`: Retrieve list of incoming pending connection requests.

---

## 🔮 Future Architecture & Roadmap (Engineering & Interview Discussion)

The following backend initiatives and scalability patterns demonstrate the next phase of architecture, designed for deep-dive technical interview discussions:

### 1. 🤖 AI Assistant & Semantic Candidate Search (RAG Architecture)
- **Profile Embeddings Pipeline:** Compute dense vector embeddings from developer profiles (skills, bio, experience, headlines) using embedding models (e.g., OpenAI `text-embedding-3-small` or HuggingFace transformers).
- **MongoDB Atlas Vector Search:** Index embeddings using Hierarchical Navigable Small World (HNSW) / Cosine similarity directly within MongoDB Atlas via the `$vectorSearch` aggregation stage.
- **RAG Orchestration Chain:** Retrieve the top-$k$ most semantically relevant profiles and feed them as grounded context into an LLM (LangChain / custom prompt pipeline).
- **Real-Time Streaming Endpoint:** Implement a streaming response endpoint (`POST /api/v1/ai/chat`) leveraging Server-Sent Events (SSE) with `Transfer-Encoding: chunked` for ultra-low latency token delivery.

### 2. 🐳 Containerization & Cloud Native Architecture (Docker & Kubernetes HLD)
- **Production Dockerfile:** Multi-stage container build based on `node:20-alpine`, dropping root privileges to a dedicated `node` user to minimize attack surfaces and container footprint (<120MB).
- **Local Multi-Service Orchestration:** `docker-compose.yml` linking the API service, a local MongoDB replica set, and Redis for development parity.
- **Kubernetes (HLD) Concepts:**
  - **Deployments & Rolling Updates:** Zero-downtime rolling deployments managed with readiness and liveness probes.
  - **Horizontal Pod Autoscaling (HPA):** Auto-scaling pods based on CPU/Memory thresholds and request throughput metrics.
  - **Distributed Caching & Sessions:** Offloading session cache and socket state to a Redis cluster, keeping the Express API completely stateless.

### 3. ⏰ Scheduled Cron Jobs (24-Hour Connection Request Reminders)
- **Background Job Scheduler:** Implement scheduled workers using `node-cron` or BullMQ backed by Redis for distributed execution across multi-instance clusters.
- **24-Hour Query Window:** Automated daily job querying unreviewed connection requests:
  ```javascript
  ConnectionRequest.find({
    status: 'interested',
    createdAt: { $gte: twentyFourHoursAgo, $lt: now }
  }).populate('toUserId fromUserId');
  ```
- **Batch Email Dispatch via AWS SES:** Aggregate notifications per recipient, render dynamic HTML digest templates, and batch send via AWS SES with rate-limiting and exponential backoff.
- **Idempotency Guards:** Track reminder dispatch timestamps in the database to prevent duplicate emails across server restarts or scaled pods.

### 4. 💬 Live Chat Server with Subscription-Gated Access (WebSockets)
- **Socket.IO Engine:** Mount WebSocket server directly on the Express HTTP server with Redis adapter (`@socket.io/redis-adapter`) for cross-instance message broadcasting.
- **Handshake Authentication:** Validate HTTP-only JWT cookies during the initial WebSocket handshake before allowing socket connection.
- **Paywall / Subscription Guard:** Middleware interceptor verifying `user.isPremium === true` before permitting users to emit messages or join 1-on-1 private chat rooms.
- **Chat Persistence Schema:** Mongoose schemas for `ChatRoom` and `Message` with compound indices on `[senderId, receiverId, createdAt]` for fast paginated chat histories.

### 5. 💳 Razorpay Payment Gateway & Webhook Architecture
- **Order Creation API:** `POST /api/v1/payment/create-order` creates a Razorpay order via the official Node SDK with receipt ID and currency amount.
- **Cryptographic Webhook Verification:** `POST /api/v1/payment/webhook` validates the HMAC SHA-256 signature using the raw request body and secret:
  ```javascript
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  ```
- **Atomic Subscription Provisioning:** On `payment.captured` webhook event, run an atomic MongoDB transaction updating `user.isPremium = true`, logging the payment transaction ID, and scheduling renewal/expiry timestamps.

### 6. 🔔 Web Push Notification Service (VAPID)
- **VAPID Key Pair & Web Push Protocol:** Implement the Web Push standard using the `web-push` library.
- **Subscription Store:** Endpoints `POST /api/v1/notifications/subscribe` and `DELETE /api/v1/notifications/unsubscribe` storing user `PushSubscription` endpoints and crypto keys.
- **Event-Driven Push Triggers:** Trigger instant push dispatches asynchronously when:
  - A user receives an `interested` connection request (`/request/send/interested/:userId`).
  - An inbound direct chat message is received while the recipient is disconnected from WebSockets.

