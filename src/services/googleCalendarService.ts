import { google } from 'googleapis';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the scope for Calendar API
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Path to the service account key file
const KEY_FILE_PATH = path.join(process.cwd(), 'google-credentials.json');

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

const calendar = google.calendar({ version: 'v3', auth });

/**
 * Maps common hex colors to Google Calendar color IDs (1-11)
 * @param hex Hex color string
 * @returns string colorId
 */
export const mapHexToGoogleColor = (hex: string): string => {
    const h = (hex || '').toLowerCase();

    // Default mapping for some common technician colors
    const colorMap: Record<string, string> = {
        '#3174ad': '9',  // Primary Blue -> Blueberry
        '#28a745': '10', // Success Green -> Basil
        '#dc3545': '11', // Danger Red -> Tomato
        '#ffc107': '5',  // Warning Yellow -> Banana
        '#6c757d': '8',  // Secondary Gray -> Graphite
        '#17a2b8': '7',  // Info Cyan -> Peacock
        '#6610f2': '3',  // Indigo -> Grape
        '#e83e8c': '4',  // Pink -> Flamingo
        '#fd7e14': '6',  // Orange -> Tangerine
    };

    // Try exact match
    if (colorMap[h]) return colorMap[h];

    // Try approximate matches based on keywords or components
    if (h.includes('blue')) return '9';
    if (h.includes('green')) return '10';
    if (h.includes('red')) return '11';
    if (h.includes('yellow')) return '5';
    if (h.includes('orange')) return '6';
    if (h.includes('purple') || h.includes('grape')) return '3';
    if (h.includes('gray') || h.includes('grey')) return '8';

    return '9'; // Default to Blueberry
};

/**
 * Service to manage Google Calendar synchronization
 */
export const googleCalendarService = {
    /**
     * Create an event in Google Calendar
     * @param calendarId The ID of the calendar to sync with
     * @param eventDetails Details of the appointment
     * @returns The created Google Event ID
     */
    async createEvent(calendarId: string, eventDetails: {
        title: string;
        description: string;
        location?: string;
        startTime: string; // ISO string
        endTime: string;   // ISO string
        colorId?: string;
    }) {
        try {
            if (!calendarId) {
                console.warn('[GOOGLE CALENDAR] No Calendar ID provided. Skipping sync.');
                return null;
            }

            const event = {
                summary: eventDetails.title,
                location: eventDetails.location || '',
                description: eventDetails.description,
                colorId: eventDetails.colorId,
                start: {
                    dateTime: eventDetails.startTime,
                    timeZone: 'Europe/Lisbon', // Adjust as needed or make dynamic
                },
                end: {
                    dateTime: eventDetails.endTime,
                    timeZone: 'Europe/Lisbon',
                },
            };

            const response = await calendar.events.insert({
                calendarId: calendarId,
                requestBody: event,
            });

            console.log(`[GOOGLE CALENDAR] Event created: ${response.data.id}`);
            return response.data.id;
        } catch (error) {
            console.error('[GOOGLE CALENDAR] Error creating event:', error);
            return null;
        }
    },

    /**
     * Update an existing event in Google Calendar
     * @param calendarId The ID of the calendar
     * @param eventId The Google Event ID
     * @param eventDetails Updated details
     */
    async updateEvent(calendarId: string, eventId: string, eventDetails: {
        title: string;
        description: string;
        location?: string;
        startTime: string;
        endTime: string;
        colorId?: string;
    }) {
        try {
            if (!calendarId || !eventId) {
                console.warn('[GOOGLE CALENDAR] Missing Calendar ID or Event ID. Skipping update.');
                return false;
            }

            const event = {
                summary: eventDetails.title,
                location: eventDetails.location || '',
                description: eventDetails.description,
                colorId: eventDetails.colorId,
                start: {
                    dateTime: eventDetails.startTime,
                    timeZone: 'Europe/Lisbon',
                },
                end: {
                    dateTime: eventDetails.endTime,
                    timeZone: 'Europe/Lisbon',
                },
            };

            await calendar.events.update({
                calendarId: calendarId,
                eventId: eventId,
                requestBody: event,
            });

            console.log(`[GOOGLE CALENDAR] Event updated: ${eventId}`);
            return true;
        } catch (error) {
            console.error('[GOOGLE CALENDAR] Error updating event:', error);
            return false;
        }
    },

    /**
     * Delete an event from Google Calendar
     * @param calendarId The ID of the calendar
     * @param eventId The Google Event ID
     */
    async deleteEvent(calendarId: string, eventId: string) {
        try {
            if (!calendarId || !eventId) {
                return false;
            }

            await calendar.events.delete({
                calendarId: calendarId,
                eventId: eventId,
            });

            console.log(`[GOOGLE CALENDAR] Event deleted: ${eventId}`);
            return true;
        } catch (error) {
            console.error('[GOOGLE CALENDAR] Error deleting event:', error);
            return false;
        }
    },

    /**
     * Synchronizes all unsynced schedules to Google Calendar
     */
    async syncAllUnsynced(supabase: SupabaseClient, calendarId: string) {
        console.log('[SYNC] Starting full synchronization of unsynced schedules...');

        // 1. Fetch all schedules that are NOT yet synced
        const { data: schedules, error } = await supabase
            .from('schedules')
            .select(`
                id, 
                title, 
                startDate, 
                endDate, 
                additionalInfo,
                clientId,
                equipmentId,
                googleEventId,
                schedule_technicians(technicianId)
            `)
            .is('googleEventId', null);

        if (error) {
            console.error('[SYNC] Error fetching unsynced schedules:', error);
            throw error;
        }

        console.log(`[SYNC] Found ${schedules?.length || 0} unsynced schedules.`);

        let successCount = 0;
        let failCount = 0;

        if (!schedules || schedules.length === 0) return { successCount, failCount };

        for (const s of schedules) {
            try {
                // Fetch Client Name
                const { data: client } = await supabase.from('clients').select('name').eq('id', s.clientId).single();
                const clientName = client?.name || 'Cliente Desconhecido';

                // Fetch Equipment
                const { data: equip } = await supabase.from('equipments').select('model').eq('id', s.equipmentId).single();
                const equipInfo = equip?.model || 'Modelo Desconhecido';

                // Fetch Tech Color
                let colorId = '9';
                const techIds = (s.schedule_technicians as any[]).map(t => t.technicianId);
                if (techIds.length > 0) {
                    const { data: tech } = await supabase.from('profiles').select('color').eq('id', techIds[0]).single();
                    if (tech?.color) {
                        colorId = mapHexToGoogleColor(tech.color);
                    }
                }

                // Sync to Google
                const googleEventId = await this.createEvent(calendarId, {
                    title: `${clientName} - ${s.title || 'Agendamento'}`,
                    description: `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}`,
                    startTime: s.startDate,
                    endTime: s.endDate,
                    colorId: colorId
                });

                if (googleEventId) {
                    await supabase.from('schedules').update({ googleEventId }).eq('id', s.id);
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                console.error(`[SYNC] Error syncing schedule ${s.id}:`, err);
                failCount++;
            }
        }

        return { successCount, failCount };
    }
};
