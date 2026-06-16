import { pool } from './src/config/db';

async function checkContractTransactions() {
    try {
        const { rows } = await pool.query("SELECT count(*) FROM parts_transactions WHERE stock_type = 'contract'");
        console.log('Count of contract transactions:', rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkContractTransactions();
