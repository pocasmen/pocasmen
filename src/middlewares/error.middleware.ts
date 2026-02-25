//Horas de desenvolvimento activo=2,5
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export const errorHandler = (
    err: Error | ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const log = (req as any).log || logger;
    log.error(err, `[ERROR] ${req.method} ${req.url}`);

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            error: err.message,
            details: err.details
        });
    }

    // Default to 500 Internal Server Error for unhandled errors
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(500).json({
        error: 'Internal Server Error',
        details: isProduction ? undefined : err.message
    });
};
