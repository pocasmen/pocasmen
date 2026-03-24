import { supabase } from '../../config/supabase';
import { googleCalendarService } from '../../services/googleCalendarService';
import { BadRequestError, ApiError } from '../../utils/ApiError';

export class GoogleService {
    async syncGoogleCalendar() {
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        if (!calendarId) throw new BadRequestError('Google Calendar ID not configured');

        try {
            return await googleCalendarService.syncAllUnsynced(supabase, calendarId);
        } catch (err: any) {
            throw new ApiError(500, err.message || 'Sync failed');
        }
    }

    async clearGoogleCalendar() {
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        if (!calendarId) throw new BadRequestError('Google Calendar ID not configured');

        try {
            return await googleCalendarService.clearAllSyncedEvents(supabase, calendarId);
        } catch (err: any) {
            throw new ApiError(500, err.message || 'Clear failed');
        }
    }
}
