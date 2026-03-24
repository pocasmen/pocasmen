import { pool } from './config/db';
import { logger } from './utils/logger';

async function run() {
    logger.info('Connecting to database...');
    const client = await pool.connect();
    try {
        logger.info('Altering billing_tasks table...');
        await client.query('ALTER TABLE billing_tasks ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);');
        logger.info('Migration completed successfully.');
    } catch (err) {
        logger.error({ err }, 'Error running migration');
    } finally {
        client.release();
        await pool.end();
    }
}

run();
