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
const emailService_1 = require("../emailService");
const nodemailer_1 = __importDefault(require("nodemailer"));
// Mock nodemailer
jest.mock('nodemailer');
describe('EmailService', () => {
    let mockTransporter;
    let mockSendMail;
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Reset the transporter singleton
        (0, emailService_1.resetTransporter)();
        // Create mock sendMail function
        mockSendMail = jest.fn().mockResolvedValue({
            messageId: 'test-message-id-123',
            accepted: ['test@example.com'],
            rejected: [],
            response: '250 Message accepted'
        });
        // Create mock transporter
        mockTransporter = {
            sendMail: mockSendMail
        };
        // Mock nodemailer.createTransport to return our mock transporter
        nodemailer_1.default.createTransport.mockReturnValue(mockTransporter);
        // Set up environment variables for testing
        process.env.EMAIL_HOST = 'smtp.test.com';
        process.env.EMAIL_PORT = '465';
        process.env.EMAIL_SECURE = 'true';
        process.env.EMAIL_USER = 'test@example.com';
        process.env.EMAIL_PASS = 'test-password';
    });
    afterEach(() => {
        // Clean up environment variables
        delete process.env.EMAIL_HOST;
        delete process.env.EMAIL_PORT;
        delete process.env.EMAIL_SECURE;
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;
        delete process.env.EMAIL_FROM;
    });
    describe('sendEmail', () => {
        it('should send an email successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const to = 'recipient@example.com';
            const subject = 'Test Subject';
            const html = '<p>Test email body</p>';
            const result = yield (0, emailService_1.sendEmail)(to, subject, html);
            // Verify nodemailer.createTransport was called with correct config
            expect(nodemailer_1.default.createTransport).toHaveBeenCalledWith({
                host: 'smtp.test.com',
                port: 465,
                secure: true,
                auth: {
                    user: 'test@example.com',
                    pass: 'test-password'
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 10000,
            });
            // Verify sendMail was called with correct parameters
            expect(mockSendMail).toHaveBeenCalledWith({
                from: '"Project1 Support" <test@example.com>',
                to: to,
                subject: subject,
                html: html
            });
            // Verify the result
            expect(result).toEqual({
                messageId: 'test-message-id-123',
                accepted: ['test@example.com'],
                rejected: [],
                response: '250 Message accepted'
            });
        }));
        it('should use custom EMAIL_FROM if provided', () => __awaiter(void 0, void 0, void 0, function* () {
            process.env.EMAIL_FROM = 'custom@example.com';
            yield (0, emailService_1.sendEmail)('recipient@example.com', 'Test', '<p>Test</p>');
            expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
                from: 'custom@example.com'
            }));
        }));
        it('should skip sending if EMAIL_HOST is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            delete process.env.EMAIL_HOST;
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = yield (0, emailService_1.sendEmail)('test@example.com', 'Test', '<p>Test</p>');
            expect(consoleWarnSpy).toHaveBeenCalledWith('SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.');
            expect(mockSendMail).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleWarnSpy.mockRestore();
        }));
        it('should skip sending if EMAIL_USER is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            delete process.env.EMAIL_USER;
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = yield (0, emailService_1.sendEmail)('test@example.com', 'Test', '<p>Test</p>');
            expect(consoleWarnSpy).toHaveBeenCalledWith('SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.');
            expect(mockSendMail).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleWarnSpy.mockRestore();
        }));
        it('should handle email sending errors gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('SMTP connection failed');
            mockSendMail.mockRejectedValue(error);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const result = yield (0, emailService_1.sendEmail)('test@example.com', 'Test', '<p>Test</p>');
            expect(consoleErrorSpy).toHaveBeenCalledWith('[EmailService] Error sending email:', error);
            expect(result).toBeUndefined();
            consoleErrorSpy.mockRestore();
        }));
        it('should use port 587 by default if not specified', () => __awaiter(void 0, void 0, void 0, function* () {
            delete process.env.EMAIL_PORT;
            delete process.env.EMAIL_SECURE;
            yield (0, emailService_1.sendEmail)('test@example.com', 'Test', '<p>Test</p>');
            expect(nodemailer_1.default.createTransport).toHaveBeenCalledWith(expect.objectContaining({
                port: 587,
                secure: false
            }));
        }));
        it('should automatically set secure to true for port 465', () => __awaiter(void 0, void 0, void 0, function* () {
            process.env.EMAIL_PORT = '465';
            delete process.env.EMAIL_SECURE;
            yield (0, emailService_1.sendEmail)('test@example.com', 'Test', '<p>Test</p>');
            expect(nodemailer_1.default.createTransport).toHaveBeenCalledWith(expect.objectContaining({
                port: 465,
                secure: true
            }));
        }));
        it('should log success message when email is sent', () => __awaiter(void 0, void 0, void 0, function* () {
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            yield (0, emailService_1.sendEmail)('test@example.com', 'Test Subject', '<p>Test</p>');
            expect(consoleLogSpy).toHaveBeenCalledWith('[EmailService] Email sent to test@example.com. MessageId: test-message-id-123');
            consoleLogSpy.mockRestore();
        }));
    });
});
