import { pool } from './src/config/db';
import { getBillingTasksRaw } from './src/services/billingService';

async function test() {
    const client = await pool.connect();
    try {
        const row = await getBillingTasksRaw(client, '2026-02-01T00:00:00.000Z', '2026-02-28T23:59:59.999Z');
        console.log(row.length);
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
test();
