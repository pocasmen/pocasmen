
import { pool } from './src/config/db';

async function check() {
    try {
        const res = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'schedules'");
        console.log("Columns:", res.rows);
        
        const dataRes = await pool.query("SELECT * FROM schedules LIMIT 1");
        console.log("Sample Data:", dataRes.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
