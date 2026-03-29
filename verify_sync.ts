import { pool } from './src/config/db';

async function verifySync() {
    try {
        const parts = await pool.query('SELECT id, reference, designation, stock_quantity, stock_quantity_foss FROM parts');
        
        console.log('--- STOCK SYNC VERIFICATION ---');
        for (const part of parts.rows) {
            const txSum = await pool.query(`
                SELECT 
                    SUM(CASE WHEN stock_type = 'general' THEN quantity ELSE 0 END) as general_sum,
                    SUM(CASE WHEN stock_type = 'contract' THEN quantity ELSE 0 END) as foss_sum
                FROM parts_transactions 
                WHERE part_id = $1
            `, [part.id]);

            const gSum = parseInt(txSum.rows[0].general_sum || '0', 10);
            const fSum = parseInt(txSum.rows[0].foss_sum || '0', 10);

            if (gSum !== part.stock_quantity || fSum !== part.stock_quantity_foss) {
                console.log(`Mismatch detected for Part ID ${part.id} (${part.reference}):`);
                console.log(`  General Stock: Table=${part.stock_quantity}, Ledger=${gSum} (Diff: ${part.stock_quantity - gSum})`);
                console.log(`  FOSS Stock:    Table=${part.stock_quantity_foss}, Ledger=${fSum} (Diff: ${part.stock_quantity_foss - fSum})`);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

verifySync();
