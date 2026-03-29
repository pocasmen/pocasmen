import { pool } from './src/config/db';
async function main() {
    const { rows } = await pool.query(`
        SELECT pg_get_triggerdef(oid) 
        FROM pg_trigger 
        WHERE tgname = 'trigger_update_virtual_stock';
    `);
    console.log(rows[0]?.pg_get_triggerdef);
    process.exit(0);
}
main();
