import { pool } from './src/config/db';

async function checkWeirdTransactions() {
    try {
        const { rows } = await pool.query("SELECT DISTINCT stock_type FROM parts_transactions WHERE stock_type NOT IN ('general', 'foss')");
        console.log('Weird stock types:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkWeirdTransactions();
