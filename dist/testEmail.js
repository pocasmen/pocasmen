"use strict";
/**
 * Manual Email Test Script
 *
 * This script sends a real test email using your SMTP configuration.
 * Run it with: npm run test:email
 */
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
const emailService_1 = require("./services/emailService");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const testEmail = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log('\n🧪 ===== EMAIL SERVICE TEST =====\n');
    // Check configuration
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ ERROR: Email configuration missing in .env file');
        console.error('\nRequired variables:');
        console.error('  - EMAIL_HOST');
        console.error('  - EMAIL_PORT');
        console.error('  - EMAIL_USER');
        console.error('  - EMAIL_PASS');
        console.error('  - EMAIL_SECURE (optional, defaults based on port)');
        process.exit(1);
    }
    // Display configuration
    console.log('📋 Configuration:');
    console.log(`   Host: ${process.env.EMAIL_HOST}`);
    console.log(`   Port: ${process.env.EMAIL_PORT || '587 (default)'}`);
    console.log(`   Secure: ${process.env.EMAIL_SECURE || 'auto-detect'}`);
    console.log(`   User: ${process.env.EMAIL_USER}`);
    console.log(`   From: ${process.env.EMAIL_FROM || `"Project1 Support" <${process.env.EMAIL_USER}>`}`);
    console.log('');
    const testRecipient = process.env.EMAIL_USER; // Send to yourself
    const subject = '✅ Test Email - Project1';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">✅ Email Test Successful!</h1>
            </div>
            <div style="background-color: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px;">
                <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #333; margin-top: 0;">🎉 Congratulations!</h2>
                    <p style="color: #666; line-height: 1.6;">
                        Your email service is configured correctly and working perfectly.
                    </p>
                    
                    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #667eea;">Configuration Details:</h3>
                        <ul style="color: #666; line-height: 1.8;">
                            <li><strong>SMTP Host:</strong> ${process.env.EMAIL_HOST}</li>
                            <li><strong>Port:</strong> ${process.env.EMAIL_PORT || '587'}</li>
                            <li><strong>Secure:</strong> ${process.env.EMAIL_SECURE || 'auto'}</li>
                            <li><strong>User:</strong> ${process.env.EMAIL_USER}</li>
                        </ul>
                    </div>

                    <p style="color: #666; line-height: 1.6;">
                        <strong>Test Time:</strong> ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}
                    </p>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center;">
                        <p style="color: #999; font-size: 0.9em; margin: 0;">
                            This is an automated test email from Project1
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    try {
        console.log(`📧 Sending test email to: ${testRecipient}`);
        console.log('⏳ Please wait...\n');
        const result = yield (0, emailService_1.sendEmail)(testRecipient, subject, html);
        if (result) {
            console.log('✅ SUCCESS! Email sent successfully!');
            console.log(`📬 Message ID: ${result.messageId}`);
            console.log(`📨 Accepted: ${(_a = result.accepted) === null || _a === void 0 ? void 0 : _a.join(', ')}`);
            if (result.rejected && result.rejected.length > 0) {
                console.log(`❌ Rejected: ${result.rejected.join(', ')}`);
            }
            console.log(`\n💡 Check your inbox at: ${testRecipient}`);
            console.log('\n🎉 Email service is working correctly!\n');
            process.exit(0);
        }
        else {
            console.log('\n⚠️  Email function completed but no result returned');
            console.log('Check the logs above for any warnings or errors\n');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ ERROR sending email:');
        console.error(error);
        console.error('\n💡 Troubleshooting tips:');
        console.error('   1. Verify your EMAIL_HOST and EMAIL_PORT are correct');
        console.error('   2. For Gmail, use port 465 with EMAIL_SECURE=true');
        console.error('   3. Make sure you\'re using an App Password, not your regular password');
        console.error('   4. Check if your firewall/antivirus is blocking the connection');
        console.error('   5. Try using a different SMTP service (SendGrid, Mailgun, etc.)\n');
        process.exit(1);
    }
});
// Run the test
testEmail();
