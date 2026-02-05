import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, UnauthorizedError } from '../utils/ApiError';
import { UserRole } from '../constants/enums';

export const getTechnicians = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, first_name, last_name, color, telegramchatid, signature, daily_notifications_enabled, notification_time, phone, google_calendar_color_id')
        .in('role', [UserRole.TECHNICIAN, UserRole.ADMIN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN])
        .order('first_name', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch users', error.message);

    const result = (data || []).map((p: any) => ({
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
        .select('id, email, role, first_name, last_name, color, telegramchatid, signature, daily_notifications_enabled, notification_time, phone')
        .eq('id', userId)
        .single();

    if (error) throw new ApiError(500, 'Failed to fetch user profile', error.message);

    res.json({
        ...data,
        name: `${(data as any).first_name || ''} ${(data as any).last_name || ''}`.trim(),
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

    const { data, error } = await supabase
        .from('profiles')
        .update({ first_name, last_name, color, telegramchatid, signature, daily_notifications_enabled, notification_time, phone, google_calendar_color_id })
        .eq('id', userId)
        .select()
        .single();

    if (error) throw new ApiError(500, 'Failed to update technician', error.message);
    res.json(data);
});
