import { pool } from './src/config/db';
async function run() {
    try {
        const orders = await pool.query('SELECT * FROM parts_orders');
        console.log('--- PARTS ORDERS TABLE ---');
        console.log('Count:', orders.rows.length);
        console.log(JSON.stringify(orders.rows, null, 2));

        const items = await pool.query('SELECT * FROM parts_order_items');
        console.log('\n--- PARTS ORDER ITEMS TABLE ---');
        console.log('Count:', items.rows.length);
        console.log(JSON.stringify(items.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
