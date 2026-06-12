import { pool } from './config/db';

async function check() {
    try {
        const partId = 167; // Tri clamp gasket
        console.log(`\n--- History for Part ID ${partId} (NEW LOGIC) ---`);
        const { rows: history } = await pool.query(`
            SELECT pt.*,
                   SUM(pt.quantity) OVER (
                       PARTITION BY pt.part_id, (CASE WHEN pt.stock_type = 'foss' THEN 'foss' ELSE 'general' END) 
                       ORDER BY pt.created_at, pt.id
                   ) as running_stock
                FROM parts_transactions pt
                WHERE pt.part_id = $1
                ORDER BY pt.created_at DESC, pt.id DESC
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
