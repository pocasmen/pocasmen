import { QueryRunner } from '../../types/db.types';

export class TicketAttachmentRepository {
    async findByTicketId(ticketId: number, db: QueryRunner) {
        const query = 'SELECT * FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at DESC';
        const { rows } = await db.query(query, [ticketId]);
        return rows;
    }

    async findById(id: number, db: QueryRunner) {
        const query = 'SELECT * FROM ticket_attachments WHERE id = $1';
        const { rows } = await db.query(query, [id]);
        return rows[0] || null;
    }
}
