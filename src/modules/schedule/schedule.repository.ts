import { Pool, PoolClient } from 'pg';
import { QueryRunner } from '../../types';

export class ScheduleRepository {
    constructor(private pool: Pool) { }

    async findAll(options: { page?: number; limit?: number; includeCompleted?: boolean; clientId?: number; equipmentId?: number; isTask?: boolean; startDate?: string; endDate?: string } = {}) {
        const { page = 1, limit = 200, includeCompleted = false, clientId, equipmentId, isTask, startDate, endDate } = options;
        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        if (!includeCompleted) {
            whereConditions.push('s."isCompleted" = false');
        }

        if (clientId) {
            whereConditions.push(`s."clientId" = $${paramIndex++}`);
            queryParams.push(clientId);
        }

        if (equipmentId) {
            whereConditions.push(`s."equipmentId" = $${paramIndex++}`);
            queryParams.push(equipmentId);
        }

        let dateConditions = [];
        if (startDate) {
            dateConditions.push(`s."startDate" >= $${paramIndex++}`);
            queryParams.push(startDate);
        }

        if (endDate) {
            dateConditions.push(`s."startDate" <= $${paramIndex++}`);
            queryParams.push(endDate);
        }

        if (dateConditions.length > 0) {
            whereConditions.push(`((${dateConditions.join(' AND ')}) OR s."startDate" IS NULL OR s."acknowledgementState" = 'pending_scheduling')`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Count total
        const countRes = await this.pool.query(`SELECT COUNT(*) FROM schedules s ${whereClause}`, queryParams);
        const total = parseInt(countRes.rows[0].count, 10);

        // Principal Query
        const currentParams = [...queryParams];
        const limitIdx = paramIndex++;
        const offsetIdx = paramIndex++;
        currentParams.push(limit, offset);

        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                CONCAT(e.brand, ' ', e.model) as "equipmentModel",
                NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', COALESCE(NULLIF(sp.designation, ''), pa.designation), 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path, 'track_stock', pa.track_stock, 'stock_quantity', pa.stock_quantity, 'reserved_quantity', pa.reserved_quantity, 'stock_quantity_foss', pa.stock_quantity_foss, 'reserved_quantity_foss', pa.reserved_quantity_foss))
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
            LEFT JOIN profiles p_creator ON s.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON s.updated_by = p_updater.id
            ${whereClause}
            ORDER BY s."startDate" ASC NULLS LAST
            LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `, currentParams);

        return { data: rows, total };
    }

    async findById(id: number) {
        const { rows } = await this.pool.query(`
            SELECT s.*,
                c.name as "clientName",
                CONCAT(e.brand, ' ', e.model) as "equipmentModel",
                NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', p.id, 'name', CONCAT(p.first_name,' ',p.last_name), 'color', p.color))
                     FROM schedule_technicians st JOIN profiles p ON st."technicianId" = p.id WHERE st."scheduleId" = s.id),
                    '[]'
                ) as technicians,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', COALESCE(NULLIF(sp.designation, ''), pa.designation), 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path, 'track_stock', pa.track_stock, 'stock_quantity', pa.stock_quantity, 'reserved_quantity', pa.reserved_quantity, 'stock_quantity_foss', pa.stock_quantity_foss, 'reserved_quantity_foss', pa.reserved_quantity_foss))
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
            LEFT JOIN profiles p_creator ON s.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON s.updated_by = p_updater.id
            WHERE s.id = $1
        `, [id]);
        return rows[0] ?? null;
    }

    async findTasksForCalendar(includeCompleted: boolean = false, startDate?: string, endDate?: string) {
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        whereConditions.push('t.show_on_calendar = true');

        if (!includeCompleted) {
            whereConditions.push('t.completed = false');
        }

        if (startDate && endDate) {
            whereConditions.push(`
                EXISTS (SELECT 1 FROM internal_task_time_blocks tb WHERE tb.task_id = t.id AND tb.start_time >= $${paramIndex} AND tb.start_time <= $${paramIndex + 1})
            `);
            queryParams.push(startDate, endDate);
            paramIndex += 2;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : 'WHERE 1=1';

        const { rows } = await this.pool.query(`
            SELECT t.*,
                c.name as "clientName",
                e.brand as "equipmentBrand",
                e.model as "equipmentModel",
                p.id as assignee_id,
                CONCAT(p.first_name, ' ', p.last_name) as assignee_name,
                p.color as assignee_color,
                NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
                COALESCE(
                    (SELECT json_agg(tb.*) FROM internal_task_time_blocks tb WHERE tb.task_id = t.id),
                    '[]'
                ) as internal_task_time_blocks
            FROM internal_tasks t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t.equipment_id = e.id
            LEFT JOIN profiles p ON t.user_id = p.id
            LEFT JOIN profiles p_creator ON t.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON t.updated_by = p_updater.id
            ${whereClause}
            ORDER BY t.created_at DESC
        `, queryParams);
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
                NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
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
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', COALESCE(NULLIF(sp.designation, ''), pa.designation), 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path, 'track_stock', pa.track_stock, 'stock_quantity', pa.stock_quantity, 'reserved_quantity', pa.reserved_quantity, 'stock_quantity_foss', pa.stock_quantity_foss, 'reserved_quantity_foss', pa.reserved_quantity_foss))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            LEFT JOIN profiles p_creator ON s.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON s.updated_by = p_updater.id
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
                NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
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
                    (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', COALESCE(NULLIF(sp.designation, ''), pa.designation), 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path, 'track_stock', pa.track_stock, 'stock_quantity', pa.stock_quantity, 'reserved_quantity', pa.reserved_quantity, 'stock_quantity_foss', pa.stock_quantity_foss, 'reserved_quantity_foss', pa.reserved_quantity_foss))
                     FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                    '[]'
                ) as parts
            FROM schedules s
            LEFT JOIN clients c ON s."clientId" = c.id
            LEFT JOIN equipments e ON s."equipmentId" = e.id
            LEFT JOIN profiles p_creator ON s.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON s.updated_by = p_updater.id
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
                    NULLIF(TRIM(CONCAT(p_creator.first_name, ' ', p_creator.last_name)), '') as "creator_name",
                    NULLIF(TRIM(CONCAT(p_updater.first_name, ' ', p_updater.last_name)), '') as "updater_name",
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
                        (SELECT json_agg(json_build_object('id', pa.id, 'reference', pa.reference, 'designation', COALESCE(NULLIF(sp.designation, ''), pa.designation), 'quantity', sp.quantity, 'stockType', sp.stock_type, 'image_path', pa.image_path, 'track_stock', pa.track_stock, 'stock_quantity', pa.stock_quantity, 'reserved_quantity', pa.reserved_quantity, 'stock_quantity_foss', pa.stock_quantity_foss, 'reserved_quantity_foss', pa.reserved_quantity_foss))
                         FROM schedule_parts sp JOIN parts pa ON sp."partId" = pa.id WHERE sp."scheduleId" = s.id),
                        '[]'
                    ) as parts
                FROM schedules s
                LEFT JOIN equipments e ON s."equipmentId" = e.id
                LEFT JOIN profiles p_creator ON s.created_by = p_creator.id
                LEFT JOIN profiles p_updater ON s.updated_by = p_updater.id
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

    async getBacklogStats() {
        const result = await this.pool.query(`
            SELECT
                -- Backlog actual
                COUNT(*) FILTER (WHERE "isCompleted" = false AND ("acknowledgementState" = 'pending_scheduling' OR "startDate" IS NULL))::integer AS total,
                COUNT(*) FILTER (WHERE "isCompleted" = false AND ("acknowledgementState" = 'pending_scheduling' OR "startDate" IS NULL) AND entered_backlog_at >= NOW() - INTERVAL '7 days')::integer AS created_last_7_days,
                COUNT(*) FILTER (WHERE "isCompleted" = false AND ("acknowledgementState" = 'pending_scheduling' OR "startDate" IS NULL) AND entered_backlog_at >= NOW() - INTERVAL '14 days' AND entered_backlog_at < NOW() - INTERVAL '7 days')::integer AS created_previous_7_days,
                MIN(entered_backlog_at) FILTER (WHERE "isCompleted" = false AND ("acknowledgementState" = 'pending_scheduling' OR "startDate" IS NULL)) AS oldest_created_at,
                -- Saídas reais do backlog (exited_backlog_at é preenchido apenas quando sai do backlog)
                COUNT(*) FILTER (WHERE exited_backlog_at >= NOW() - INTERVAL '7 days')::integer AS exited_last_7_days,
                COUNT(*) FILTER (WHERE exited_backlog_at >= NOW() - INTERVAL '14 days' AND exited_backlog_at < NOW() - INTERVAL '7 days')::integer AS exited_previous_7_days,
                -- Tempo médio em backlog (em horas), apenas registos que já saíram
                AVG(EXTRACT(EPOCH FROM (exited_backlog_at - entered_backlog_at)) / 3600.0) FILTER (WHERE exited_backlog_at IS NOT NULL AND entered_backlog_at IS NOT NULL)::numeric(10,1) AS avg_hours_in_backlog
            FROM schedules
        `);

        const b = result.rows[0];

        return {
            total: parseInt(b.total, 10) || 0,
            createdLast7Days: parseInt(b.created_last_7_days, 10) || 0,
            createdPrevious7Days: parseInt(b.created_previous_7_days, 10) || 0,
            oldestCreatedAt: b.oldest_created_at || null,
            exitedLast7Days: parseInt(b.exited_last_7_days, 10) || 0,
            exitedPrevious7Days: parseInt(b.exited_previous_7_days, 10) || 0,
            avgHoursInBacklog: b.avg_hours_in_backlog ? parseFloat(b.avg_hours_in_backlog) : null,
        };
    }
}
