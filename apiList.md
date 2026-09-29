# authRouter

> Portfolio/demo environment: set `AWS_SES_SANDBOX=true` while AWS SES is in sandbox mode. Relevant responses then include `emailServiceNotice`, which the frontend should display to explain that email can only reach SES-verified identities. Remove or set this to `false` after SES production access is approved.

POST - /auth/signup
POST - /auth/login
POST - /auth/logout
POST - /auth/forget-password-via-otp        // body: { emailId }; sends a six-digit OTP
POST - /auth/forget-password-via-otp/reset  // body: { emailId, otp, newPassword }
POST - /auth/email-verification              // authenticated; sends a six-digit OTP
POST - /auth/email-verification/verify       // authenticated; body: { otp }


# profileRouter
GET - /profile/view
PATCH - /profile/edit
PATCH - /profile/password
DELETE - /profile/delete


# requestRouter
POST - /request/send/:status/:userId       // status: interested, ignored
POST - /request/review/:status/:requestId  // status: accepted, rejected


# userRouter
GET - /user/requests/received (with pagination)
GET - /user/connections (with pagination) // status: accepted
GET - /user/feed (with pagination)


# chatRouter [webSockets concept]
/chat/list
/chat/:chatId
/chat/message/sent


Build forgert password API for already logged out user (send otp on registered email using 2 way, ask user to write the registered email and then ask for the otp sent on the mail)


whenever user do forget password, then make sure to ask him for logout from other devices


restrict user actively login only number of devices

/user/connection/remove:userId create an api to remove connection
