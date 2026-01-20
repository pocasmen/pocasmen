"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetTransporter = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Create a transporter using environment variables
// These variables should be defined in your .env file
let transporter = null;
const getTransporter = () => {
    if (!transporter) {
        const port = parseInt(process.env.EMAIL_PORT || '587');
        const isSecure = process.env.EMAIL_SECURE === 'true' || port === 465;
        transporter = nodemailer_1.default.createTransport({
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
const sendEmail = (to, subject, html, from) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if critical SMTP config is present to avoid crashing or useless errors
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        console.warn("SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.");
        return;
    }
    try {
        const info = yield getTransporter().sendMail({
            from: from || process.env.EMAIL_FROM || `"Project1 Support" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`[EmailService] Email sent to ${to}. MessageId: ${info.messageId}`);
        return info;
    }
    catch (error) {
        console.error("[EmailService] Error sending email:", error);
        // We don't throw here to prevent breaking the calling flow, but you might want to depending on requirements
        // For now, valid flow (approval) should probably succeed even if email fails?
        // User requirement: "immediately after admin approves... must be sent an email".
        // If email fails, is it a failure of approval? Probably not.
    }
});
exports.sendEmail = sendEmail;
/**
 * Reset the transporter (useful for testing)
 */
const resetTransporter = () => {
    transporter = null;
};
exports.resetTransporter = resetTransporter;
