import { pool } from './src/config/db';

async function checkStockTypes() {
    try {
        const { rows } = await pool.query('SELECT DISTINCT stock_type FROM parts_transactions');
        console.log('Stock types present in parts_transactions:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkStockTypes();
