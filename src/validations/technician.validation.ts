//Horas de desenvolvimento activo=1,5
import { z } from 'zod';

export const updateTechnicianSchema = z.object({
    params: z.object({
        id: z.string().uuid('ID de utilizador inválido')
    }),
    body: z.object({
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        color: z.string().optional(),
        telegramchatid: z.string().optional().nullable(),
        signature: z.string().optional().nullable(),
        daily_notifications_enabled: z.boolean().optional(),
        notification_time: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        google_calendar_color_id: z.string().optional().nullable(),
        client_role: z.string().optional().nullable()
    })
});
