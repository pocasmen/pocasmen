// Horas de desenvolvimento activo=9,0
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/ApiError';

const emailSchema = z.string().email('Endereço de email inválido');

// ─── Brevo HTTP API (replaces nodemailer/SMTP) ────────────────────────────────
// Using the Brevo REST API instead of SMTP so that the request goes over
// HTTPS (port 443), which is never blocked by hosting providers like Render.
// Render explicitly blocks outbound SMTP ports (25, 465, 587).

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoEmailPayload {
    sender: { name: string; email: string };
    to: Array<{ email: string }>;
    subject: string;
    htmlContent: string;
}

const sendViaBrevo = async (payload: BrevoEmailPayload): Promise<{ messageId: string }> => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        throw new Error('BREVO_API_KEY is not set in environment variables.');
    }

    const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Brevo API error ${response.status}: ${body}`);
    }

    const data = await response.json() as { messageId: string };
    return data;
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an email via the Brevo HTTP API.
 * @param to Recipient email address
 * @param subject Email subject
 * @param html Email body in HTML format
 * @param from Optional sender address (overrides EMAIL_FROM env var)
 */
/**
 * Parses a sender string that can be either:
 *  - a plain email: "backend@microatomo.pt"
 *  - RFC 5322 format: "'Micro Átomo' <backend@microatomo.pt>" or "Micro Átomo <backend@microatomo.pt>"
 *
 * Brevo REST API requires name and email as separate fields.
 */
const parseSender = (raw: string, defaultName: string): { name: string; email: string } => {
    // Match: optional quoted/unquoted name followed by <email>
    const match = raw.match(/^['"]?([^'"<>]+?)['"]?\s*<([^>]+)>$/);
    if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
    }
    // Plain email address — use the default app name
    return { name: defaultName, email: raw.trim() };
};

export const sendEmail = async (to: string, subject: string, html: string, from?: string): Promise<{ messageId: string } | null> => {
    // Validate recipient
    try {
        emailSchema.parse(to);
    } catch {
        logger.error({ to }, 'Invalid email address provided to sendEmail');
        throw new BadRequestError('Endereço de email inválido');
    }

    // Prevent CRLF injection
    const sanitizedSubject = subject.replace(/[\r\n]/g, '');

    // Require API key
    if (!process.env.BREVO_API_KEY) {
        logger.warn('BREVO_API_KEY is missing. Email skipped.');
        return null;
    }

    const defaultName = process.env.APP_NAME || 'Project1';
    const rawSender   = from || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@microatomo.pt';
    const sender      = parseSender(rawSender, defaultName);

    try {
        const info = await sendViaBrevo({
            sender,
            to: [{ email: to }],
            subject: sanitizedSubject,
            htmlContent: html,
        });

        logger.info({ to, subject: sanitizedSubject, messageId: info.messageId }, '[EmailService] Email sent successfully via Brevo');
        return info;
    } catch (error) {
        logger.error(error, '[EmailService] Error sending email via Brevo:');
        // Re-throw so callers can handle/log; sendEmailWithTemplate swallows it gracefully.
        throw error;
    }
};


/**
 * Sends an email using a template stored in the settings table.
 * @param to Recipient email address
 * @param templateType The key of the template in the email_templates setting (e.g. 'approval')
 * @param variables Object mapping placeholder keys (e.g. 'login_url') to values
 */
export const sendEmailWithTemplate = async (
    to: string,
    templateType: string,
    variables: Record<string, string>
): Promise<{ messageId: string } | null> => {
    try {
        // 1. Fetch templates from DB
        const { data: settingsData, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'email_templates')
            .maybeSingle();

        if (error) {
            logger.error(error, 'Error fetching email templates from DB:');
        }

        let subject = 'Mensagem de Project1';
        let body = '';
        let from: string | undefined;

        // 2. Parse and locate the requested template
        if (settingsData?.value) {
            const templates = typeof settingsData.value === 'string'
                ? JSON.parse(settingsData.value)
                : settingsData.value;
            const template = templates[templateType];

            if (template) {
                subject = template.subject || subject;
                body = template.body || '';
                from = template.from || undefined;
            }
        }

        // 3. (Removed hardcoded fallbacks - templates should now be in DB)

        // 4. Replace {{variable}} placeholders
        for (const [key, value] of Object.entries(variables)) {
            body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        if (!body) {
            logger.warn({ templateType }, 'Empty email body for template type. Email skipped.');
            return null;
        }

        return await sendEmail(to, subject, body, from);
    } catch (error) {
        // Don't let email failures break the main approval flow
        logger.error(error, `[EmailService] Failed to send templated email (${templateType}):`);
        return null;
    }
};

/**
 * Retained for test compatibility — no-op since there is no persistent
 * connection to close with the HTTP API approach.
 */
export const resetTransporter = (): void => {
    // No-op: HTTP API is stateless, nothing to reset.
};
