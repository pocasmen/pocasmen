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
                (p.signature IS NOT NULL AND p.signature <> '') as has_signature,
                (p.first_name IS NOT NULL AND p.first_name <> '' AND
                 p.last_name IS NOT NULL AND p.last_name <> '' AND
                 p.client_role IS NOT NULL AND p.client_role <> '' AND
                 EXISTS (SELECT 1 FROM client_users cu WHERE cu.user_id = p.id)
                ) as is_profile_complete,
                COALESCE(
                    (SELECT json_agg(json_build_object('client_id', cu.client_id, 'name', c.name))
                     FROM client_users cu
                     JOIN clients c ON cu.client_id = c.id
                     WHERE cu.user_id = p.id),
                    '[]'
                ) as client_users,
                -- We check if the user has a confirmed email AND doesn't have the must_set_password flag
                -- as a more accurate proxy for "has a password defined".
                EXISTS (
                    SELECT 1 FROM auth.users au 
                    WHERE au.id = p.id 
                    AND au.email_confirmed_at IS NOT NULL
                    AND (au.raw_user_meta_data->>'must_set_password' IS NULL OR au.raw_user_meta_data->>'must_set_password' = 'false')
                ) as has_password
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
            google_calendar_color_id, client_role, client_ids } = data;

        const primaryClientId = Array.isArray(client_ids) && client_ids.length > 0 ? Number(client_ids[0]) : null;

        const { rows, rowCount } = await db.query(`
            UPDATE profiles SET
                first_name = $1, last_name = $2, color = $3, telegramchatid = $4,
                signature = $5, daily_notifications_enabled = $6, notification_time = $7,
                phone = $8, google_calendar_color_id = $9, client_role = $10,
                client_id = $11
            WHERE id = $12 RETURNING *
        `, [first_name, last_name, color, telegramchatid, signature,
            daily_notifications_enabled, notification_time, phone,
            google_calendar_color_id, client_role, primaryClientId, id]);

        if (rowCount !== 0 && client_ids !== undefined) {
            // Update many-to-many associations
            await db.query('DELETE FROM client_users WHERE user_id = $1', [id]);
            if (Array.isArray(client_ids)) {
                for (const clientId of client_ids) {
                    await db.query(
                        'INSERT INTO client_users (user_id, client_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [id, Number(clientId)]
                    );
                }
            }
        }

        return rows[0] ?? null;
    }

    async delete(id: string, db: QueryRunner): Promise<void> {
        await db.query('DELETE FROM profiles WHERE id = $1', [id]);
    }
}
