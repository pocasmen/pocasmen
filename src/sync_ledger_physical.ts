import { pool } from './config/db';

async function sync() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting Ledger to Physical Stock synchronization...');

        // 1. Get all parts with their current physical stock
        const { rows: parts } = await client.query(
            'SELECT id, reference, designation, stock_quantity, stock_quantity_foss FROM parts WHERE deleted_at IS NULL'
        );

        for (const part of parts) {
            // Calculate current ledger balance for General and Foss
            const { rows: balances } = await client.query(`
                SELECT 
                    stock_type,
                    SUM(quantity) as balance
                FROM parts_transactions
                WHERE part_id = $1
                GROUP BY stock_type
            `, [part.id]);

            const ledgerGeneral = Number(balances.find(b => b.stock_type === 'general')?.balance || 0);
            const ledgerFoss = Number(balances.find(b => b.stock_type === 'foss')?.balance || 0);

            const diffGeneral = Number(part.stock_quantity || 0) - ledgerGeneral;
            const diffFoss = Number(part.stock_quantity_foss || 0) - ledgerFoss;

            if (diffGeneral !== 0) {
                console.log(`  Part ${part.id} (${part.reference}): General Diff = ${diffGeneral}. Creating adjust...`);
                await client.query(`
                    INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
                    VALUES ($1, $2, 'general', 'MANUAL_ADJUST', 'Sincronização de Saldo (Ajuste Automático)')
                `, [part.id, diffGeneral]);
            }

            if (diffFoss !== 0) {
                console.log(`  Part ${part.id} (${part.reference}): Foss Diff = ${diffFoss}. Creating adjust...`);
                await client.query(`
                    INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
                    VALUES ($1, $2, 'foss', 'MANUAL_ADJUST', 'Sincronização de Saldo (Ajuste Automático)')
                `, [part.id, diffFoss]);
            }
        }

        await client.query('COMMIT');
        console.log('\nSynchronization completed successfully!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Synchronization failed:', e);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

sync();
