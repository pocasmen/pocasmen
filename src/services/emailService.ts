import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

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
 * @param from Optional custom from address
 */
export const sendEmail = async (to: string, subject: string, html: string, from?: string) => {
    // Check if critical SMTP config is present to avoid crashing or useless errors
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        logger.warn("SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.");
        return;
    }

    try {
        const info = await getTransporter().sendMail({
            from: from || process.env.EMAIL_FROM || `"Project1 Support" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        logger.info({ to, messageId: info.messageId }, `[EmailService] Email sent`);
        return info;
    } catch (error) {
        logger.error(error, "[EmailService] Error sending email:");
    }
};

/**
 * Reset the transporter (useful for testing)
 */
export const resetTransporter = () => {
    transporter = null;
};
