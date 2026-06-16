import { pool } from './src/config/db';

async function checkPartTransactions() {
    try {
        const { rows: partRows } = await pool.query("SELECT id FROM parts WHERE reference = '60095853'");
        if (partRows.length === 0) {
            console.log('Part not found');
            return;
        }
        const partId = partRows[0].id;
        const { rows } = await pool.query("SELECT * FROM parts_transactions WHERE part_id = $1", [partId]);
        console.log('Transactions for 60095853:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkPartTransactions();
