//Horas de desenvolvimento activo=3,5
import { EnrichedSchedule, ScheduleStatus, EnrichedPart } from '../types';
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
    const timeBlocks = (schedule.schedule_blocks || schedule.schedule_time_blocks || []).map((tb: any) => ({
        id: tb.id,
        start: tb.start_time,
        end: tb.end_time
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
        serviceType: scheduleService.getServiceTypeKey(schedule.serviceType),

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

export const mapTicketDatabaseToResponse = (
    ticket: any,
    clientName: string,
    equipmentInfo: string
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
        created_by_user_id: ticket.created_by_user_id,
        responsible_technician_id: ticket.responsible_technician_id,
        scheduled_at: ticket.scheduled_at,
    };
};
