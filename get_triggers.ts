import { pool } from './src/config/db';

async function main() {
    try {
        const res = await pool.query(`
            SELECT event_object_table, trigger_name 
            FROM information_schema.triggers 
            WHERE trigger_name LIKE '%audit%';
        `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
main();
