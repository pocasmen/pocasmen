import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { UserRole } from '../constants/enums';
import { Profile, ProfileUpdate, Profile as DbProfile } from '../types/supabase';
import { withTransaction } from '../config/db';
import { ApiError, ForbiddenError, UnauthorizedError, NotFoundError } from '../utils/ApiError';

export const getTechnicians = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', [UserRole.TECHNICIAN, UserRole.ADMIN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN])
        .order('first_name', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch users', error.message);

    const result = (data || []).map((p) => ({
        ...p,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    }));

    res.json(result);
});

export const getMe = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const userId = req.user.id;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) throw new ApiError(500, 'Failed to fetch user profile', error.message);

    res.json({
        ...data,
        name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
    });
});

export const updateTechnician = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const userId = req.params.id;
    const { first_name, last_name, color, telegramchatid, signature, daily_notifications_enabled, notification_time, phone, google_calendar_color_id } = req.body;

    const userRole = req.user.user_metadata?.role;

    // Authorization check: admin can update anyone, others can only update themselves
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN && req.user.id !== userId) {
        throw new ForbiddenError('Forbidden');
    }

    const result = await withTransaction(req, async (db) => {
        const { rows, rowCount } = await db.query<Profile>(
            `UPDATE profiles SET 
                first_name = $1, 
                last_name = $2, 
                color = $3, 
                telegramchatid = $4, 
                signature = $5, 
                daily_notifications_enabled = $6, 
                notification_time = $7, 
                phone = $8,
                google_calendar_color_id = $9
             WHERE id = $10 RETURNING *`,
            [
                first_name,
                last_name,
                color,
                telegramchatid,
                signature,
                daily_notifications_enabled,
                notification_time,
                phone,
                google_calendar_color_id,
                userId
            ]
        );
        if (rowCount === 0) throw new NotFoundError('Perfil não encontrado.');
        return rows[0];
    });

    res.json(result);
});
