//Horas de desenvolvimento activo=7,5
import { SupabaseClient } from '@supabase/supabase-js';
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
 * Reset the transporter (useful for testing)
 */
export const resetTransporter = () => {
    if (transporter) {
        transporter.close();
    }
    transporter = null;
};
