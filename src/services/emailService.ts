//Horas de desenvolvimento activo=8,0
import { supabase } from '../config/supabase';

import nodemailer from 'nodemailer';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { BadRequestError, InternalServerError } from '../utils/ApiError';

const emailSchema = z.string().email('Endereço de email inválido');

// Create a transporter using environment variables
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
                // Só desabilitar verificação em desenvolvimento/ambiente local sem certs
                // Em produção, rejectUnauthorized deve ser true
                rejectUnauthorized: process.env.NODE_ENV === 'production'
            },
            // Pooling de conexões para melhor performance
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            // Aumentar timeouts para evitar falhas em redes lentas
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 30000,
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
    // 1. Validar email
    try {
        emailSchema.parse(to);
    } catch {
        logger.error({ to }, 'Invalid email address provided to sendEmail');
        throw new BadRequestError('Endereço de email inválido');
    }

    // 2. Sanitizar subject (prevenir CRLF injection)
    const sanitizedSubject = subject.replace(/[\r\n]/g, '');

    // 3. Verificar configuração
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        logger.warn("SMTP configuration (EMAIL_HOST or EMAIL_USER) is missing. Email skipped.");
        return null;
    }

    try {
        const info = await getTransporter().sendMail({
            from: from || process.env.EMAIL_FROM || `"${process.env.APP_NAME || 'Project1'}" <${process.env.EMAIL_USER}>`,
            to,
            subject: sanitizedSubject,
            html,
        });

        logger.info({
            to,
            subject: sanitizedSubject,
            messageId: info.messageId
        }, `[EmailService] Email sent successfully`);

        return info;
    } catch (error) {
        logger.error(error, "[EmailService] Error sending email:");
        throw new InternalServerError('Erro ao enviar email');
    }
};

/**
 * Sends an email using a template stored in the settings table.
 * @param to Recipient email address
 * @param templateType The key of the template in the email_templates setting (e.g. 'approval')
 * @param variables Object mapping placeholder keys (e.g. 'login_url') to values
 */
export const sendEmailWithTemplate = async (to: string, templateType: string, variables: Record<string, string>) => {
    try {
        // 1. Fetch templates from DB using the correct key
        const { data: settingsData, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'email_templates')
            .maybeSingle();

        if (error) {
            logger.error(error, "Error fetching email templates from DB:");
        }

        let subject = 'Mensagem de Project1';
        let body = '';
        let from = undefined;

        // 2. Parse templates and find the specific one
        if (settingsData?.value) {
            const templates = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
            const template = templates[templateType];

            if (template) {
                subject = template.subject || subject;
                body = template.body || '';
                from = template.from || undefined;
            }
        }

        // 3. Fallback for approval if template not found or body is empty
        if (!body && templateType === 'approval') {
            subject = 'Aprovação de Conta - Project1';
            body = '<h2>Bem-vindo ao Project1!</h2><p>A sua conta foi aprovada.</p><p><a href="{{login_url}}">Aceder à Plataforma</a></p>';
        }

        // 4. Replace variables in body
        Object.keys(variables).forEach(key => {
            const val = variables[key];
            const regex = new RegExp(`{{${key}}}`, 'g');
            body = body.replace(regex, val);
        });

        if (!body) {
            logger.warn({ templateType }, "Empty email body for template type. Email skipped.");
            return null;
        }

        return await sendEmail(to, subject, body, from);
    } catch (error) {
        logger.error(error, `[EmailService] Failed to send templated email (${templateType}):`);
        // We don't throw here to avoid breaking the main process if email fails
        return null;
    }
};

/**
 * Reset the transporter (useful for testing)
 */
export const resetTransporter = () => {
    if (transporter) {
        transporter.close();
    }
    transporter = null;
};

