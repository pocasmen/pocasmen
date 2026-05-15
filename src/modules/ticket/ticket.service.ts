import { pool, withTransactionAs } from '../../config/db';
import { supabase, ATTACHMENTS_BUCKET } from '../../config/supabase';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { TicketStatus } from '../../types';
import * as ticketService from '../../services/ticketService';
import { TicketRepository, TicketFilters } from './ticket.repository';

export class TicketService {
    constructor(private repo: TicketRepository) {}

    async getTickets(filters: TicketFilters) {
        return this.repo.findAll(pool, filters);
    }

    async getTicketById(id: number) {
        const ticket = await this.repo.findById(id, pool);
        if (!ticket) throw new NotFoundError('Ticket not found');

        const bucket = ATTACHMENTS_BUCKET;
        const enrichedAttachments = await Promise.all(
            (ticket.attachments || []).map(async (att: any) => {
                const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path || '', 3600);
                return { ...att, url: signed?.signedUrl || '' };
            })
        );

        return { ...ticket, attachments: enrichedAttachments };
    }

    async createTicket(data: any, userId: string) {
        return withTransactionAs(userId, (db) => ticketService.createFullTicket(db, data, userId));
    }

    async replyToTicket(ticketId: number, message: string, userId: string) {
        if (!message) throw new BadRequestError('Message is required');
        return withTransactionAs(userId, (db) => ticketService.replyToFullTicket(db, ticketId, userId, message));
    }

    async deleteTicket(ticketId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { rows, rowCount } = await db.query(
                'UPDATE tickets SET status = $1, "updatedAt" = $2 WHERE id = $3 RETURNING *',
                [TicketStatus.DELETED, new Date().toISOString(), ticketId]
            );
            if (rowCount === 0) throw new NotFoundError('Ticket not found');
            return rows[0];
        });
    }


    async markTicketAsRead(ticketId: number, userId: string) {
        await withTransactionAs(userId, (db) =>
            db.query(
                'UPDATE ticket_responses SET "isNew" = false WHERE ticket_id = $1 AND user_id != $2 AND "isNew" = true',
                [ticketId, userId]
            )
        );
    }

    async linkTicketToSchedule(ticketId: number, scheduleId: number, userId: string) {
        return withTransactionAs(userId, (db) => ticketService.linkTicketToSchedule(db, ticketId, scheduleId, userId));
    }

    async closeTicketDirectly(ticketId: number, message: string, userId: string) {
        return withTransactionAs(userId, (db) => ticketService.closeTicketDirectly(db, ticketId, userId, message));
    }

    async markAsExpress(ticketId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { rows, rowCount } = await db.query(
                'UPDATE tickets SET status = $1, "updatedAt" = $2 WHERE id = $3 AND status IN ($4, $5) RETURNING *',
                [TicketStatus.SCHEDULED, new Date().toISOString(), ticketId, TicketStatus.OPEN, TicketStatus.ACKNOWLEDGED]
            );
            if (rowCount === 0) throw new NotFoundError('Ticket not found or already processed');
            return rows[0];
        });
    }
}
