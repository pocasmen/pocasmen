import { pool } from '../../config/db';
import { QueryRunner } from '../../types/db.types';

export class ProfileRepository {
    async findTechnicians(db: QueryRunner): Promise<any[]> {
        const { rows } = await db.query(`
            SELECT *, CONCAT(first_name, ' ', last_name) as name
            FROM profiles
            WHERE role IN ('technician', 'admin', 'office_staff', 'super_admin')
            ORDER BY first_name ASC
        `);
        return rows;
    }

    async findExternalUsers(db: QueryRunner): Promise<any[]> {
        const { rows } = await db.query(`
            SELECT
                p.*,
                CONCAT(p.first_name, ' ', p.last_name) as name,
                COALESCE(
                    (SELECT json_agg(json_build_object('client_id', cu.client_id, 'name', c.name))
                     FROM client_users cu
                     JOIN clients c ON cu.client_id = c.id
                     WHERE cu.user_id = p.id),
                    '[]'
                ) as client_users
            FROM profiles p
            WHERE p.role = 'client'
            ORDER BY p.first_name ASC
        `);
        return rows;
    }

    async findById(id: string, db: QueryRunner): Promise<any | null> {
        const { rows } = await db.query(
            `SELECT *, CONCAT(first_name, ' ', last_name) as name FROM profiles WHERE id = $1`,
            [id]
        );
        return rows[0] ?? null;
    }

    async findByTelegramChatId(chatId: string, db: QueryRunner): Promise<any | null> {
        const { rows } = await db.query(
            `SELECT id FROM profiles WHERE telegramchatid = $1`,
            [chatId]
        );
        return rows[0] ?? null;
    }

    async update(id: string, data: Record<string, any>, db: QueryRunner): Promise<any | null> {
        const { first_name, last_name, color, telegramchatid, signature,
                daily_notifications_enabled, notification_time, phone,
                google_calendar_color_id, client_role } = data;

        const { rows, rowCount } = await db.query(`
            UPDATE profiles SET
                first_name = $1, last_name = $2, color = $3, telegramchatid = $4,
                signature = $5, daily_notifications_enabled = $6, notification_time = $7,
                phone = $8, google_calendar_color_id = $9, client_role = $10
            WHERE id = $11 RETURNING *
        `, [first_name, last_name, color, telegramchatid, signature,
            daily_notifications_enabled, notification_time, phone,
            google_calendar_color_id, client_role, id]);

        return rows[0] ?? null;
    }

    async delete(id: string, db: QueryRunner): Promise<void> {
        await db.query('DELETE FROM profiles WHERE id = $1', [id]);
    }
}
