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
                    timeZone: 'Europe/Lisbon',
                },
                end: {
                    dateTime: eventDetails.endTime,
                    timeZone: 'Europe/Lisbon',
                },
                extendedProperties: {
                    private: {
                        source: 'Project1_FieldService',
                        managedBy: 'GestorServiços'
                    }
                }
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
        } catch (error: any) {
            if (error.code === 404 || error.code === 410) {
                console.warn(`[GOOGLE CALENDAR] Event ${eventId} not found in Google. It may have been deleted manually.`);
                return false;
            }
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
        } catch (error: any) {
            if (error.code === 404 || error.code === 410) return true; // Already gone
            console.error('[GOOGLE CALENDAR] Error deleting event:', error);
            return false;
        }
    },

    /**
     * Delete all Google Calendar events associated with a schedule (blocks and legacy main event)
     */
    async deleteScheduleEvents(supabase: SupabaseClient, calendarId: string, scheduleId: number) {
        try {
            // 1. Fetch blocks
            const { data: blocks } = await supabase
                .from('schedule_time_blocks')
                .select('google_event_id')
                .eq('schedule_id', scheduleId)
                .not('google_event_id', 'is', null);

            for (const b of blocks || []) {
                if (b.google_event_id) {
                    await this.deleteEvent(calendarId, b.google_event_id);
                }
            }

            // 2. Fetch main record (legacy/fallback)
            // No longer fetching from 'schedules' table as googleEventId is being removed.
            return true;
        } catch (err) {
            console.error(`[SYNC] Error deleting schedule events for ${scheduleId}:`, err);
            return false;
        }
    },

    /**
     * Unified function to sync a single schedule to Google Calendar.
     * Fetches all necessary data and formats the title/description consistently.
     * Supports multiple time blocks by creating separate events for each.
     */
    async syncSchedule(supabase: SupabaseClient, calendarId: string, scheduleId: number) {
        try {
            if (!calendarId) return null;

            // 1. Fetch schedule with all necessary fields, including time blocks
            const { data: s, error: sErr } = await supabase
                .from('schedules')
                .select(`
                    id, 
                    title, 
                    serviceType,
                    startDate, 
                    endDate, 
                    additionalInfo,
                    clientId,
                    equipmentId,
                    isCompleted,
                    schedule_technicians(technicianId),
                    schedule_time_blocks(*)
                `)
                .eq('id', scheduleId)
                .single();

            if (sErr || !s) {
                console.error(`[SYNC] Error fetching schedule ${scheduleId}:`, sErr);
                return null;
            }

            // 2. Fetch Client Name
            const { data: client } = await supabase.from('clients').select('name').eq('id', s.clientId).single();
            const clientName = client?.name || 'Cliente Desconhecido';

            // 3. Fetch Equipment
            const { data: equip } = await supabase.from('equipments').select('model').eq('id', s.equipmentId).single();
            const equipInfo = equip?.model || 'Modelo Desconhecido';

            // 4. Fetch Technician Infos (for initials and color)
            let colorId = '9';
            let techInitials = '??';
            const techIds = (s.schedule_technicians as any[]).map(t => t.technicianId);

            if (techIds.length > 0) {
                // Fetch all technicians in the schedule
                const { data: techs } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name, color, google_calendar_color_id')
                    .in('id', techIds);

                if (techs && techs.length > 0) {
                    // 4a. Initials: Join all initials with " + "
                    const initialsArray = techs.map(t => {
                        const first = (t.first_name || '').trim().charAt(0).toUpperCase();
                        const last = (t.last_name || '').trim().charAt(0).toUpperCase();
                        return `${first}${last}` || '?';
                    });
                    techInitials = initialsArray.join(' + ');

                    // 4b. Color: Use the google_calendar_color_id of the first technician in the schedule list
                    const primaryTech = techs.find(t => (t as any).id === techIds[0]) || techs[0];

                    if (primaryTech.google_calendar_color_id) {
                        colorId = primaryTech.google_calendar_color_id;
                    } else if (primaryTech.color) {
                        colorId = mapHexToGoogleColor(primaryTech.color);
                    }
                }
            }

            // 5. Preparation & Formatting
            const serviceTypeMap: Record<string, string> = {
                'manutencao': 'Manutenção',
                'reparacao': 'Reparação',
                'assistencia': 'Assistência',
                'remota': 'Remota',
                'instalacao': 'Instalação',
                'calibracao': 'Calibração'
            };

            const typeLabel = serviceTypeMap[s.serviceType] || s.serviceType || 'Serviço';
            let formattedTitlePrefix = `${techInitials} - ${typeLabel} - ${equipInfo} - ${clientName}`;
            if (s.isCompleted) formattedTitlePrefix += ' (CONCLUÍDO)';

            const commonDescription = `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}${s.isCompleted ? '\nEstado: Concluído' : ''}`;

            const blocks = s.schedule_time_blocks || [];

            // 6. Handle Synchronization based on blocks
            if (blocks.length > 0) {
                console.log(`[SYNC] Schedule ${scheduleId} has ${blocks.length} blocks. Syncing individually.`);

                // If there were legacy single events, they should have been migrated or deleted by now.
                // We no longer check or update googleEventId on the schedules table.

                const results = [];
                for (let i = 0; i < blocks.length; i++) {
                    const b = blocks[i];
                    // If multiple blocks, add [1/N] [2/N] to distinguish
                    const blockTitle = blocks.length > 1 ? `${formattedTitlePrefix} [${i + 1}/${blocks.length}]` : formattedTitlePrefix;

                    const eventDetails = {
                        title: blockTitle,
                        description: commonDescription,
                        startTime: b.start_time,
                        endTime: b.end_time,
                        colorId: colorId
                    };

                    let blockEventId = (b as any).google_event_id;
                    if (blockEventId) {
                        const updated = await this.updateEvent(calendarId, blockEventId, eventDetails);
                        if (!updated) {
                            blockEventId = await this.createEvent(calendarId, eventDetails);
                        }
                    } else {
                        blockEventId = await this.createEvent(calendarId, eventDetails);
                    }

                    if (blockEventId && blockEventId !== (b as any).google_event_id) {
                        await supabase.from('schedule_time_blocks').update({ google_event_id: blockEventId }).eq('id', b.id);
                    }
                    results.push(blockEventId);
                }
                return results[0] || 'OK';
            } else {
                // FALLBACK: If no blocks exist, we don't sync anything to Google Calendar anymore.
                // This shouldn't happen with the current architecture where a default block is created.
                console.warn(`[SYNC] Schedule ${scheduleId} has no time blocks. Skipping sync.`);
                return null;
            }
        } catch (err) {
            console.error(`[SYNC] Severe error syncing schedule ${scheduleId}:`, err);
            return null;
        }
    },

    /**
     * Synchronizes all unsynced schedules to Google Calendar
     */
    async syncAllUnsynced(supabase: SupabaseClient, calendarId: string) {
        console.log('[SYNC] Starting full synchronization of unsynced schedules...');

        // Fetch schedules that are not synced OR have blocks that are not synced
        const { data: schedules, error } = await supabase
            .from('schedules')
            .select(`
                id, 
                schedule_time_blocks(google_event_id)
            `);

        if (error) {
            console.error('[SYNC] Error fetching schedules:', error);
            throw error;
        }

        const unsyncedSchedules = (schedules || []).filter(s => {
            // Unsynced if blocks exist but any block lacks an ID
            if (s.schedule_time_blocks && (s.schedule_time_blocks as any[]).length > 0) {
                return (s.schedule_time_blocks as any[]).some(b => !b.google_event_id);
            }
            return false;
        });

        console.log(`[SYNC] Found ${unsyncedSchedules.length} schedules to sync.`);

        let successCount = 0;
        let failCount = 0;

        for (const s of unsyncedSchedules) {
            const result = await this.syncSchedule(supabase, calendarId, s.id);
            if (result) successCount++;
            else failCount++;
        }

        return { successCount, failCount };
    },

    /**
     * Deletes all events from Google Calendar that are linked to schedules or blocks
     */
    async clearAllSyncedEvents(supabase: SupabaseClient, calendarId: string) {
        console.log('[SYNC] Starting full deletion of synced schedules from Google Calendar...');

        let successCount = 0;
        let failCount = 0;

        try {
            // 1. Clear individual blocks
            const { data: blocks, error: bError } = await supabase
                .from('schedule_time_blocks')
                .select('id, google_event_id')
                .not('google_event_id', 'is', null);

            if (bError) {
                console.error('[SYNC] Error fetching blocks:', bError);
            } else {
                const blocksToProcess = blocks || [];
                console.log(`[SYNC] Found ${blocksToProcess.length} blocks to clear.`);

                for (let i = 0; i < blocksToProcess.length; i++) {
                    const b = blocksToProcess[i];
                    if (b.google_event_id) {
                        process.stdout.write(`[SYNC] Deleting block ${i + 1}/${blocksToProcess.length}: ${b.google_event_id}... `);
                        const deleted = await this.deleteEvent(calendarId, b.google_event_id);
                        if (deleted) {
                            successCount++;
                            console.log('OK');
                        } else {
                            failCount++;
                            console.log('FAIL');
                        }
                    }
                    // Always clear the ID in database regardless of Google success
                    await supabase.from('schedule_time_blocks').update({ google_event_id: null }).eq('id', b.id);
                }
            }

            // 2. Main schedule records (legacy)
            // Attempt to clear legacy googleEventId if column still exists
            try {
                // Using any to avoid TS errors if column is being removed
                const { data: legacySchedules, error: lError } = await supabase
                    .from('schedules')
                    .select('id, googleEventId' as any)
                    .not('googleEventId' as any, 'is', null);

                if (!lError && legacySchedules && legacySchedules.length > 0) {
                    console.log(`[SYNC] Found ${legacySchedules.length} legacy schedules to clear.`);
                    for (let i = 0; i < legacySchedules.length; i++) {
                        const s = legacySchedules[i];
                        const gId = (s as any).googleEventId;
                        if (gId) {
                            process.stdout.write(`[SYNC] Deleting legacy ${i + 1}/${legacySchedules.length}: ${gId}... `);
                            const deleted = await this.deleteEvent(calendarId, gId);
                            if (deleted) {
                                successCount++;
                                console.log('OK');
                            } else {
                                failCount++;
                                console.log('FAIL');
                            }
                            await supabase.from('schedules').update({ googleEventId: null } as any).eq('id', (s as any).id);
                        }
                    }
                }
            } catch (legacyErr) {
                // Column probably doesn't exist
                console.log('[SYNC] Legacy column check skipped (likely already removed).');
            }

        } catch (err: any) {
            console.error('[SYNC] Severe error during full deletion:', err);
        }

        console.log(`[SYNC] Full deletion finished. Total success: ${successCount}, Total fail: ${failCount}`);
        return { successCount, failCount };
    }
};
