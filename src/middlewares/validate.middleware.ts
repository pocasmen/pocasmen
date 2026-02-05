import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { BadRequestError } from '../utils/ApiError';

export const validate = (schema: z.ZodTypeAny) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        return next();
    } catch (error) {
        if (error instanceof ZodError) {
            const details = error.issues.map(issue => ({
                path: issue.path.join('.'),
                message: issue.message
            }));
            return next(new BadRequestError('Validation failed', details));
        }
        return next(error);
    }
};
