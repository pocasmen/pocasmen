import { pool } from '../../config/db';
import { QueryRunner } from '../../types';

export class SettingRepository {
    async findAll(db: QueryRunner): Promise<Record<string, string>> {
        const { rows } = await db.query('SELECT * FROM settings');
        return rows.reduce((acc: Record<string, string>, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
    }

    async findByKey(key: string): Promise<string | null> {
        const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        return rows[0]?.value ?? null;
    }

    async upsert(key: string, value: string, db: QueryRunner): Promise<void> {
        await db.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            [key, value]
        );
    }
}
