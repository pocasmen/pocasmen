//Horas de desenvolvimento activo=3,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { withTransaction } from '../config/db';

export const getSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // The table name in DB is 'settings' according to introspection
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw new ApiError(500, 'Failed to fetch settings', error.message);

    const settings = (data || []).reduce((acc: any, row) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
    res.json(settings);
});

export const updateSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const rows = Object.entries(req.body).map(([key, value]) => ({
        key,
        value: String(value)
    }));

    const result = await withTransaction(req, async (db) => {
        for (const row of rows) {
            await db.query(
                'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
                [row.key, row.value]
            );
        }

        const { rows: allSettings } = await db.query('SELECT * FROM settings');
        return allSettings.reduce((acc: any, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});
    });

    res.json(result);
});
