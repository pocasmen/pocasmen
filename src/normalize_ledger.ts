import { pool } from './config/db';

async function normalize() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Normalizing parts_transactions stock_type values...');
        
        // 1. Convert 'contract' to 'foss' in transactions
        const { rowCount: c2f } = await client.query(
            "UPDATE parts_transactions SET stock_type = 'foss' WHERE stock_type = 'contract'"
        );
        console.log(`  Updated ${c2f} transactions from 'contract' to 'foss'`);

        // 2. Convert 'msd' to 'general' in transactions
        const { rowCount: m2g } = await client.query(
            "UPDATE parts_transactions SET stock_type = 'general' WHERE stock_type = 'msd'"
        );
        console.log(`  Updated ${m2g} transactions from 'msd' to 'general'`);

        // 3. Convert any other unexpected types to 'general' (safety)
        const { rowCount: others } = await client.query(
            "UPDATE parts_transactions SET stock_type = 'general' WHERE stock_type NOT IN ('general', 'foss')"
        );
        if (others && others > 0) console.log(`  Updated ${others} unexpected stock types to 'general'`);

        await client.query('COMMIT');
        console.log('Ledger normalization completed!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Normalization failed:', e);
        process.exit(1);
    } finally {
        client.release();
    }
}

normalize();
