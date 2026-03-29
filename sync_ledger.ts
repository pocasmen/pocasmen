import { pool } from './src/config/db';

async function performSync() {
    try {
        const parts = await pool.query('SELECT id, reference, designation, stock_quantity, stock_quantity_foss FROM parts');
        console.log(`Checking discrepancy for ${parts.rows.length} parts...`);

        let adjustmentsCount = 0;

        for (const part of parts.rows) {
            const txSumRes = await pool.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN stock_type = 'general' THEN quantity ELSE 0 END), 0) as general_sum,
                    COALESCE(SUM(CASE WHEN stock_type = 'contract' THEN quantity ELSE 0 END), 0) as foss_sum
                FROM parts_transactions 
                WHERE part_id = $1
            `, [part.id]);

            const gSum = parseInt(txSumRes.rows[0].general_sum, 10);
            const fSum = parseInt(txSumRes.rows[0].foss_sum, 10);

            const gDiff = (part.stock_quantity || 0) - gSum;
            const fDiff = (part.stock_quantity_foss || 0) - fSum;

            if (gDiff !== 0) {
                console.log(`[PART ${part.id}] Adjusting General: ${gSum} -> ${part.stock_quantity} (Diff: ${gDiff})`);
                await pool.query(`
                    INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
                    VALUES ($1, $2, 'general', 'MANUAL_ADJUST', 'Sincronização de Saldo Inicial')
                `, [part.id, gDiff]);
                adjustmentsCount++;
            }

            if (fDiff !== 0) {
                console.log(`[PART ${part.id}] Adjusting FOSS: ${fSum} -> ${part.stock_quantity_foss} (Diff: ${fDiff})`);
                await pool.query(`
                    INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
                    VALUES ($1, $2, 'contract', 'MANUAL_ADJUST', 'Sincronização de Saldo Inicial')
                `, [part.id, fDiff]);
                adjustmentsCount++;
            }
        }

        console.log(`\nSync completed! Total adjustments: ${adjustmentsCount}`);

    } catch (err) {
        console.error('Error during sync:', err);
    } finally {
        process.exit();
    }
}

performSync();
