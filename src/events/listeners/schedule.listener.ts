import { eventEmitter } from '../emitter';
import { SCHEDULE_EVENTS, ScheduleCreatedPayload, ScheduleUpdatedPayload, ScheduleCompletedPayload } from '../events.constants';
import * as scheduleService from '../../services/scheduleService';
import { googleCalendarService } from '../../services/googleCalendarService';
import { broadcastCalendarUpdate, broadcastTicketUpdate } from '../../services/realtimeService';
import { sendTelegramNotification, escapeHTML } from '../../services/telegramService';
import { logger } from '../../utils/logger';
import { supabase } from '../../config/supabase';
import { pool } from '../../config/db';
import { Profile } from '../../types/supabase';

export function initScheduleListener() {
    // New Schedule Created
    eventEmitter.on(SCHEDULE_EVENTS.CREATED, async (payload: ScheduleCreatedPayload) => {
        try {
            const { scheduleId, technicianIds, startDate, endDate, ticketId } = payload;

            // 1. Telegram Notifications
            if (technicianIds?.length > 0) {
                await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds);
            }
            await scheduleService.sendScheduleNotificationToClients(supabase, scheduleId);

            // 2. Realtime Broadcasts
            broadcastCalendarUpdate(supabase, scheduleId);
            if (ticketId) {
                broadcastTicketUpdate(supabase, ticketId);
            }

            // 3. Google Calendar Sync
            if (startDate && endDate) {
                await googleCalendarService.syncScheduleWithSettings(supabase, scheduleId);
            }
        } catch (err) {
            logger.error(err, 'Error in ScheduleListener (CREATED)');
        }
    });

    // Schedule Updated
    eventEmitter.on(SCHEDULE_EVENTS.UPDATED, async (payload: ScheduleUpdatedPayload) => {
        try {
            const { scheduleId, technicianIds, startDate, endDate, isCompleted, hasSignificantChanges, googleEventIdsToCleanup } = payload;

            // 1. Google Calendar Sync & Cleanup
            await googleCalendarService.cleanupScheduleEvents(supabase, scheduleId, googleEventIdsToCleanup);
            if (startDate && endDate) {
                await googleCalendarService.syncScheduleWithSettings(supabase, scheduleId);
            }

            // 2. Telegram Notifications
            if (technicianIds?.length > 0 && !isCompleted && hasSignificantChanges) {
                await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds, true);
            }
            if (hasSignificantChanges && !isCompleted) {
                await scheduleService.sendScheduleNotificationToClients(supabase, scheduleId, true);
            }

            // 3. Realtime Broadcast
            broadcastCalendarUpdate(supabase, scheduleId);
        } catch (err) {
            logger.error(err, 'Error in ScheduleListener (UPDATED)');
        }
    });

    // Schedule Completed
    eventEmitter.on(SCHEDULE_EVENTS.COMPLETED, async (payload: ScheduleCompletedPayload) => {
        try {
            const { scheduleId, startDate, endDate, googleEventIdsToCleanup } = payload;

            // 1. Google Calendar Cleanup & Sync
            await googleCalendarService.cleanupScheduleEvents(supabase, scheduleId, googleEventIdsToCleanup);
            if (startDate && endDate) {
                await googleCalendarService.syncScheduleWithSettings(supabase, scheduleId);
            }

            // 2. Realtime Broadcast
            broadcastCalendarUpdate(supabase, scheduleId);
        } catch (err) {
            logger.error(err, 'Error in ScheduleListener (COMPLETED)');
        }
    });

    // Schedule Deleted
    eventEmitter.on(SCHEDULE_EVENTS.DELETED, async (payload: { scheduleId: number, technicianIds: string[], schedule: any, googleEventIds?: string[] }) => {
        try {
            const { scheduleId, technicianIds, schedule, googleEventIds } = payload;

            // 1. Google Calendar Cleanup
            await googleCalendarService.cleanupScheduleEvents(supabase, scheduleId, googleEventIds);

            // 2. Telegram Notifications
            try {
                const message = `❌ <b>Agendamento Cancelado</b>\n\n<b>Título:</b> ${escapeHTML(schedule.title || '')}\n<b>Cliente:</b> ${escapeHTML(schedule.client_name || 'Desconhecido')}\n\n<i>Este agendamento foi removido do sistema.</i>`;
                const { rows: profiles } = await pool.query<Profile>('SELECT telegramchatid FROM profiles WHERE id = ANY($1) OR role IN (\'admin\', \'super_admin\')', [technicianIds]);
                for (const p of profiles) {
                    if (p.telegramchatid) {
                        await sendTelegramNotification(message, p.telegramchatid);
                    }
                }
            } catch (notifErr) {
                logger.error(notifErr, 'Error sending delete notification');
            }

            // 3. Realtime Broadcast
            broadcastCalendarUpdate(supabase, scheduleId);
        } catch (err) {
            logger.error(err, 'Error in ScheduleListener (DELETED)');
        }
    });
}
