import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { pool } from '../../config/db';
import path from 'path';
import fs from 'fs';
import { catchAsync } from '../../utils/catchAsync';

let version = 'unknown';
try {
    const pkgPath = path.resolve(__dirname, '../../../package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        version = pkg.version;
    }
} catch (err) {
    logger.error(err as any, 'Error reading package.json version');
}

export class SystemController {
    
    test = (req: Request, res: Response) => {
        logger.info('[DEBUG] /api/test endpoint hit. Server is alive!');
        res.send('Server is alive!');
    };

    healthcheck = (req: Request, res: Response) => {
        logger.info('[DEBUG] /api/healthcheck endpoint hit. UptimeBot is alive!');
        res.status(200).send('OK');
    };

    status = catchAsync(async (req: Request, res: Response) => {
        let dbStatus = 'Disconnected';
        try {
            const result = await pool.query('SELECT 1');
            if (result.rowCount === 1) {
                dbStatus = 'Connected';
            }
        } catch (err) {
            logger.error(err as any, 'Database health check failed');
            dbStatus = 'Error';
        }

        res.json({
            status: 'success',
            data: {
                version,
                dbStatus,
                environment: process.env.NODE_ENV || 'development',
                uptime: process.uptime(),
                nodeVersion: process.version,
                memoryUsage: process.memoryUsage(),
                timestamp: new Date().toISOString()
            }
        });
    });

    testEmail = catchAsync(async (req: Request, res: Response) => {
        const { to = 'pedro@microatomo.pt' } = req.body;
        const { sendEmail } = await import('../../services/emailService');
        const info = await sendEmail(
            to,
            '✅ Teste de Email — Brevo + Render',
            `
            <div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
                <h2 style="color:#16a34a;margin:0 0 16px">✅ Email de Teste</h2>
                <p style="color:#374151">Este email foi enviado com sucesso via <strong>Brevo HTTP API</strong>.</p>
                <table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:14px">
                    <tr style="border-bottom:1px solid #f3f4f6">
                        <td style="padding:8px 0;color:#6b7280;width:140px">Para</td>
                        <td style="padding:8px 0;color:#111827">${to}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f3f4f6">
                        <td style="padding:8px 0;color:#6b7280">Timestamp</td>
                        <td style="padding:8px 0;color:#111827">${new Date().toISOString()}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;color:#6b7280">Ambiente</td>
                        <td style="padding:8px 0;color:#111827">${process.env.NODE_ENV || 'development'}</td>
                    </tr>
                </table>
                <p style="margin-top:24px;font-size:12px;color:#9ca3af">Se recebeu este email, a integração Brevo está a funcionar corretamente.</p>
            </div>
            `
        );
        logger.info({ to, messageId: info?.messageId }, '[TestEmail] Test email sent successfully');
        res.json({ success: true, messageId: info?.messageId, to });
    });
}
