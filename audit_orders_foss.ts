import { pool } from './src/config/db';

async function auditOrdersFoss() {
    try {
        console.log('--- AUDITORIA DE ENCOMENDAS FOSS (ORDERED_QUANTITY_FOSS) ---');

        const { rows } = await pool.query(`
            SELECT 
                p.id,
                p.reference,
                p.ordered_quantity_foss as parts_ordered_foss,
                COALESCE(oi.total_ordered, 0) as items_ordered_foss,
                (p.ordered_quantity_foss - COALESCE(oi.total_ordered, 0)) as diff
            FROM parts p
            LEFT JOIN (
                SELECT part_id, SUM(quantity_ordered) as total_ordered
                FROM parts_order_items poi
                JOIN parts_orders po ON poi.order_id = po.id
                WHERE po.status != 'COMPLETED' AND po.status != 'CANCELLED'
                AND poi.stock_type = 'contract'
                GROUP BY part_id
            ) oi ON p.id = oi.part_id
            WHERE p.deleted_at IS NULL
            AND p.ordered_quantity_foss != COALESCE(oi.total_ordered, 0)
        `);

        if (rows.length === 0) {
            console.log('✅ Nenhuma discrepância encontrada nas encomendas FOSS.');
        } else {
            console.log('❌ Discrepâncias encontradas:', rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

auditOrdersFoss();
