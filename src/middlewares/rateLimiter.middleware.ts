//Horas de desenvolvimento activo=3,0
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Rate limiter para autenticação (Login e Registro)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas por IP/Email
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req: Request) => {
        // Identificar por IP + email (se fornecido)
        return `${req.ip}-${(req.body.email || 'unknown').toLowerCase()}`;
    },
    handler: (req: Request, res: Response) => {
        logger.warn({
            ip: req.ip,
            email: req.body.email,
            path: req.path
        }, 'Rate limit de autenticação excedido');

        res.status(429).json({
            error: 'Muitas tentativas. Tente novamente mais tarde.',
            retryAfter: Math.ceil((req as any).rateLimit.resetTime / 1000)
        });
    }
});

// Rate limiter para API geral
export const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 requests por minuto por IP
    message: 'Muitos pedidos. Tente novamente em breve.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter para criação de recursos (POST em geral)
export const createResourceLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 10, // 10 criações por minuto
    message: 'Muitas criações num curto espaço de tempo. Por favor, aguarde.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
});
