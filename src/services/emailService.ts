import nodemailer from 'nodemailer';

// Create a transporter using environment variables
// These variables should be defined in your .env file
let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
    if (!transporter) {
        const port = parseInt(process.env.EMAIL_PORT || '587');
        const isSecure = process.env.EMAIL_SECURE === 'true' || port === 465;

        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: port,
            secure: isSecure, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                // Do not fail on invalid certs
                rejectUnauthorized: false
            },
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 10000,
            socketTimeout: 10000,
        });
    }
    return transporter;
};

/**
 * Sends an email to the specified recipient.
 * @param to Recipient email address
 * @param subject Email subject
 * @param html Email body in HTML format
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
    // Check if critical SMTP config is present to avoid crashing or useless errors
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        console.warn("SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.");
        return;
    }

    try {
        const info = await getTransporter().sendMail({
            from: process.env.EMAIL_FROM || `"Project1 Support" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`[EmailService] Email sent to ${to}. MessageId: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error("[EmailService] Error sending email:", error);
        // We don't throw here to prevent breaking the calling flow, but you might want to depending on requirements
        // For now, valid flow (approval) should probably succeed even if email fails?
        // User requirement: "immediately after admin approves... must be sent an email".
        // If email fails, is it a failure of approval? Probably not.
    }
};

/**
 * Reset the transporter (useful for testing)
 */
export const resetTransporter = () => {
    transporter = null;
};
