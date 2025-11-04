const Notification = require('../models/Notification');
const User = require('../models/User');
const dotenv = require('dotenv');
const ejs = require('ejs');
const path = require('path');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

dotenv.config();

let isEmailConfigured = false;

if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
    isEmailConfigured = true;
    console.log("Nodemailer email service configured (via Gmail/SMTP).");
} 
// --- Optional: Keep SendGrid as a fallback/alternative (or remove the old logic) ---
else if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    // If you want to keep SendGrid as a fallback:
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    isEmailConfigured = true;
    console.log("SendGrid email service configured.");
    
    // For this example, we assume you are replacing it.
     console.warn("Email service not found/configured. Email notifications will be disabled.");
} else {
    console.warn("Email service not found/configured. Email notifications will be disabled.");
}

/**
 * Sends an email using SendGrid.
 */
const sendEmail = async (mailOptions) => {
    if (!isEmailConfigured) { // Use the new generic flag
        console.warn("Attempted to send email, but email service is not configured.");
        return;
    }

    const msg = {
        to: mailOptions.to,
        from: process.env.EMAIL_FROM || 'ASAP Marketplace <no-reply@asap.com>', // Use the new FROM environment variable
        subject: mailOptions.subject,
        text: mailOptions.text,
        html: mailOptions.html,
    };
    
    try {
        await transporter.sendMail(msg); // Use Nodemailer's sendMail
        console.log(`Email sent successfully to ${mailOptions.to}`);
    } catch (error) {
        console.error(`Error sending email to ${mailOptions.to}:`, error.response?.body || error.message);
    }
};

/**
 * Creates an in-app notification and emits a socket event.
 */
const createInAppNotification = async (io, userSockets, userId, message, type, link) => {
    try {
        const notification = await Notification.create({
            user: userId, message, type, link, isRead: false,
        });
        console.log(`In-app notification created for user ${userId}`);

        const recipientSocketId = userSockets?.get(userId.toString());
        if (io && recipientSocketId) {
            const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
            io.to(recipientSocketId).emit('newNotification', { notification, unreadCount });
            console.log(`Emitted 'newNotification' to socket ${recipientSocketId}`);
        } else {
            console.log(`User ${userId} not connected via WebSocket, notification saved only.`);
        }
        return notification;
    } catch (error) {
         console.error(`Error creating in-app notification for user ${userId}:`, error.message);
    }
};

/**
 * Sends a notification (Email and/or In-App) based on type and user preferences.
 */
