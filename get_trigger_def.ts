import { pool } from './src/config/db';

async function check() {
    try {
        const { rows } = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%audit%';
        `);
        console.log("Tables:", rows);

        const { rows: lastRows } = await pool.query(`
            SELECT * FROM audit_logs ORDER BY changed_at DESC LIMIT 5;
        `);
        console.log("Last 5 rows:", lastRows);

        const { rows: lastRowsWithoutS } = await pool.query(`
            SELECT count(*) FROM audit_log;
        `).catch(() => ({ rows: [] }));
        console.log("Count in audit_log:", lastRowsWithoutS);

    } catch (err) {
        console.error("Error", err);
    } finally {
        pool.end();
    }
}
check();
