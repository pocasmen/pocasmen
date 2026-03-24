import { pool, withTransactionAs } from '../../config/db';
import { supabase } from '../../config/supabase';
import { NotFoundError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { mapScheduleDatabaseToResponse, mapTaskToScheduleResponse } from '../../utils/mappers';
import * as scheduleService from '../../services/scheduleService';
import * as inventoryService from '../../services/inventoryService';
import { broadcastCalendarUpdate } from '../../services/realtimeService';
import { googleCalendarService } from '../../services/googleCalendarService';
import { sendTelegramNotification } from '../../services/telegramService';
import { TicketStatus } from '../../types';
import { Schedule, SchedulePart, ScheduleTechnician, Profile } from '../../types/supabase';
import { ScheduleRepository } from './schedule.repository';

export class ScheduleService {
    constructor(private repo: ScheduleRepository) {}

    async getSchedules(page: number, limit: number, includeCompleted?: boolean) {
        const { data: schedulesRaw, total: schedulesTotal } = await this.repo.findAll({ page, limit, includeCompleted });

        const result = schedulesRaw.map((s: any) => mapScheduleDatabaseToResponse(
            s,
            s.clientName || 'Cliente Desconhecido',
            s.equipmentModel || 'Modelo Desconhecido',
            s.technicians || [],
            s.parts || []
        ));

        const tasksRaw = await this.repo.findTasksForCalendar();
        tasksRaw.forEach((task: any) => {
            const tech = task.assignee_id ? { id: task.assignee_id, name: task.assignee_name, color: task.assignee_color } : null;
            const clientName = task.clientName || 'Interno';
            const equipInfo = `${task.equipmentBrand || ''} ${task.equipmentModel || ''}`.trim() || 'N/A';
            result.push(mapTaskToScheduleResponse(task, clientName, equipInfo, tech));
        });

        return { data: result, total: schedulesTotal + tasksRaw.length };
    }

    async getScheduleById(id: number) {
        const schedule = await this.repo.findById(id);
        if (!schedule) throw new NotFoundError('Schedule not found');

        return mapScheduleDatabaseToResponse(
            schedule,
            schedule.clientName || 'Cliente Desconhecido',
            schedule.equipmentModel || 'Modelo Desconhecido',
            schedule.technicians || [],
            schedule.parts || []
        );
    }

    async createSchedule(data: any, userId: string) {
        const { technicianIds, startDate, endDate } = data;

        const inserted = await withTransactionAs(userId, (db) =>
            scheduleService.createFullSchedule(db, data)
        );

        const scheduleId = inserted.id;
        if (technicianIds?.length > 0) {
            await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds);
        }

        broadcastCalendarUpdate(supabase, scheduleId);

        const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
        const isSyncEnabled = await scheduleService.isGoogleSyncEnabled(supabase);
        if (googleCalendarId && isSyncEnabled && startDate && endDate) {
            googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId)
                .catch(err => logger.error(err, '[SYNC ERROR] Google Calendar sync failed'));
        }

        return { ...inserted, serviceType: scheduleService.getServiceTypeKey(inserted.serviceType) };
    }

    async updateSchedule(scheduleId: number, data: any, userId: string) {
        const { startDate, endDate, technicianIds, isCompleted } = data;

        const result = await withTransactionAs(userId, (db) =>
            scheduleService.updateFullSchedule(db, scheduleId, data)
        );

        const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
        if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
            await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId, result.googleEventIdsToCleanup).catch(err => logger.error(err));
            if (startDate && endDate) await googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
        }

        if (technicianIds?.length > 0 && !isCompleted && result.hasSignificantChanges) {
            await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds, true);
        }

        broadcastCalendarUpdate(supabase, scheduleId);
        return { ...result.updatedSchedule, serviceType: scheduleService.getServiceTypeKey(result.updatedSchedule.serviceType) };
    }

    async completeSchedule(scheduleId: number, data: any, userId: string) {
        const { startDate, endDate } = data;

        const result = await withTransactionAs(userId, (db) =>
            scheduleService.completeFullSchedule(db, scheduleId, data)
        );

        const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
        if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
            await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId, result.googleEventIdsToCleanup).catch(err => logger.error(err));
            if (startDate && endDate) await googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
        }

        broadcastCalendarUpdate(supabase, scheduleId);
        return { ...result.updated, serviceType: scheduleService.getServiceTypeKey(result.updated.serviceType) };
    }

    async deleteSchedule(scheduleId: number, userId: string) {
        await withTransactionAs(userId, async (db) => {
            const { rows: scheduleRows } = await db.query<Schedule & { client_name: string | null }>(
                'SELECT s.title, s."startDate", s."endDate", c.name as client_name FROM schedules s LEFT JOIN clients c ON s."clientId" = c.id WHERE s.id = $1',
                [scheduleId]
            );
            if (scheduleRows.length === 0) throw new NotFoundError('Schedule not found');
            const schedule = scheduleRows[0];

            const { rows: techIdsRows } = await db.query<ScheduleTechnician>('SELECT "technicianId" FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
            const techIds = techIdsRows.map(r => r.technicianId);

            if (process.env.GOOGLE_CALENDAR_ID && await scheduleService.isGoogleSyncEnabled(supabase)) {
                await googleCalendarService.deleteScheduleEvents(supabase, process.env.GOOGLE_CALENDAR_ID, scheduleId).catch(err => logger.error(err));
            }

            await db.query('DELETE FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
            const { rows: oldParts } = await db.query<SchedulePart>('SELECT "partId" FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
            const partIdsToSync = oldParts.map(p => p.partId);
            await db.query('DELETE FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);

            if (partIdsToSync.length > 0) await inventoryService.syncMultiplePartsReservations(db, partIdsToSync);
            await db.query('UPDATE tickets SET "scheduleId" = NULL, status = $1, "scheduled_at" = NULL WHERE "scheduleId" = $2', [TicketStatus.OPEN, scheduleId]);
            await db.query('DELETE FROM schedules WHERE id = $1', [scheduleId]);

            try {
                const message = `❌ *Agendamento Cancelado*\n\n*Título:* ${schedule.title}\n*Cliente:* ${schedule.client_name || 'Desconhecido'}\n\n_Este agendamento foi removido do sistema._`;
                const { rows: profiles } = await db.query<Profile>('SELECT telegramchatid FROM profiles WHERE id = ANY($1) OR role = \'admin\'', [techIds]);
                for (const p of profiles) if (p.telegramchatid) await sendTelegramNotification(message, p.telegramchatid);
            } catch (notifErr) { logger.error(notifErr); }
        });

        broadcastCalendarUpdate(supabase, scheduleId);
    }

    async fixScheduleTitles() {
        const { data: schedulesRaw, error } = await supabase.from('schedules').select('*').eq('title', 'Agendamento');
        if (error) throw new Error('Failed to fetch schedules to fix: ' + error.message);
        if (!schedulesRaw || schedulesRaw.length === 0) return { message: 'No schedules found with title "Agendamento".', totalFound: 0, fixed: 0 };

        let fixedCount = 0;
        for (const schedule of schedulesRaw) {
            if (!schedule.clientId || !schedule.equipmentId) continue;
            const newTitle = await scheduleService.generateScheduleTitle(supabase, schedule.clientId, schedule.equipmentId, schedule.serviceType as any);
            if (newTitle && newTitle !== 'Agendamento') {
                await supabase.from('schedules').update({ title: newTitle }).eq('id', schedule.id);
                fixedCount++;
            }
        }
        return { message: 'Schedule titles fixed successfully', totalFound: schedulesRaw.length, fixed: fixedCount };
    }
}
