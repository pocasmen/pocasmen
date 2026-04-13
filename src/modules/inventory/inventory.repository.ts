import { pool } from '../../config/db';
import { QueryRunner } from '../../types/db.types';
import { Part } from '../../types/supabase';

export class InventoryRepository {
    async findById(id: number, db: QueryRunner): Promise<Part | null> {
        const { rows } = await db.query('SELECT * FROM parts WHERE id = $1', [id]);
        return rows[0] ?? null;
    }

    async findByReference(reference: string): Promise<Part | null> {
        const { rows } = await pool.query('SELECT * FROM parts WHERE reference = $1', [reference]);
        return rows[0] ?? null;
    }

    async findAll(db: QueryRunner, filters: { search?: string; page?: number; limit?: number } = {}) {
        const { search, page = 1, limit = 100 } = filters;
        const offset = (page - 1) * limit;

        let countQuery = 'SELECT COUNT(*) FROM parts';
        let dataQuery = 'SELECT * FROM parts ORDER BY designation ASC LIMIT $1 OFFSET $2';
        let countParams: any[] = [];
        let dataParams: any[] = [limit, offset];

        if (search) {
            countQuery = 'SELECT COUNT(*) FROM parts WHERE reference ILIKE $1 OR designation ILIKE $1';
            countParams = [`%${search}%`];
            dataQuery = 'SELECT * FROM parts WHERE reference ILIKE $3 OR designation ILIKE $3 ORDER BY designation ASC LIMIT $1 OFFSET $2';
            dataParams = [limit, offset, `%${search}%`];
        }

        const [countRes, dataRes] = await Promise.all([
            db.query(countQuery, countParams),
            db.query(dataQuery, dataParams),
        ]);

        return { data: dataRes.rows, total: parseInt(countRes.rows[0].count, 10) };
    }

    async getPartReservations(id: number): Promise<any[]> {
        const reservations: any[] = [];

        const { rows: directRows } = await pool.query(`
            SELECT sp.quantity, sp.stock_type, s.id as "scheduleId", s.title, s."startDate", c.name as "clientName"
            FROM schedule_parts sp
            JOIN schedules s ON sp."scheduleId" = s.id
            LEFT JOIN clients c ON s."clientId" = c.id
            WHERE sp."partId" = $1 AND s."isCompleted" = false
        `, [id]);

        directRows.forEach(row => reservations.push({
            scheduleId: row.scheduleId, title: row.title, startDate: row.startDate,
            clientName: row.clientName || 'Cliente Desconhecido',
            quantityReserved: row.quantity, stockType: row.stock_type, origin: 'Direta',
        }));

        const { rows: parents } = await pool.query(`
            SELECT pc.parent_part_id, pc.quantity, p.designation
            FROM part_components pc JOIN parts p ON pc.parent_part_id = p.id
            WHERE pc.child_part_id = $1
        `, [id]);

        for (const parent of parents) {
            const { rows: parentRows } = await pool.query(`
                SELECT sp.quantity, sp.stock_type, s.id as "scheduleId", s.title, s."startDate", c.name as "clientName"
                FROM schedule_parts sp
                JOIN schedules s ON sp."scheduleId" = s.id
                LEFT JOIN clients c ON s."clientId" = c.id
                WHERE sp."partId" = $1 AND s."isCompleted" = false
            `, [parent.parent_part_id]);

            parentRows.forEach(row => reservations.push({
                scheduleId: row.scheduleId, title: row.title, startDate: row.startDate,
                clientName: row.clientName || 'Cliente Desconhecido',
                quantityReserved: row.quantity * parent.quantity,
                stockType: row.stock_type, origin: `Via Kit: ${parent.designation}`,
            }));
        }

        return reservations;
    }

    async checkDependencies(id: number, db: QueryRunner) {
        const [scheRes, repRes, compRes, orderRes] = await Promise.all([
            db.query('SELECT 1 FROM schedule_parts WHERE "partId" = $1 LIMIT 1', [id]),
            db.query('SELECT 1 FROM report_parts WHERE "partId" = $1 LIMIT 1', [id]),
            db.query('SELECT 1 FROM part_components WHERE child_part_id = $1 LIMIT 1', [id]),
            db.query('SELECT 1 FROM parts_order_items WHERE part_id = $1 LIMIT 1', [id]),
        ]);
        return {
            hasSchedules: scheRes.rows.length > 0,
            hasReports: repRes.rows.length > 0,
            isComponentOfKit: compRes.rows.length > 0,
            hasOrders: orderRes.rows.length > 0,
        };
    }

    async delete(id: number, db: QueryRunner): Promise<boolean> {
        await db.query('DELETE FROM part_components WHERE parent_part_id = $1', [id]);
        const { rowCount } = await db.query('DELETE FROM parts WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    }

    async findHierarchy(parentId: number): Promise<any[]> {
        const { rows } = await pool.query(`
            WITH RECURSIVE component_hierarchy AS (
                SELECT parent_part_id, child_part_id, quantity, 1 as level FROM part_components WHERE parent_part_id = $1
                UNION ALL
                SELECT pc.parent_part_id, pc.child_part_id, pc.quantity, ch.level + 1
                FROM part_components pc INNER JOIN component_hierarchy ch ON pc.parent_part_id = ch.child_part_id WHERE ch.level < 10
            )
            SELECT ch.child_part_id as "partId", ch.quantity, ch.level, ch.parent_part_id, p.reference, p.designation
            FROM component_hierarchy ch LEFT JOIN parts p ON ch.child_part_id = p.id ORDER BY level, child_part_id
        `, [parentId]);
        return rows;
    }
}
