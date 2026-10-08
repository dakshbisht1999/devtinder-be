const cron = require("node-cron");
const {connectionRequestModel} = require("../models/connectionRequest");
const { sendEmail } = require("../emails/sendEmail");
const siteUrl = "https://devtinder.dishantbisht.in";

const processConnectionReminders = async () => {
    console.log("Cron Job Started: Sending Connection Request Reminders...");

    try {
        // calculating last 24hrs time
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        // Fetching all requests received in last 24hrs
        const pendingRequests = await connectionRequestModel.find({
            status: "interested", // Adjust if your status name is different
            createdAt: { $gte: yesterday }
        })
        .populate("fromUserId", "firstName lastName") // Sender details
        .populate("toUserId", "firstName emailId");   // Receiver details

        if (pendingRequests.length === 0) {
            console.log("No new connection requests in the last 24 hours.");
            return;
        }

        // Data Aggregation (Grouping multiple requests for the same receiver)
        const emailMap = new Map();

        pendingRequests.forEach((req) => {
            const receiverEmail = req.toUserId.emailId;

            if (!emailMap.has(receiverEmail)) {
                // If no receiver in map, then add
                emailMap.set(receiverEmail, {
                    receiverName: req.toUserId.firstName,
                    senders: []
                });
            }
            
            // Push sender name in receiver array
            emailMap.get(receiverEmail).senders.push(req.fromUserId.firstName);
        });

        // Send only 1 aggregated email to every receiver
        for (const [email, data] of emailMap.entries()) {
            
            // Logic to format names beautifully (e.g., "Rahul, Amit and 2 others")
            let sendersText = "";
            if (data.senders.length === 1) {
                sendersText = data.senders[0];
            } else if (data.senders.length === 2) {
                sendersText = `${data.senders[0]} and ${data.senders[1]}`;
            } else {
                sendersText = `${data.senders[0]}, ${data.senders[1]} and ${data.senders.length - 2} others`;
            }
            
            const sendEmailObj = {
                to: email,
                subject: `You have new connection requests on DevTinder!`,
                text: `Hi ${data.receiverName},\n\nYou are getting noticed! ${sendersText} sent you connection requests on DevTinder in the last 24 hours.\n\nLogin to DevTinder to review your requests and expand your developer network today!\n\nBest regards,\nThe DevTinder Team`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
                        <h2>Hi ${data.receiverName},</h2>
                        <p>You are getting noticed! <b>${sendersText}</b> sent you connection requests on DevTinder in the last 24 hours.</p>
                        <p>Don't keep them waiting. Review your requests and expand your developer network today!</p>
                        <br/>
                        <a href="${siteUrl}/requests" 
                        style="background-color: #ff5864; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                        Review Connection Requests
                        </a>
                        <br/><br/>
                        <p>Best regards,<br/>The DevTinder Team</p>
                    </div>
                `
            };

            try {
                // Call your updated sendEmail function
                await sendEmail(sendEmailObj);
                console.log(`Reminder sent successfully to ${email}`);
            } catch (err) {
                console.error(`Failed to send reminder to ${email}:`, err);
            }


            // console.log(`Reminder sent to ${email} for ${data.senders.length} requests.`);
        }

        console.log("Cron Job Finished Successfully!");

    } catch (error) {
        console.error("Error in Connection Reminder Cron Job: ", error);
    }
};

// for testing purpose
// processConnectionReminders();

// Keeping actual Cron Job for production 
// "0 8 * * *" means run this cronjob at 8am every morning
cron.schedule("0 8 * * *", () => {
    processConnectionReminders();
});