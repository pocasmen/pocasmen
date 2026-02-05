import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';

export const getSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw new ApiError(500, 'Failed to fetch settings', error.message);
    const settings = (data || []).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
    res.json(settings);
});

export const updateSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const rows = Object.entries(req.body).map(([key, value]) => ({ key, value: String(value) }));
    const { data, error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' }).select('key, value');
    if (error) throw new ApiError(500, 'Failed to update settings', error.message);
    const settings = (data || []).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
    res.json(settings);
});
