//Horas de desenvolvimento activo=4,5
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppSettingInsert } from '../types/supabase';

import { catchAsync } from '../utils/catchAsync';
import { withTransaction } from '../config/db';

export const getTemplates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // Table name is 'settings' according to introspection
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'email_templates')
        .maybeSingle();

    if (error) return res.status(500).json({ error: 'Failed to fetch templates' });

    const defaultTemplates = {
        approval: {
            name: 'Aprovação Cliente', from: '', subject: 'Aprovação de Conta - Project1',
            body: '<h2>Bem-vindo ao Project1!</h2><p>A sua conta foi aprovada.</p><p><a href="{{login_url}}">Aceder à Plataforma</a></p>'
        }
    };

    let templates = defaultTemplates;
    if (data?.value) {
        try {
            const parsedValue = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            templates = { ...defaultTemplates, ...parsedValue };
        } catch (e) {
            // Fallback if value is not valid JSON
        }
    }
    res.json(templates);
});

export const updateTemplates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const templates = req.body;
    const value = typeof templates === 'string' ? templates : JSON.stringify(templates);

    await withTransaction(req, async (db) => {
        await db.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            ['email_templates', value]
        );
    });

    res.json({ success: true });
});
