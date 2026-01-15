/**
 * Integration test for email service
 * This test actually attempts to send an email using the configured SMTP settings
 * 
 * To run this test:
 * 1. Ensure your .env file has valid EMAIL_* configuration
 * 2. Run: npm test -- emailService.integration.test.ts
 * 
 * NOTE: This test is skipped by default. Remove .skip to run it.
 */

import { sendEmail } from '../emailService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe.skip('EmailService Integration Tests', () => {
    // These tests are skipped by default because they require real SMTP credentials
    // and will actually send emails. Remove .skip to run them.

    beforeAll(() => {
        // Verify that required environment variables are set
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error(
                'Email configuration missing. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in .env file'
            );
        }
    });

    it('should send a real test email', async () => {
        const testEmail = process.env.EMAIL_USER; // Send to yourself for testing
        const subject = 'Test Email from Project1';
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Test Email</h2>
                <p>This is a test email sent from the Project1 email service.</p>
                <p>If you received this, your email configuration is working correctly!</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            </div>
        `;

        console.log(`Attempting to send test email to ${testEmail}...`);
        console.log(`Using SMTP: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);

        const result = await sendEmail(testEmail!, subject, html);

        expect(result).toBeDefined();
        expect(result?.messageId).toBeDefined();

        console.log('✅ Email sent successfully!');
        console.log('Message ID:', result?.messageId);
    }, 30000); // 30 second timeout for email sending

    it('should handle invalid recipient gracefully', async () => {
        const invalidEmail = 'invalid-email-address';
        const subject = 'Test';
        const html = '<p>Test</p>';

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const result = await sendEmail(invalidEmail, subject, html);

        // Should not throw, but should log error
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(result).toBeUndefined();

        consoleErrorSpy.mockRestore();
    }, 30000);

    it('should send email with HTML template', async () => {
        const testEmail = process.env.EMAIL_USER;
        const subject = 'HTML Template Test';
        const loginUrl = 'http://localhost:5173/login';

        const html = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Bem-vindo ao Project1!</h2>
                <p>A sua conta foi aprovada pelo administrador.</p>
                <p>Já pode aceder à plataforma e gerir os seus pedidos de assistência.</p>
                <p>
                    <a href="${loginUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Aceder à Plataforma
                    </a>
                </p>
                <p style="font-size: 0.9em; color: #777; margin-top: 20px;">
                    Se o botão acima não funcionar, copie e cole este link no seu browser:<br>
                    ${loginUrl}
                </p>
            </div>
        `;

        const result = await sendEmail(testEmail!, subject, html);

        expect(result).toBeDefined();
        expect(result?.messageId).toBeDefined();

        console.log('✅ HTML template email sent successfully!');
    }, 30000);
});

/**
 * Manual test script
 * Run this directly with: ts-node src/services/__tests__/emailService.integration.test.ts
 */
if (require.main === module) {
    dotenv.config();

    const testManualEmail = async () => {
        console.log('🧪 Running manual email test...\n');

        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
            console.error('❌ Email configuration missing in .env file');
            process.exit(1);
        }

        const testEmail = process.env.EMAIL_USER;
        const subject = 'Manual Test Email - Project1';
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #007bff;">✅ Email Service Test</h2>
                    <p>This is a manual test email from Project1.</p>
                    <p><strong>Configuration:</strong></p>
                    <ul>
                        <li>Host: ${process.env.EMAIL_HOST}</li>
                        <li>Port: ${process.env.EMAIL_PORT}</li>
                        <li>Secure: ${process.env.EMAIL_SECURE}</li>
                        <li>User: ${process.env.EMAIL_USER}</li>
                    </ul>
                    <p><strong>Timestamp:</strong> ${new Date().toLocaleString('pt-PT')}</p>
                </div>
            </div>
        `;

        try {
            console.log(`📧 Sending test email to: ${testEmail}`);
            console.log(`📡 SMTP Server: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}\n`);

            const result = await sendEmail(testEmail, subject, html);

            if (result) {
                console.log('\n✅ SUCCESS! Email sent successfully!');
                console.log('📬 Message ID:', result.messageId);
                console.log('\n💡 Check your inbox at:', testEmail);
            } else {
                console.log('\n⚠️  Email function completed but no result returned');
                console.log('Check the logs above for any warnings or errors');
            }
        } catch (error) {
            console.error('\n❌ ERROR sending email:');
            console.error(error);
            process.exit(1);
        }
    };

    testManualEmail();
}
