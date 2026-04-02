import { Pool, PoolClient } from 'pg';
import { QueryRunner } from '../../types/db.types';

export class ScheduleRepository {
    constructor(private pool: Pool) { }

    async findAll(options: { page?: number; limit?: number; includeCompleted?: boolean } = {}) {
        const { page = 1, limit = 200, includeCompleted = false } = options;
        const offset = (page - 1) * limit;

        const whereClause = includeCompleted ? '1=1' : '"isCompleted" = false';
        const countRes = await this.pool.query(`SELECT COUNT(*) FROM schedules WHERE ${whereClause}`);
        const total = parseInt(countRes.rows[0].count, 10);

        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                CONCAT(e.brand, ' ', e.model) as "equipmentModel",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', pa.designation, 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts,
                COALESCE(
                    (SELECT json_agg(json_build_object('start', tb.start_time, 'end', tb.end_time, 'googleEventId', tb.google_event_id) ORDER BY tb.start_time)
                     FROM schedule_time_blocks tb WHERE tb.schedule_id = s.id),
                    '[]'
                ) as "timeBlocks"
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            WHERE ${whereClause}
            ORDER BY s."startDate" ASC NULLS LAST
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return { data: rows, total };
    }

    async findById(id: number) {
        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                CONCAT(e.brand, ' ', e.model) as "equipmentModel",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', pa.designation, 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts,
                COALESCE(
                    (SELECT json_agg(json_build_object('start', tb.start_time, 'end', tb.end_time, 'googleEventId', tb.google_event_id) ORDER BY tb.start_time)
                     FROM schedule_time_blocks tb WHERE tb.schedule_id = s.id),
                    '[]'
                ) as "timeBlocks"
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            WHERE s.id = $1
        `, [id]);
        return rows[0] ?? null;
    }

    async findTasksForCalendar() {
        const { rows } = await this.pool.query(`
            SELECT t.*,
                c.name as "clientName",
                e.brand as "equipmentBrand",
                e.model as "equipmentModel",
                p.id as assignee_id,
                CONCAT(p.first_name, ' ', p.last_name) as assignee_name,
                p.color as assignee_color,
                COALESCE(
                    (SELECT json_agg(tb.*) FROM internal_task_time_blocks tb WHERE tb.task_id = t.id),
                    '[]'
                ) as internal_task_time_blocks
            FROM internal_tasks t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t.equipment_id = e.id
            LEFT JOIN profiles p ON t.user_id = p.id
            WHERE t.completed = false OR t.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY t.created_at DESC
        `);
        return rows;
    }

    async getStats(options: { startDate?: string; endDate?: string } = {}) {
        const { startDate, endDate } = options;
        const params: any[] = [];
        let dateFilter = '';

        if (startDate && endDate) {
            params.push(startDate, endDate);
            dateFilter = 'AND s."startDate" >= $1 AND s."startDate" <= $2';
        }

        const { rows } = await this.pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE "hasReport" = true) as "withReport",
                COUNT(*) FILTER (WHERE "hasReport" = false AND "isCompleted" = true) as completed,
                COUNT(*) FILTER (WHERE "hasReport" = false AND "isCompleted" = false AND "endDate" < NOW()) as overdue,
                COUNT(*) FILTER (WHERE "hasReport" = false AND "isCompleted" = true) as "pendingCompleted",
                COUNT(*) FILTER (WHERE "hasReport" = false AND "isCompleted" = false AND "endDate" < NOW()) as "pendingOverdue"
            FROM schedules s
            WHERE 1=1 ${dateFilter}
        `, params);

        return {
            total: parseInt(rows[0].total, 10),
            completed: parseInt(rows[0].completed, 10),
            withReport: parseInt(rows[0].withReport, 10),
            overdue: parseInt(rows[0].overdue, 10),
            pendingReportsCompleted: parseInt(rows[0].pendingCompleted, 10),
            pendingReportsOverdue: parseInt(rows[0].pendingOverdue, 10),
        };
    }

    async findWeeklySchedules(startDate: string, endDate: string) {
        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                e.model as "equipmentModel",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('start', tb.start_time, 'end', tb.end_time, 'googleEventId', tb.google_event_id) ORDER BY tb.start_time)
                     FROM schedule_time_blocks tb WHERE tb.schedule_id = s.id),
                    '[]'
                ) as "timeBlocks",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', pa.designation, 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            WHERE s."startDate" >= $1 AND s."startDate" <= $2
            ORDER BY s."startDate" ASC
        `, [startDate, endDate]);
        return rows;
    }

    async findPendingReports(startDate: string, endDate: string) {
        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                e.model as "equipmentModel",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('start', tb.start_time, 'end', tb.end_time, 'googleEventId', tb.google_event_id) ORDER BY tb.start_time)
                     FROM schedule_time_blocks tb WHERE tb.schedule_id = s.id),
                    '[]'
                ) as "timeBlocks",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', pa.designation, 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            WHERE s."hasReport" = false 
              AND (s."isCompleted" = true OR (s."isCompleted" = false AND s."endDate" < NOW()))
              AND s."startDate" >= $1 AND s."startDate" <= $2
            ORDER BY s."endDate" DESC NULLS LAST
        `, [startDate, endDate]);
        return rows;
    }

    async findByClientId(clientId: number, options: { page: number; limit: number }) {
        const { page, limit } = options;
        const offset = (page - 1) * limit;

        const [countRes, dataRes] = await Promise.all([
            this.pool.query('SELECT COUNT(*) FROM schedules WHERE "clientId" = $1', [clientId]),
            this.pool.query(`
                SELECT s.*, 
                    (EXISTS (SELECT 1 FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL)) as "hasReport",
                    CONCAT(e.brand, ' ', e.model, CASE WHEN e."serialNumber" IS NOT NULL THEN CONCAT(' (', e."serialNumber", ')') ELSE '' END) as "equipmentInfo",
                    COALESCE(
                        (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                         FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                        '[]'
                    ) as technicians,
                    COALESCE(
                        (SELECT r.signature IS NOT NULL AND r.signature != '' FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL LIMIT 1),
                        false
                    ) as "isSigned",
                    COALESCE(
                        (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', pa.designation, 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path))
                         FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                        '[]'
                    ) as parts
                FROM schedules s
                LEFT JOIN equipments e ON s."equipmentId" = e.id
                WHERE s."clientId" = $1
                ORDER BY s."startDate" DESC
                LIMIT $2 OFFSET $3
            `, [clientId, limit, offset]),
        ]);

        return { data: dataRes.rows, total: parseInt(countRes.rows[0].count, 10) };
    }

    async getClientStats(clientId: number) {
        const { rows } = await this.pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE "isCompleted" = false) as pending,
                COUNT(*) FILTER (WHERE "isCompleted" = true) as completed,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL)) as "withReport"
            FROM schedules s WHERE "clientId" = $1
        `, [clientId]);

        return {
            total: parseInt(rows[0].total, 10),
            pending: parseInt(rows[0].pending, 10),
            completed: parseInt(rows[0].completed, 10),
            withReport: parseInt(rows[0].withReport, 10),
        };
    }
}
