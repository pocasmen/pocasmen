//Horas de desenvolvimento activo=4,0
import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { UserRole } from '../constants/enums';

export interface AuthenticatedRequest extends Request {
    user?: User;
    file?: Express.Multer.File;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.sendStatus(401);

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.sendStatus(403);

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

export const authorizeRoles = (roles: Array<UserRole>) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.user_metadata?.role;
        if (!req.user || !userRole || !roles.includes(userRole as UserRole)) {
            return res.status(403).json({ error: 'Permission denied for this role.' });
        }
        next();
    };
};
