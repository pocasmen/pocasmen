import { pool } from './src/config/db';

async function checkPart248() {
    try {
        const partId = 248;
        const partRes = await pool.query('SELECT reference, designation, stock_quantity, stock_quantity_foss FROM parts WHERE id = $1', [partId]);
        const part = partRes.rows[0];

        if (!part) {
            console.log('Part 248 not found!');
            return;
        }

        console.log(`--- PART ID 248 (${part.reference}) ---`);
        console.log(`Current Stock (Table): General=${part.stock_quantity}, FOSS=${part.stock_quantity_foss}`);

        const txRes = await pool.query(`
            SELECT pt.*,
                   SUM(pt.quantity) OVER (PARTITION BY pt.stock_type ORDER BY pt.created_at, pt.id) as running_stock
            FROM parts_transactions pt 
            WHERE part_id = $1 
            ORDER BY created_at ASC, id ASC
        `, [partId]);

        console.log('\n--- TRANSACTIONS (Chronological) ---');
        txRes.rows.forEach(tx => {
            console.log(`[${tx.created_at.toISOString()}] | ID=${tx.id} | Qty=${tx.quantity} | Type=${tx.type} | Stock=${tx.stock_type} | Saldo p/ Tipo=${tx.running_stock}`);
        });

        const totals = await pool.query(`
            SELECT stock_type, SUM(quantity) as total_qty 
            FROM parts_transactions 
            WHERE part_id = $1 
            GROUP BY stock_type
        `, [partId]);

        console.log('\n--- CALCULATED TOTALS ---');
        totals.rows.forEach(t => {
            console.log(`${t.stock_type}: ${t.total_qty}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkPart248();
