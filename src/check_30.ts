import { pool } from './config/db';

async function check() {
    try {
        console.log('--- Transactions for Order #30 ---');
        const { rows: txs } = await pool.query(
            "SELECT pt.*, p.reference, p.designation FROM parts_transactions pt JOIN parts p ON pt.part_id = p.id WHERE pt.reference_id = '30' OR pt.notes ILIKE '%#30%'"
        );
        console.log(JSON.stringify(txs, null, 2));

        console.log('\n--- Order Items for Order #30 ---');
        const { rows: items } = await pool.query(
            "SELECT * FROM parts_order_items WHERE order_id = 30"
        );
        console.log(JSON.stringify(items, null, 2));

        if (txs.length > 0) {
            const partId = txs[0].part_id;
            console.log(`\n--- Part Details for Part ID ${partId} ---`);
            const { rows: part } = await pool.query(
                "SELECT id, reference, designation, stock_quantity, stock_quantity_foss, ordered_quantity, ordered_quantity_foss FROM parts WHERE id = $1",
                [partId]
            );
            console.log(JSON.stringify(part, null, 2));

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
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

check();
