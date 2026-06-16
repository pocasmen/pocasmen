import { pool } from './src/config/db';

async function auditOrders() {
    try {
        console.log('--- AUDITORIA DE ENCOMENDAS (ORDERED_QUANTITY) ---');

        const { rows } = await pool.query(`
            SELECT 
                p.id,
                p.reference,
                p.ordered_quantity as parts_ordered,
                COALESCE(oi.total_ordered, 0) as items_ordered,
                (p.ordered_quantity - COALESCE(oi.total_ordered, 0)) as diff
            FROM parts p
            LEFT JOIN (
                SELECT part_id, SUM(quantity_ordered) as total_ordered
                FROM parts_order_items poi
                JOIN parts_orders po ON poi.order_id = po.id
                WHERE po.status != 'COMPLETED' AND po.status != 'CANCELLED'
                GROUP BY part_id
            ) oi ON p.id = oi.part_id
            WHERE p.deleted_at IS NULL
            AND p.ordered_quantity != COALESCE(oi.total_ordered, 0)
        `);

        if (rows.length === 0) {
            console.log('✅ Nenhuma discrepância encontrada nas encomendas.');
        } else {
            console.log('❌ Discrepâncias encontradas:', rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

auditOrders();
