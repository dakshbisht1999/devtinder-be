const { SendEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient } = require("./sesClient.js");

const getEmailServiceNotice = () => {
  if (process.env.AWS_SES_SANDBOX === "true") {
    return "Email delivery is currently running in AWS SES sandbox mode. Messages can only be delivered to SES-verified email addresses.";
  }
  return undefined;
};

/**
 * Sends one transactional email through SES.
 * Set EMAIL_FROM to an SES-verified identity. In an SES sandbox, `to` must
 * also be an SES-verified email address.
 */
const sendEmail = async ({ to, subject, text, html, from = process.env.EMAIL_FROM }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error("to, subject, and text or html are required to send an email");
  }
  if (!from) {
    throw new Error("EMAIL_FROM must be set to an SES-verified sender email address");
  }

  const body = {};
  if (text) body.Text = { Charset: "UTF-8", Data: text };
  if (html) body.Html = { Charset: "UTF-8", Data: html };

  return sesClient.send(new SendEmailCommand({
    Destination: { ToAddresses: [to] },
    Message: { Body: body, Subject: { Charset: "UTF-8", Data: subject } },
    Source: from
  }));
};

module.exports = { sendEmail, getEmailServiceNotice };
