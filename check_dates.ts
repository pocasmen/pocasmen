
import { pool } from './src/config/db';

async function check() {
    try {
        const { rows } = await pool.query(`
            SELECT id, report_number, "serviceDate", time_blocks->0->>'start' as first_block_start 
            FROM reports 
            WHERE deleted_at IS NULL 
            ORDER BY "serviceDate" DESC LIMIT 20;
        `);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
