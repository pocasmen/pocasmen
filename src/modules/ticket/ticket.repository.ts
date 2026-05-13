import { pool } from '../../config/db';
import { QueryRunner } from '../../types';
import { TicketStatus } from '../../types';

export interface TicketFilters {
    status?: string;
    page?: number;
    limit?: number;
}

export class TicketRepository {
    async findAll(db: QueryRunner, filters: TicketFilters = {}): Promise<{ data: any[]; total: number }> {
        const { status = TicketStatus.OPEN, page = 1, limit = 100 } = filters;
        const offset = (page - 1) * limit;

        const baseQuery = `
            FROM tickets t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t."equipmentId" = e.id
            LEFT JOIN profiles p ON t.created_by_user_id = p.id
        `;

        let whereClause = '';
        let params: any[] = [];

        if (status === 'all') {
            whereClause = 'WHERE t.status != $1';
            params = [TicketStatus.DELETED];
        } else if (status === TicketStatus.OPEN) {
            whereClause = 'WHERE t.status IN ($1, $2) AND t."scheduleId" IS NULL';
            params = [TicketStatus.OPEN, 'acknowledged'];
        } else {
            whereClause = 'WHERE t.status = $1';
            params = [status];
        }

        const countRes = await db.query(`SELECT COUNT(*) ${baseQuery} ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].count, 10);

        const { rows } = await db.query(
            `SELECT t.*, c.name as "clientName",
                CONCAT(
                    e.brand, ' ', e.model, 
                    CASE WHEN e."serialNumber" IS NOT NULL THEN CONCAT(' (', e."serialNumber", ')') ELSE '' END,
                    CASE WHEN e.nickname IS NOT NULL AND e.nickname != '' THEN CONCAT(' [', e.nickname, ']') ELSE '' END
                ) as "equipmentInfo",
                p.first_name as "userFirstName", p.last_name as "userLastName"
            ${baseQuery} ${whereClause}
            ORDER BY t."createdAt" DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return { data: rows, total };
    }

    async findById(id: number, db: QueryRunner): Promise<any | null> {
        const { rows } = await db.query(`
            SELECT t.*, c.name as "clientName", c.address as "clientAddress", c.nif as "clientNif", 
                c.is_blacklisted, c.blacklist_reason,
                CONCAT(
                    e.brand, ' ', e.model, 
                    CASE WHEN e."serialNumber" IS NOT NULL THEN CONCAT(' (', e."serialNumber", ')') ELSE '' END,
                    CASE WHEN e.nickname IS NOT NULL AND e.nickname != '' THEN CONCAT(' [', e.nickname, ']') ELSE '' END
                ) as "equipmentInfo",
                p.first_name as "userFirstName", p.last_name as "userLastName"
            FROM tickets t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t."equipmentId" = e.id
            LEFT JOIN profiles p ON t.created_by_user_id = p.id
            WHERE t.id = $1
        `, [id]);

        if (rows.length === 0) return null;
        const ticket = rows[0];

        const [attachmentsRes, responsesRes] = await Promise.all([
            db.query('SELECT * FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at DESC', [id]),
            db.query(`
                SELECT tr.*, CONCAT(p.first_name, ' ', p.last_name) as "authorName", p.role as "role"
                FROM ticket_responses tr
                LEFT JOIN profiles p ON tr.user_id = p.id
                WHERE tr.ticket_id = $1 ORDER BY tr.created_at DESC
            `, [id]),
        ]);

        ticket.attachments = attachmentsRes.rows;
        ticket.responses = responsesRes.rows;
        return ticket;
    }

    async getStats(db: QueryRunner) {
        const { rows } = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged')) as open,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                COUNT(*) FILTER (WHERE status = 'closed') as closed
            FROM tickets
        `);
        return {
            open: parseInt(rows[0].open, 10),
            scheduled: parseInt(rows[0].scheduled, 10),
            closed: parseInt(rows[0].closed, 10),
        };
    }

    /** Leituras sem transação — usam pool directamente. */
    async findByClientId(clientId: number, options: { page: number; limit: number }) {
        const { page, limit } = options;
        const offset = (page - 1) * limit;

        const [countRes, dataRes] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM tickets WHERE client_id = $1 AND status != $2', [clientId, TicketStatus.DELETED]),
            pool.query(`
                SELECT t.*,
                    CONCAT(
                        e.brand, ' ', e.model, 
                        CASE WHEN e."serialNumber" IS NOT NULL THEN CONCAT(' (', e."serialNumber", ')') ELSE '' END,
                        CASE WHEN e.nickname IS NOT NULL AND e.nickname != '' THEN CONCAT(' [', e.nickname, ']') ELSE '' END
                    ) as "equipmentInfo",
                    s."startDate", s."endDate", s."hasReport",
                    COALESCE(
                        (SELECT r.signature IS NOT NULL AND r.signature != '' FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL LIMIT 1),
                        false
                    ) as "isSigned"
                FROM tickets t
                LEFT JOIN equipments e ON t."equipmentId" = e.id
                LEFT JOIN schedules s ON t."scheduleId" = s.id
                WHERE t.client_id = $1 AND t.status != $2
                ORDER BY t."createdAt" DESC LIMIT $3 OFFSET $4
            `, [clientId, TicketStatus.DELETED, limit, offset]),
        ]);

        return { data: dataRes.rows, total: parseInt(countRes.rows[0].count, 10) };
    }

    async getClientStats(clientId: number) {
        const { rows } = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'open') as open,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                COUNT(*) FILTER (WHERE status = 'closed') as closed,
                COUNT(*) as total
            FROM tickets WHERE client_id = $1 AND status != $2
        `, [clientId, TicketStatus.DELETED]);

        return {
            open: parseInt(rows[0].open, 10),
            scheduled: parseInt(rows[0].scheduled, 10),
            closed: parseInt(rows[0].closed, 10),
            total: parseInt(rows[0].total, 10),
        };
    }
}
