import nodemailer from 'nodemailer';

// Create a transporter using environment variables
// These variables should be defined in your .env file
let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
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
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.warn("SMTP configuration (SMTP_HOST or SMTP_USER) is missing. Email skipped.");
        return;
    }

    try {
        const info = await getTransporter().sendMail({
            from: process.env.SMTP_FROM || '"Project1 Support" <noreply@project1.com>',
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
