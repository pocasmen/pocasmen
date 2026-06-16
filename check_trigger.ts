import { pool } from './src/config/db';

async function checkTrigger() {
    try {
        const { rows } = await pool.query(`
            SELECT pg_get_functiondef(oid) 
            FROM pg_proc 
            WHERE proname = 'fn_sync_parts_ledger_to_stock'
        `);
        console.log('Trigger Function Definition:', rows[0].pg_get_functiondef);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkTrigger();
