import { pool } from './config/db';

async function rollback() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Rolling back Automatic Synchronization transactions...');

        // 1. Find all transactions created by the sync script
        const { rows: txs } = await client.query(
            "SELECT id, part_id, quantity, stock_type FROM parts_transactions WHERE notes = 'Sincronização de Saldo (Ajuste Automático)'"
        );

        console.log(`Found ${txs.length} transactions to revert.`);

        for (const tx of txs) {
            const column = tx.stock_type === 'foss' ? 'stock_quantity_foss' : 'stock_quantity';
            
            // 2. Revert the physical stock change (subtract what was added)
            // Note: Since the trigger added the quantity, we subtract it now.
            await client.query(`
                UPDATE parts 
                SET ${column} = GREATEST(0, ${column} - $1)
                WHERE id = $2
            `, [tx.quantity, tx.part_id]);

            // 3. Delete the transaction
            await client.query('DELETE FROM parts_transactions WHERE id = $1', [tx.id]);
            
            console.log(`  Reverted Transaction #${tx.id} for Part ID ${tx.part_id} (${tx.quantity} units from ${tx.stock_type})`);
        }

        await client.query('COMMIT');
        console.log('\nRollback completed successfully!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Rollback failed:', e);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

rollback();
