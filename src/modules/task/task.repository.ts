import { pool, withTransactionAs } from '../../config/db';
import { QueryRunner } from '../../types';

export class TaskRepository {
    async findAll(db: QueryRunner, options: { userId: string; role: string }): Promise<any[]> {
        const { userId, role } = options;
        const isAdmin = role === 'super_admin' || role === 'admin';

        const { rows } = await db.query(`
            SELECT
                t.*,
                COALESCE(json_build_object('first_name', ap.first_name, 'last_name', ap.last_name, 'color', ap.color), NULL) as assignee,
                COALESCE(json_build_object('first_name', cp.first_name, 'last_name', cp.last_name), NULL) as creator,
                COALESCE(json_build_object('first_name', up.first_name, 'last_name', up.last_name), NULL) as updater,
                NULLIF(TRIM(CONCAT(cp.first_name, ' ', cp.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(up.first_name, ' ', up.last_name)), '') as "updater_name",
                CASE WHEN c.id IS NOT NULL THEN json_build_object('name', c.name) ELSE NULL END as clients,
                CASE WHEN e.id IS NOT NULL THEN json_build_object('brand', e.brand, 'model', e.model, 'serialNumber', e."serialNumber") ELSE NULL END as equipments,
                COALESCE((SELECT json_agg(tb.*) FROM internal_task_time_blocks tb WHERE tb.task_id = t.id), '[]') as time_blocks
            FROM internal_tasks t
            LEFT JOIN profiles ap ON t.user_id = ap.id
            LEFT JOIN profiles cp ON t.created_by = cp.id
            LEFT JOIN profiles up ON t.updated_by = up.id
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t.equipment_id = e.id
            WHERE $1 = TRUE OR t.user_id = $2 OR t.created_by = $2 OR t.is_private = FALSE
            ORDER BY t.created_at DESC
        `, [isAdmin, userId]);

        return rows;
    }

    async findById(id: number, db: QueryRunner): Promise<any | null> {
        const { rows } = await db.query(`
            SELECT
                t.*,
                COALESCE(json_build_object('first_name', ap.first_name, 'last_name', ap.last_name, 'color', ap.color), NULL) as assignee,
                COALESCE(json_build_object('first_name', cp.first_name, 'last_name', cp.last_name), NULL) as creator,
                COALESCE(json_build_object('first_name', up.first_name, 'last_name', up.last_name), NULL) as updater,
                NULLIF(TRIM(CONCAT(cp.first_name, ' ', cp.last_name)), '') as "creator_name",
                NULLIF(TRIM(CONCAT(up.first_name, ' ', up.last_name)), '') as "updater_name",
                CASE WHEN c.id IS NOT NULL THEN json_build_object('name', c.name) ELSE NULL END as clients,
                CASE WHEN e.id IS NOT NULL THEN json_build_object('brand', e.brand, 'model', e.model, 'serialNumber', e."serialNumber") ELSE NULL END as equipments,
                COALESCE((SELECT json_agg(tb.*) FROM internal_task_time_blocks tb WHERE tb.task_id = t.id), '[]') as time_blocks
            FROM internal_tasks t
            LEFT JOIN profiles ap ON t.user_id = ap.id
            LEFT JOIN profiles cp ON t.created_by = cp.id
            LEFT JOIN profiles up ON t.updated_by = up.id
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN equipments e ON t.equipment_id = e.id
            WHERE t.id = $1
        `, [id]);

        return rows[0] ?? null;
    }

    async getStats(start: Date, end: Date, db: QueryRunner) {
        const { rows } = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE completed = true) as completed,
                COUNT(*) FILTER (WHERE completed = false) as pending
            FROM (
                SELECT t.id, t.completed
                FROM internal_tasks t
                LEFT JOIN internal_task_time_blocks tb ON t.id = tb.task_id
                WHERE (tb.start_time >= $1 AND tb.start_time <= $2)
                   OR (tb.id IS NULL AND t.created_at >= $1 AND t.created_at <= $2)
                GROUP BY t.id, t.completed
            ) as filtered_tasks
        `, [start.toISOString(), end.toISOString()]);

        return {
            total: parseInt(rows[0].total, 10),
            completed: parseInt(rows[0].completed, 10),
            pending: parseInt(rows[0].pending, 10),
        };
    }
}
