import { pool } from './config/db';

async function check() {
    try {
        const partId = 168; // One of the parts with qty 3 in order 30
        console.log(`\n--- History for Part ID ${partId} ---`);
        const { rows: history } = await pool.query(`
            SELECT pt.*,
                   SUM(pt.quantity) OVER (PARTITION BY pt.part_id, pt.stock_type ORDER BY pt.created_at, pt.id) as running_stock
                FROM parts_transactions pt
                WHERE pt.part_id = $1
                ORDER BY pt.created_at DESC, pt.id DESC
                LIMIT 10
        `, [partId]);
        console.table(history.map(h => ({
            id: h.id,
            date: h.created_at,
            type: h.type,
            qty: h.quantity,
            stock: h.stock_type,
            saldo: h.running_stock,
            notes: h.notes
        })));

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

check();
