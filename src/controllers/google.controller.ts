import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { googleCalendarService } from '../services/googleCalendarService';

export const syncGoogleCalendar = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        if (!calendarId) return res.status(400).json({ error: 'Not configured' });
        const result = await googleCalendarService.syncAllUnsynced(supabase, calendarId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: 'Sync failed', details: err.message });
    }
};

export const clearGoogleCalendar = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        if (!calendarId) return res.status(400).json({ error: 'Not configured' });
        const result = await googleCalendarService.clearAllSyncedEvents(supabase, calendarId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: 'Clear failed', details: err.message });
    }
};
