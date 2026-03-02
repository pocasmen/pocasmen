import { UserRole, TicketStatus, ScheduleStatus, StockType, ServiceClassification, SchedulePriority, BillingStatus } from '../constants/enums';

export { UserRole, TicketStatus, ScheduleStatus, StockType, ServiceClassification, SchedulePriority, BillingStatus };

export interface Profile {
    id: string;
    email: string;
    role: UserRole;
    first_name?: string;
    last_name?: string;
    color?: string;
    telegramchatid?: string;
    signature?: string;
    client_id?: number | null;
    daily_notifications_enabled?: boolean;
    notification_time?: string;
    phone?: string;
    google_calendar_color_id?: string;
}

export interface Client {
    id: number;
    name: string;
    address?: string;
    city?: string;
    postCode?: string;
    nif?: string;
}

export interface Equipment {
    id: number;
    brand: string;
    model: string;
    serialNumber: string;
    clientId: number;
}

export interface Part {
    id: number;
    reference: string;
    designation: string;
    description?: string;
    price?: number;
    stock_quantity: number;
    reserved_quantity: number;
    ordered_quantity: number;
    stock_quantity_foss: number;
    reserved_quantity_foss: number;
    ordered_quantity_foss: number;
    is_composed: boolean;
    virtual_stock?: number;
}

export interface PartComponent {
    parent_part_id: number;
    child_part_id: number;
    quantity: number;
}

export interface Schedule {
    id: number;
    title: string;
    startDate?: string;
    endDate?: string;
    status: ScheduleStatus;
    isCompleted: boolean;
    hasReport: boolean;
    clientId: number | null;
    equipmentId?: number | null;
    serviceType: string | string[];
    additionalInfo?: string;
    includes_travel: boolean;
    classification: ServiceClassification;
    priority?: SchedulePriority;
}

export interface ScheduleTechnician {
    scheduleId: number;
    technicianId: string;
}

export interface SchedulePart {
    scheduleId: number;
    partId: number;
    quantity: number;
}

export interface Ticket {
    id: number;
    createdAt: string;
    updatedAt: string;
    title: string;
    faultDescription: string;
    status: TicketStatus;
    scheduleId?: number | null;
    client_id: number;
    equipmentId: number;
    created_by_user_id: string;
}

export interface TicketAttachment {
    id: string;
    ticket_id: number;
    file_name: string;
    mime_type: string;
    storage_path: string;
    uploaded_by_user_id: string;
    created_at: string;
}

export interface TicketResponse {
    id: number;
    ticket_id: number;
    user_id: string;
    message: string;
    created_at: string;
    isNew: boolean;
}

export interface Report {
    id: number;
    report_number: string;
    clientId: number;
    equipmentId: number;
    scheduleId?: number | null;
    serviceDate: string;
    hours: number;
    parts: EnrichedPart[];
    description: string;
    damage?: string;
    serviceType: string[];
    internal_notes?: string;
    signature?: string;
    technician_signature?: string;
    includes_travel: boolean;
    classification: ServiceClassification;
    created_by?: string;
    deleted_at?: string;
    deleted_by?: string;
}

export interface EnrichedPart {
    id: number;
    reference: string;
    designation: string;
    quantity: number;
    isDesignationLocked?: boolean;
    stockType: StockType;
    isApplied?: boolean;
    stock_quantity?: number;
    reserved_quantity?: number;
    stock_quantity_foss?: number;
    reserved_quantity_foss?: number;
}

export interface TimeBlock {
    id: number;
    start: string;
    end: string;
}

export interface EnrichedSchedule extends Omit<Schedule, 'additionalInfo'> {
    internalNotes?: string;
    clientName: string;
    equipmentInfo: string;
    technicians: { id: string; name: string; color?: string }[];
    parts: EnrichedPart[];
    timeBlocks: TimeBlock[];
    ticketId?: number | null;
    acknowledgementState?: ScheduleStatus;
}

export interface ReportTechnician {
    reportId: number;
    technicianId: string;
    signature?: string;
}

export interface BillingTask {
    id: number;
    report_id: number;
    status: BillingStatus;
    assigned_role: UserRole;
    notes?: string;
    billing_notes?: string;
    billed_at?: string;
    created_at: string;
    updated_at: string;
}
