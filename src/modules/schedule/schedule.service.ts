import { pool, withTransactionAs } from '../../config/db';
import { supabase } from '../../config/supabase';
import { NotFoundError, InternalServerError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { mapScheduleDatabaseToResponse, mapTaskToScheduleResponse } from '../../utils/mappers';
import * as scheduleService from '../../services/scheduleService';
import * as inventoryService from '../../services/inventoryService';
import { TicketStatus } from '../../types';
import { Schedule, SchedulePart, ScheduleTechnician, Profile } from '../../types/supabase';
import { ScheduleRepository } from './schedule.repository';
import { eventEmitter } from '../../events/emitter';
import { SCHEDULE_EVENTS } from '../../events/events.constants';

export class ScheduleService {
    constructor(private repo: ScheduleRepository) {}

    async getSchedules(page: number, limit: number, includeCompleted?: boolean, clientId?: number, equipmentId?: number, isTask?: boolean, startDate?: string, endDate?: string) {
        let result: any[] = [];
        let schedulesTotal = 0;
        let tasksTotal = 0;

        // Fetch Agendamentos (Schedules)
        if (isTask === undefined || isTask === false) {
            const { data: schedulesRaw, total: sTotal } = await this.repo.findAll({ page, limit, includeCompleted, clientId, equipmentId, startDate, endDate });
            schedulesTotal = sTotal;
            result = schedulesRaw.map((s: any) => mapScheduleDatabaseToResponse(
                s,
                s.clientName || 'Cliente Desconhecido',
                s.equipmentModel || 'Modelo Desconhecido',
                s.technicians || [],
                s.parts || []
            ));
        }

        // Fetch Tarefas (Internal Tasks)
        if (isTask === undefined || isTask === true) {
            // Se o filtro for por equipamento, as tarefas internas normalmente não têm equipamento associado na mesma lógica
            // Mas para o calendário elas são buscadas. Se isTask for false (como no modal), saltamos isto.
            const tasksRaw = await this.repo.findTasksForCalendar(includeCompleted, startDate, endDate);
            tasksTotal = tasksRaw.length;
            
            // Filtrar tarefas por clientId/equipmentId se necessário (as tarefas têm esses campos?)
            let filteredTasks = tasksRaw;
            if (clientId) {
                filteredTasks = filteredTasks.filter((t: any) => t.client_id === clientId);
            }
            if (equipmentId) {
                filteredTasks = filteredTasks.filter((t: any) => t.equipment_id === equipmentId);
            }

            filteredTasks.forEach((task: any) => {
                const tech = task.assignee_id ? { id: task.assignee_id, name: task.assignee_name, color: task.assignee_color } : null;
                const clientName = task.clientName || 'Interno';
                const equipInfo = `${task.equipmentBrand || ''} ${task.equipmentModel || ''}`.trim() || 'N/A';
                result.push(mapTaskToScheduleResponse(task, clientName, equipInfo, tech));
            });
            tasksTotal = filteredTasks.length;
        }

        return { data: result, total: schedulesTotal + tasksTotal };
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
        const { technicianIds, startDate, endDate, ticketId } = data;

        const inserted = await withTransactionAs(userId, (db) =>
            scheduleService.createFullSchedule(db, data, userId)
        );

        eventEmitter.emit(SCHEDULE_EVENTS.CREATED, {
            scheduleId: inserted.id,
            technicianIds: technicianIds || [],
            startDate,
            endDate,
            ticketId,
            userId
        });

        return { ...inserted, serviceType: scheduleService.getServiceTypeKey(inserted.serviceType) };
    }

    async updateSchedule(scheduleId: number, data: any, userId: string) {
        const { startDate, endDate, technicianIds, isCompleted } = data;

        const result = await withTransactionAs(userId, (db) =>
            scheduleService.updateFullSchedule(db, scheduleId, data, userId)
        );

        eventEmitter.emit(SCHEDULE_EVENTS.UPDATED, {
            scheduleId,
            technicianIds: technicianIds || [],
            startDate,
            endDate,
            isCompleted: !!isCompleted,
            hasSignificantChanges: result.hasSignificantChanges,
            googleEventIdsToCleanup: result.googleEventIdsToCleanup,
            userId
        });

        return { ...result.updatedSchedule, serviceType: scheduleService.getServiceTypeKey(result.updatedSchedule.serviceType) };
    }

    async completeSchedule(scheduleId: number, data: any, userId: string) {
        const { startDate, endDate } = data;

        const result = await withTransactionAs(userId, (db) =>
            scheduleService.completeFullSchedule(db, scheduleId, data, userId)
        );

        eventEmitter.emit(SCHEDULE_EVENTS.COMPLETED, {
            scheduleId,
            startDate,
            endDate,
            googleEventIdsToCleanup: result.googleEventIdsToCleanup,
            userId
        });

        return { ...result.updated, serviceType: scheduleService.getServiceTypeKey(result.updated.serviceType) };
    }

    async deleteSchedule(scheduleId: number, userId: string) {
        const { techIds, schedule, googleEventIds } = await withTransactionAs(userId, async (db) => {
            const { rows: scheduleRows } = await db.query<Schedule & { client_name: string | null }>(
                'SELECT s.title, s."startDate", s."endDate", c.name as client_name FROM schedules s LEFT JOIN clients c ON s."clientId" = c.id WHERE s.id = $1',
                [scheduleId]
            );
            if (scheduleRows.length === 0) throw new NotFoundError('Schedule not found');
            const schedule = scheduleRows[0];

            const { rows: techIdsRows } = await db.query<ScheduleTechnician>('SELECT "technicianId" FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
            const techIds = techIdsRows.map(r => r.technicianId);

            const { rows: googleEventRows } = await db.query('SELECT google_event_id FROM schedule_time_blocks WHERE schedule_id = $1 AND google_event_id IS NOT NULL', [scheduleId]);
            const googleEventIds = googleEventRows.map(r => r.google_event_id).filter(Boolean);

            await db.query('DELETE FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
            const { rows: oldParts } = await db.query<SchedulePart>('SELECT "partId" FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
            const partIdsToSync = oldParts.map(p => p.partId);
            await db.query('DELETE FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);

            if (partIdsToSync.length > 0) await inventoryService.syncMultiplePartsReservations(db, partIdsToSync);
            await db.query('UPDATE tickets SET "scheduleId" = NULL, status = $1, "scheduled_at" = NULL WHERE "scheduleId" = $2', [TicketStatus.OPEN, scheduleId]);
            await db.query('DELETE FROM schedules WHERE id = $1', [scheduleId]);

            return { techIds, schedule, googleEventIds };
        });

        eventEmitter.emit(SCHEDULE_EVENTS.DELETED, {
            scheduleId,
            technicianIds: techIds,
            schedule,
            googleEventIds
        });
    }

    async fixScheduleTitles() {
        const { data: schedulesRaw, error } = await supabase.from('schedules').select('*').eq('title', 'Agendamento');
        if (error) throw new InternalServerError('Failed to fetch schedules to fix: ' + error.message);
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
