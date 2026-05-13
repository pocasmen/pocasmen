//Horas de desenvolvimento activo=3,5
import { EnrichedSchedule, ScheduleStatus, EnrichedPart, ServiceClassification } from '../types';
import { StockType } from '../constants/enums';
import * as scheduleService from '../services/scheduleService';

/**
 * Maps a raw schedule record from the database (potentially with joined relations) 
 * to the standardized EnrichedSchedule response format.
 * 
 * @param schedule The raw schedule object from DB
 * @param clientName The resolved client name
 * @param equipmentInfo The resolved equipment info string
 * @param techniciansList List of resolved technicians { id, name, color }
 * @param partsList List of parts associated with this schedule
 * @returns EnrichedSchedule
 */
export const mapScheduleDatabaseToResponse = (
    schedule: any,
    clientName: string,
    equipmentInfo: string,
    techniciansList: { id: string; name: string; color?: string }[],
    partsList: EnrichedPart[]
): EnrichedSchedule => {

    // Extract time blocks if they exist in the joined data
    const timeBlocks = (schedule.timeBlocks || schedule.time_blocks || schedule.schedule_blocks || schedule.schedule_time_blocks || []).map((tb: any) => ({
        id: tb.id,
        start: tb.start || tb.start_time,
        end: tb.end || tb.end_time
    }));

    return {
        id: schedule.id,
        title: schedule.title,
        startDate: schedule.startDate || undefined,
        endDate: schedule.endDate || undefined,

        // Status determination logic
        status: schedule.isCompleted
            ? ScheduleStatus.COMPLETED
            : (schedule.acknowledgementState as any || ScheduleStatus.PENDING),

        isCompleted: schedule.isCompleted || false,
        hasReport: schedule.hasReport || false,
        internalNotes: schedule.additionalInfo || undefined,

        // Service Type standardization
        serviceType: scheduleService.getServiceTypeKeys(schedule.serviceType),

        ticketId: schedule.ticketId || undefined,
        clientId: schedule.clientId,
        equipmentId: schedule.equipmentId,

        technicians: techniciansList,
        clientName: clientName,
        equipmentInfo: equipmentInfo,

        parts: partsList,

        acknowledgementState: schedule.acknowledgementState as any || undefined,
        includes_travel: schedule.includes_travel || false,
        classification: (schedule.classification as any) || 'geral',
        priority: (schedule.priority as any) || undefined,

        timeBlocks: timeBlocks,
    };
};

/**
 * Maps an internal task to the EnrichedSchedule format for calendar display.
 */
export const mapTaskToScheduleResponse = (
    task: any,
    clientName: string = '',
    equipmentInfo: string = '',
    technician: { id: string; name: string; color?: string } | null = null
): EnrichedSchedule => {
    const timeBlocks = (task.time_blocks || task.internal_task_time_blocks || []).map((tb: any) => ({
        id: tb.id,
        start: tb.start_time,
        end: tb.end_time
    }));

    const initials = technician ? technician.name.split(' ').map(n => n[0]).join('').toUpperCase() : '';
    const titlePrefix = initials ? `${initials} - ` : '';

    return {
        id: `task_${task.id}`, // Prefix to distinguish from regular schedules
        scheduleId: task.id,    // Store original ID
        title: `${titlePrefix}Tarefa - ${task.title}`,
        startDate: (() => {
            if (timeBlocks.length > 0) return timeBlocks[0].start;
            const createdDate = new Date(task.created_at);
            const day = createdDate.getDay();
            if (day === 0 || day === 6) {
                const daysToAdd = day === 6 ? 2 : 1;
                createdDate.setDate(createdDate.getDate() + daysToAdd);
                createdDate.setHours(0, 0, 0, 0);
            }
            return createdDate.toISOString();
        })(),
        endDate: (() => {
            if (timeBlocks.length > 0) return timeBlocks[timeBlocks.length - 1].end;
            const createdDate = new Date(task.created_at);
            const day = createdDate.getDay();
            if (day === 0 || day === 6) {
                const daysToAdd = day === 6 ? 2 : 1;
                createdDate.setDate(createdDate.getDate() + daysToAdd);
                createdDate.setHours(23, 59, 59, 999);
            } else {
                createdDate.setHours(createdDate.getHours() + 1);
            }
            return createdDate.toISOString();
        })(),
        status: task.completed ? ScheduleStatus.COMPLETED : ScheduleStatus.PENDING,
        isCompleted: !!task.completed,
        hasReport: false,
        internalNotes: task.description,
        serviceType: [task.type || 'other'],
        clientId: task.client_id,
        equipmentId: task.equipment_id,
        technicians: technician ? [technician] : [],
        clientName: clientName,
        equipmentInfo: equipmentInfo,
        parts: [],
        acknowledgementState: task.completed ? ScheduleStatus.COMPLETED : ScheduleStatus.ACCEPTED,
        includes_travel: false,
        classification: ServiceClassification.GERAL,
        priority: task.priority,
        isTask: true,
        timeBlocks: timeBlocks,
    };
};

export const mapTicketDatabaseToResponse = (
    ticket: any,
    clientName: string,
    equipmentInfo: string,
    userFirstName: string = '',
    userLastName: string = ''
) => {
    return {
        id: ticket.id,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        title: ticket.title,
        faultDescription: ticket.faultDescription,
        status: ticket.status,
        scheduleId: ticket.scheduleId,
        client_id: ticket.client_id,
        equipmentId: ticket.equipmentId,
        clientName,
        equipmentInfo,
        userFirstName,
        userLastName,
        created_by_user_id: ticket.created_by_user_id,
        responsible_technician_id: ticket.responsible_technician_id,
        scheduled_at: ticket.scheduled_at,
    };
};
