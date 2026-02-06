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
    PENDING = 'pending',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
    COMPLETED = 'completed'
}

export enum StockType {
    GENERAL = 'general',
    CONTRACT = 'contract',
    CLIENT = 'client',
    WARRANTY = 'warranty'
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
    OFERTA = 'oferta'
}

