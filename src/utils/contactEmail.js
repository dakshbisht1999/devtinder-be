const { SendEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient } = require("./sesClient.js");

const createSendEmailCommand = (toAddress, fromAddress, senderEmail, senderName, subject, message) => {
  return new SendEmailCommand({
    Destination: {
      /* required */
      CcAddresses: [
        /* more items */
      ],
      ToAddresses: [
        toAddress,
        /* more To-email addresses */
      ],
    },
    Message: {
      /* required */
      Body: {
        /* required */
        Html: {
          Charset: "UTF-8",
          Data: `
            <h1>Message from ${senderName} (${senderEmail})</h1>
            <p><b>Message: </b>${message}</p>
          `,
        },
        // Text: {
        //   Charset: "UTF-8",
        //   Data: "This is the text format body.",
        // },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: fromAddress,
    ReplyToAddresses: [
      /* more items */
    ],
  });
};

const run = async (portal,
            subject,
            message,
            emailId, 
            name) => {
    const sendEmailCommand = createSendEmailCommand(
        process.env.PERSONAL_EMAIL,
        portal+"@dishantbisht.in",
        emailId, name, subject, message
    );

    try {
        return await sesClient.send(sendEmailCommand);
    } catch (caught) {
        if (caught instanceof Error && caught.name === "MessageRejected") {
        const messageRejectedError = caught;
        return messageRejectedError;
        }
        throw caught;
    }
};

// snippet-end:[ses.JavaScript.email.sendEmailV3]
module.exports = { run };