import { pool, withTransactionAs } from '../../config/db';
import { Equipment as DbEquipment, Ticket as DbTicket } from '../../types/supabase';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/ApiError';
import { TicketStatus } from '../../constants/enums';
import { ClientRepository } from '../client/client.repository';
import { TicketRepository } from '../ticket/ticket.repository';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { ReportRepository } from '../report/report.repository';
import { EquipmentRepository } from '../equipment/equipment.repository';
import * as ticketService from '../../services/ticketService';

export class ClientPortalService {
    constructor(
        private clientRepo: ClientRepository,
        private ticketRepo: TicketRepository,
        private scheduleRepo: ScheduleRepository,
        private reportRepo: ReportRepository,
        private equipmentRepo: EquipmentRepository
    ) {}

    async getValidatedClientId(userId: string, requestedClientId?: any): Promise<number> {
        if (!requestedClientId) throw new BadRequestError('É obrigatório selecionar uma empresa (clientId).');
        const clientId = Number(requestedClientId);
        if (isNaN(clientId)) throw new BadRequestError('clientId inválido.');

        const hasAccess = await this.clientRepo.validateAccess(userId, clientId);
        if (!hasAccess) throw new ForbiddenError('Não tem acesso a esta empresa.');
        
        return clientId;
    }

    async getMyCompanies(userId: string) {
        return this.clientRepo.findMyCompanies(userId);
    }

    async getMyStats(userId: string, requestedClientId?: any) {
        const clientId = await this.getValidatedClientId(userId, requestedClientId);

        const [tickets, schedules, reportsCount, equipmentsCount] = await Promise.all([
            this.ticketRepo.getClientStats(clientId),
            this.scheduleRepo.getClientStats(clientId),
            this.reportRepo.countByClientId(clientId),
            this.equipmentRepo.countByClientId(clientId)
        ]);

        return {
            tickets,
            schedules,
            reports: { total: reportsCount },
            equipments: { total: equipmentsCount }
        };
    }

    async getMyEquipments(userId: string, requestedClientId?: any) {
        const clientId = await this.getValidatedClientId(userId, requestedClientId);
        return this.equipmentRepo.findByClientId(clientId, pool);
    }

    async getMyTickets(userId: string, requestedClientId: any, page: number, limit: number) {
        const clientId = await this.getValidatedClientId(userId, requestedClientId);
        const { data, total } = await this.ticketRepo.findByClientId(clientId, { page, limit });
        return { data, total, page, limit };
    }

    async getMySchedules(userId: string, requestedClientId: any, page: number, limit: number) {
        const clientId = await this.getValidatedClientId(userId, requestedClientId);
        const { data, total } = await this.scheduleRepo.findByClientId(clientId, { page, limit });
        return { data, total, page, limit };
    }

    async getMyReports(userId: string, requestedClientId: any) {
        const clientId = await this.getValidatedClientId(userId, requestedClientId);
        return this.reportRepo.findByClientId(clientId);
    }

    async createMyTicket(data: any, userId: string, requestedClientId?: any, queryClientId?: any) {
        const { equipmentId } = data;
        const clientIdParam = requestedClientId || queryClientId;
        const clientId = await this.getValidatedClientId(userId, clientIdParam);

        return await withTransactionAs(userId, async (db) => {
            if (equipmentId) {
                const { rows: equipRows } = await db.query<DbEquipment>('SELECT * FROM equipments WHERE id = $1', [Number(equipmentId)]);
                const equipment = equipRows[0];
                if (!equipment || equipment.clientId !== clientId) throw new ForbiddenError('Permissão negada para este equipamento.');
            }
            return await ticketService.createFullTicket(db, { ...data, client_id: clientId }, userId);
        });
    }

    async getMyReportBySchedule(scheduleId: number, userId: string) {
        const report = await this.reportRepo.findByScheduleId(scheduleId);
        if (!report) throw new NotFoundError('Report not found.');
        await this.getValidatedClientId(userId, report.clientId);
        return report;
    }

    async getMyTicketById(ticketId: number, userId: string) {
        const ticket = await this.ticketRepo.findById(ticketId, pool);
        if (!ticket) throw new NotFoundError('Ticket not found.');
        
        await this.getValidatedClientId(userId, ticket.client_id);

        await withTransactionAs(userId, async (db) => {
            await db.query(
                'UPDATE ticket_responses SET "isNew" = false WHERE ticket_id = $1 AND user_id != $2 AND "isNew" = true',
                [ticketId, userId]
            );
        });

        return ticket;
    }

    async replyToMyTicket(ticketId: number, message: string, userId: string) {
        return await withTransactionAs(userId, async (db) => {
            const { rows: ticketRows } = await db.query<DbTicket>('SELECT client_id, status FROM tickets WHERE id = $1', [ticketId]);
            const ticket = ticketRows[0];
            if (!ticket) throw new ForbiddenError('Forbidden.');

            await this.getValidatedClientId(userId, ticket.client_id);

            if (ticket.status === TicketStatus.CLOSED) {
                throw new BadRequestError('Não é possível responder a um ticket fechado.');
            }

            return await ticketService.replyToFullTicket(db, ticketId, userId, message);
        });
    }

    async markTicketAsRead(ticketId: number, userId: string) {
        await withTransactionAs(userId, async (db) => {
            await db.query(
                'UPDATE ticket_responses SET "isNew" = false WHERE ticket_id = $1 AND user_id != $2 AND "isNew" = true',
                [ticketId, userId]
            );
        });
    }
    async signMyReport(reportId: number, userId: string) {
        return await withTransactionAs(userId, async (db) => {
            const report = await this.reportRepo.findById(reportId, db);
            if (!report) throw new NotFoundError('Relatório não encontrado.');

            // Validate access
            await this.getValidatedClientId(userId, report.clientId);

            // Get user profile signature
            const { rows: profileRows } = await db.query('SELECT signature, first_name, last_name FROM profiles WHERE id = $1', [userId]);
            const profile = profileRows[0];

            if (!profile || !profile.signature) {
                throw new BadRequestError('Não tem uma assinatura definida no seu perfil.');
            }

            // Update report
            await db.query(
                'UPDATE reports SET signature = $1, client_signer_name = $2 WHERE id = $3',
                [profile.signature, `${profile.first_name} ${profile.last_name}`, reportId]
            );

            return { success: true };
        });
    }

    async updateMyEquipmentNickname(equipmentId: number, nickname: string, userId: string) {
        return await withTransactionAs(userId, async (db) => {
            const equipment = await this.equipmentRepo.findById(equipmentId, db);
            if (!equipment) throw new NotFoundError('Equipamento não encontrado.');

            // Validate access to the client of this equipment
            await this.getValidatedClientId(userId, equipment.clientId);

            // Update only the nickname
            return await this.equipmentRepo.update(equipmentId, { nickname }, db);
        });
    }
}
