import { pool } from './src/config/db';

async function auditInventory() {
    try {
        console.log('--- AUDITORIA FINAL DE INVENTÁRIO ---');

        const { rows } = await pool.query(`
            WITH ledger_balances AS (
                SELECT 
                    part_id,
                    SUM(CASE WHEN stock_type = 'general' THEN quantity ELSE 0 END) as ledger_general,
                    SUM(CASE WHEN stock_type = 'foss' THEN quantity ELSE 0 END) as ledger_foss
                FROM parts_transactions
                GROUP BY part_id
            )
            SELECT 
                p.reference,
                p.stock_quantity as physical_general,
                COALESCE(lb.ledger_general, 0) as ledger_general,
                p.stock_quantity_foss as physical_foss,
                COALESCE(lb.ledger_foss, 0) as ledger_foss
            FROM parts p
            LEFT JOIN ledger_balances lb ON p.id = lb.part_id
            WHERE p.deleted_at IS NULL
            AND (
                p.stock_quantity != COALESCE(lb.ledger_general, 0) 
                OR p.stock_quantity_foss != COALESCE(lb.ledger_foss, 0)
            )
        `);

        if (rows.length === 0) {
            console.log('✅ Tudo sincronizado! Nenhuma discrepância encontrada.');
        } else {
            console.log('❌ Discrepâncias encontradas:', rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

auditInventory();
