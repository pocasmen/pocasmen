import { pool } from './config/db';

async function run() {
    console.log('Connecting to database...');
    const client = await pool.connect();
    try {
        console.log('Altering billing_tasks table...');
        await client.query('ALTER TABLE billing_tasks ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);');
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Error running migration:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
