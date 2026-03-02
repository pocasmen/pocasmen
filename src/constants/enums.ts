export enum UserRole {
    SUPER_ADMIN = 'super_admin',
    ADMIN = 'admin',
    OFFICE_STAFF = 'office_staff',
    TECHNICIAN = 'technician',
    CLIENT = 'client',
    PENDING_CLIENT = 'pending_client'
}

export enum TicketStatus {
    OPEN = 'open',
    ACKNOWLEDGED = 'acknowledged',
    SCHEDULED = 'scheduled',
    CLOSED = 'closed',
    DELETED = 'deleted'
}

export enum ScheduleStatus {
    PENDING_SCHEDULING = 'pending_scheduling',
    PENDING = 'pending',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
    COMPLETED = 'completed'
}

export enum StockType {
    GENERAL = 'general',
    CONTRACT = 'contract',
    CLIENT = 'client',
    WARRANTY = 'warranty',
    FOSS = 'foss',
    MSD = 'msd'
}

export enum ServiceType {
    MANUTENCAO = 'Manutenção',
    REPARACAO = 'Reparação',
    ASSISTENCIA = 'Assistência',
    REMOTA = 'Remota',
    INSTALACAO = 'Instalação',
    CALIBRACAO = 'Calibração'
}

export enum ServiceClassification {
    GERAL = 'geral',
    CONTRATO = 'contrato',
    GARANTIA = 'garantia',
    OFERTA = 'oferta',
    FOSS = 'foss',
    MSD = 'msd'
}

export enum SchedulePriority {
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low'
}

export enum BillingStatus {
    PENDING_COMPLETION = 'pending_completion',
    REPORT_ISSUED = 'report_issued',
    READY_FOR_BILLING = 'ready_for_billing',
    BILLED = 'billed'
}
