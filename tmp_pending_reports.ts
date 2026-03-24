import { pool } from './src/config/db';

async function checkPending() {
    try {
        const query = `
            SELECT id, title, "hasReport", "isCompleted", "endDate"
            FROM schedules 
            WHERE "hasReport" = false
              AND ("isCompleted" = true OR "endDate" < NOW())
        `;
        const res = await pool.query(query);
        console.log("Pending reports count:", res.rows.length);
        console.log("Sample pending report:", res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkPending();
