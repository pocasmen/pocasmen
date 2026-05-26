//Horas de desenvolvimento activo=28,5
import { SupabaseClient } from '@supabase/supabase-js';
import { pool } from '../config/db';
import { getCalendarClient } from '../utils/googleAuth';
import { logger } from '../utils/logger';
import { formatServiceType } from './scheduleService';
import { Database } from '../types/db.types';
import { Profile as DbProfile } from '../types/supabase';

const calendar = getCalendarClient();

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
                logger.warn('[GOOGLE CALENDAR] No Calendar ID provided. Skipping sync.');
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

            logger.info({ eventId: response.data.id }, `[GOOGLE CALENDAR] Event created`);
            return response.data.id;
        } catch (error) {
            logger.error(error, '[GOOGLE CALENDAR] Error creating event:');
            return null;
        }
    },

    /**
     * Update an existing event in Google Calendar
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
                logger.warn('[GOOGLE CALENDAR] Missing Calendar ID or Event ID. Skipping update.');
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

            logger.info({ eventId }, `[GOOGLE CALENDAR] Event updated`);
            return true;
        } catch (error: any) {
            if (error.code === 404 || error.code === 410) {
                logger.warn({ eventId }, `[GOOGLE CALENDAR] Event not found in Google. It may have been deleted manually.`);
                return false;
            }
            logger.error(error, '[GOOGLE CALENDAR] Error updating event:');
            return false;
        }
    },

    /**
     * Delete an event from Google Calendar
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

            logger.info({ eventId }, `[GOOGLE CALENDAR] Event deleted`);
            return true;
        } catch (error: any) {
            if (error.code === 404 || error.code === 410) return true; // Already gone
            logger.error(error, '[GOOGLE CALENDAR] Error deleting event:');
            return false;
        }
    },

    /**
     * Delete all Google Calendar events associated with a schedule
     */
    async deleteScheduleEvents(supabase: SupabaseClient<Database>, calendarId: string, scheduleId: number, specificEventIds?: string[]) {
        try {
            let eventIdsToClear = specificEventIds || [];

            if (eventIdsToClear.length === 0) {
                const { data: blocks } = await supabase
                    .from('schedule_time_blocks')
                    .select('google_event_id')
                    .eq('schedule_id', scheduleId)
                    .not('google_event_id', 'is', null);

                eventIdsToClear = (blocks || []).map(b => b.google_event_id).filter((id): id is string => !!id);
            }

            for (const eventId of eventIdsToClear) {
                await this.deleteEvent(calendarId, eventId);
            }

            return true;
        } catch (err) {
            logger.error(err, `[SYNC] Error deleting schedule events for ${scheduleId}:`);
            return false;
        }
    },

    /**
     * Unified function to sync a single schedule to Google Calendar.
     */
    async syncSchedule(supabase: SupabaseClient<Database>, calendarId: string, scheduleId: number) {
        try {
            if (!calendarId) return null;

            const { data: sRaw, error: sErr } = await supabase
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

            if (sErr || !sRaw) {
                logger.error(sErr, `[SYNC] Error fetching schedule ${scheduleId}:`);
                return null;
            }
            const s = sRaw as any; // Nested objects

            let clientName = 'Cliente Desconhecido';
            if (s.clientId) {
                const { rows } = await pool.query('SELECT name FROM clients WHERE id = $1', [s.clientId]);
                if (rows[0]?.name) clientName = rows[0].name;
            }

            let equipInfo = 'Modelo Desconhecido';
            if (s.equipmentId) {
                const { rows } = await pool.query('SELECT model FROM equipments WHERE id = $1', [s.equipmentId]);
                if (rows[0]?.model) equipInfo = rows[0].model;
            }

            let colorId = '9';
            let techInitials = '??';
            const techIds = (s.schedule_technicians || []).map((t: any) => t.technicianId);

            if (techIds.length > 0) {
                const { rows: typedTechs } = await pool.query<DbProfile>(
                    `SELECT id, first_name, last_name, color, google_calendar_color_id FROM profiles WHERE id = ANY($1)`,
                    [techIds]
                );

                if (typedTechs.length > 0) {
                    const initialsArray = typedTechs.map((t: DbProfile) => {
                        const first = (t.first_name || '').trim().charAt(0).toUpperCase();
                        const last = (t.last_name || '').trim().charAt(0).toUpperCase();
                        return `${first}${last}` || '?';
                    });
                    techInitials = initialsArray.join(' + ');

                    const primaryTech = typedTechs.find((t: DbProfile) => t.id === techIds[0]) || typedTechs[0];

                    if (primaryTech.google_calendar_color_id) {
                        colorId = primaryTech.google_calendar_color_id;
                    } else if (primaryTech.color) {
                        colorId = mapHexToGoogleColor(primaryTech.color);
                    }
                }
            }

            const typeLabel = formatServiceType(s.serviceType);
            let formattedTitlePrefix = `${techInitials} - ${typeLabel} - ${equipInfo} - ${clientName}`;
            if (s.isCompleted) formattedTitlePrefix += ' (CONCLUÍDO)';

            const commonDescription = `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}${s.isCompleted ? '\nEstado: Concluído' : ''}`;

            const blocks = s.schedule_time_blocks || [];

            if (blocks.length > 0) {
                logger.info({ scheduleId, blockCount: blocks.length }, `[SYNC] Syncing schedule blocks`);

                const results = [];
                for (let i = 0; i < blocks.length; i++) {
                    const b = blocks[i];
                    const blockTitle = blocks.length > 1 ? `${formattedTitlePrefix} [${i + 1}/${blocks.length}]` : formattedTitlePrefix;

                    const eventDetails = {
                        title: blockTitle,
                        description: commonDescription,
                        startTime: b.start_time,
                        endTime: b.end_time,
                        colorId: colorId
                    };

                    let blockEventId = b.google_event_id;
                    if (blockEventId) {
                        const updated = await this.updateEvent(calendarId, blockEventId, eventDetails);
                        if (!updated) {
                            blockEventId = await this.createEvent(calendarId, eventDetails);
                        }
                    } else {
                        blockEventId = await this.createEvent(calendarId, eventDetails);
                    }

                    if (blockEventId && blockEventId !== b.google_event_id) {
                        await supabase.from('schedule_time_blocks').update({ google_event_id: blockEventId }).eq('id', b.id);
                    }
                    results.push(blockEventId);
                }
                return results[0] || 'OK';
            } else {
                logger.warn({ scheduleId }, `[SYNC] Schedule has no time blocks. Skipping sync.`);
                return null;
            }
        } catch (err) {
            logger.error(err, `[SYNC] Severe error syncing schedule ${scheduleId}:`);
            return null;
        }
    },

    /**
     * Synchronizes all unsynced schedules to Google Calendar
     */
    async syncAllUnsynced(supabase: SupabaseClient<Database>, calendarId: string) {
        logger.info('[SYNC] Starting full synchronization of unsynced schedules...');

        const { data: schedules, error } = await supabase
            .from('schedules')
            .select(`
                id, 
                schedule_time_blocks(google_event_id)
            `);

        if (error) {
            logger.error(error, '[SYNC] Error fetching schedules:');
            throw error;
        }

        const unsyncedSchedules = (schedules || []).filter(s => {
            if (s.schedule_time_blocks && (s.schedule_time_blocks as any[]).length > 0) {
                return (s.schedule_time_blocks as any[]).some(b => !b.google_event_id);
            }
            return false;
        });

        logger.info({ count: unsyncedSchedules.length }, `[SYNC] Found schedules to sync.`);

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
    async clearAllSyncedEvents(supabase: SupabaseClient<Database>, calendarId: string) {
        logger.info('[SYNC] Starting full deletion of synced schedules from Google Calendar...');

        let successCount = 0;
        let failCount = 0;

        try {
            const { data: blocks, error: bError } = await supabase
                .from('schedule_time_blocks')
                .select('id, google_event_id')
                .not('google_event_id', 'is', null);

            if (bError) {
                logger.error(bError, '[SYNC] Error fetching blocks:');
            } else {
                const blocksToProcess = blocks || [];
                logger.info({ count: blocksToProcess.length }, `[SYNC] Found blocks to clear.`);

                for (let i = 0; i < blocksToProcess.length; i++) {
                    const b = blocksToProcess[i];
                    if (b.google_event_id) {
                        logger.info({ blockIndex: i + 1, total: blocksToProcess.length, googleId: b.google_event_id }, `[SYNC] Deleting block`);
                        const deleted = await this.deleteEvent(calendarId, b.google_event_id);
                        if (deleted) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    }
                    await supabase.from('schedule_time_blocks').update({ google_event_id: null }).eq('id', b.id);
                }
            }
        } catch (err: any) {
            logger.error(err, '[SYNC] Severe error during full deletion:');
        }

        logger.info({ successCount, failCount }, `[SYNC] Full deletion finished.`);
        return { successCount, failCount };
    }
};
