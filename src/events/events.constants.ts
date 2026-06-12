export const SCHEDULE_EVENTS = {
    CREATED: 'schedule.created',
    UPDATED: 'schedule.updated',
    COMPLETED: 'schedule.completed',
    DELETED: 'schedule.deleted',
};

export interface ScheduleCreatedPayload {
    scheduleId: number;
    technicianIds: string[];
    startDate?: string;
    endDate?: string;
    ticketId?: number;
    userId: string;
}

export interface ScheduleUpdatedPayload {
    scheduleId: number;
    technicianIds: string[];
    startDate?: string;
    endDate?: string;
    isCompleted: boolean;
    hasSignificantChanges: boolean;
    googleEventIdsToCleanup: string[];
    userId: string;
}

export interface ScheduleCompletedPayload {
    scheduleId: number;
    startDate?: string;
    endDate?: string;
    googleEventIdsToCleanup: string[];
    userId: string;
}