const sendNotification = async (io, userSockets, userId, notificationTypeKey, data = {}) => {
     let user;
     try {
         user = await User.findById(userId).select('+notificationPreferences email name');
         if (!user) { console.warn(`Notification Service: User ${userId} not found.`); return; }
     } catch (fetchError) { console.error(`Notif Service: Error fetching user ${userId}:`, fetchError); return; }

     let message = '', link = '', subject = '', baseType = '', templateName = '';
     const appName = "ASAP Marketplace";
     const preferenceKey = notificationTypeKey.toLowerCase().replace(/_([a-z])/g, g => g[1].toUpperCase());
     const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

     const templateData = { ...data, recipientName: user.name || 'User', appName: appName };

     // Define notification content based on type
     switch (notificationTypeKey) {
        case 'NEW_MESSAGE':
            message = `New message from ${data.senderName || 'user'} re: Booking ${data.bookingId?.slice(-6)}`;
            link = `/workspace/${data.bookingId}`;
            subject = `New Message on ${appName}`;
            baseType = 'message';
            templateName = 'newMessage.ejs';
            templateData.jobTitle = data.jobTitle || 'the project';
            templateData.messagePreview = data.messagePreview;
            break;
        case 'PROPOSAL_RECEIVED':
            message = `${data.proName || 'A pro'} submitted a proposal for "${data.jobTitle || 'your job'}"`;
            link = `/jobs/${data.jobId}`;
            subject = `New Proposal Received on ${appName}`;
            baseType = 'proposal';
            templateName = 'proposalReceived.ejs';
            break;
        // --- Add cases for other notifications ---
        case 'PROPOSAL_ACCEPTED':
            message = `Your proposal for "${data.jobTitle || 'the job'}" was accepted by ${data.clientName || 'the client'}`;
            link = `/workspace/${data.bookingId}`; // Link to the new workspace
            subject = `Proposal Accepted on ${appName}`;
            baseType = 'proposal';
            // templateName = 'proposalAccepted.ejs'; // Create this template
            break;
        case 'MILESTONE_FUNDED':
            message = `Milestone "${data.milestoneDescription || 'Project Funding'}" has been funded by ${data.clientName || 'the client'}`;
            link = `/workspace/${data.bookingId}`;
            subject = `Milestone Funded on ${appName}`;
            baseType = 'milestone';
            // templateName = 'milestoneFunded.ejs'; // Create this template
            break;
         case 'MILESTONE_RELEASED':
            message = `Payment for milestone "${data.milestoneDescription || 'Milestone'}" has been released!`;
            link = `/pro/financials`; // Link to financials page?
            subject = `Payment Released on ${appName}`;
            baseType = 'milestone';
            // templateName = 'milestoneReleased.ejs'; // Create this template
            break;
        case 'DISPUTE_OPENED':
             message = `A dispute has been opened for booking ${data.bookingId?.slice(-6)} regarding "${data.jobTitle || 'the project'}"`;
             link = `/admin/disputes/${data.disputeId}`; // Link for admin, different link for users?
             subject = `Dispute Opened on ${appName}`;
             baseType = 'dispute';
             // templateName = 'disputeOpened.ejs'; // Create this template
             break;
         case 'DISPUTE_RESOLVED':
             message = `The dispute regarding booking ${data.bookingId?.slice(-6)} ("${data.jobTitle || 'the project'}") has been resolved.`;
             link = `/workspace/${data.bookingId}`; // Link back to workspace?
             subject = `Dispute Resolved on ${appName}`;
             baseType = 'dispute';
             // templateName = 'disputeResolved.ejs'; // Create this template
             break;
        case 'USER_REGISTERED':
            message = `Welcome to ${appName}! Please complete your profile and onboarding to start working.`;
            // Direct Pro users to onboarding, others to dashboard
            link = data.role === 'pro' ? '/pro/onboarding' : '/dashboard';
            subject = `Welcome to ${appName}! Complete Your Setup`;
            baseType = 'onboarding';
            templateName = 'userRegistered.ejs'; // We will create this template
            break;
        default:
            console.warn(`Unknown notification type: ${notificationTypeKey}`);
            return;
     }

     // --- Update linkUrl in templateData *after* link is defined ---
     templateData.linkUrl = `${frontendUrl}${link}`;

     // --- Check Preferences and Send ---
     const prefs = user.notificationPreferences?.get(preferenceKey) || { email: true, inApp: true };

     // 1. Send In-App if enabled
     if (prefs.inApp) {
         await createInAppNotification(io, userSockets, userId, message, baseType, link);
     } else {
         console.log(`Skipping in-app notification for ${userId} (type: ${preferenceKey}) due to preferences.`);
     }

     // 2. Send Email if enabled and template exists
     if (prefs.email && user.email && templateName) {
          if (isEmailConfigured) {
            try {
                const htmlContent = await ejs.renderFile(
                    path.join(__dirname, '../templates/emails', templateName),
                    templateData
                );
                const textContent = `${message}. View at: ${templateData.linkUrl}`;
                await sendEmail({ to: user.email, subject, html: htmlContent, text: textContent });
            } catch (renderError) {
                 console.error(`Error rendering/sending email template ${templateName} for user ${userId}:`, renderError);
            }
          } else {
              console.warn(`Skipping email for ${userId} (type: ${preferenceKey}) because SendGrid is not configured.`);
          }
     } else {
          if (prefs.email && user.email && !templateName) console.warn(`Skipping email for ${userId} (type: ${preferenceKey}) because no template name was defined.`);
          else if (prefs.email && !user.email) console.log(`Skipping email for ${userId} (type: ${preferenceKey}) due to missing email.`);
          else console.log(`Skipping email notification for ${userId} (type: ${preferenceKey}) due to preferences.`);
     }
};

module.exports = {
  // Only export sendNotification, internal functions are used by it
  sendNotification,
};