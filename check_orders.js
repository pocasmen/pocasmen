const { pool } = require('./src/config/db');
async function run() {
    try {
        const orders = await pool.query('SELECT * FROM parts_orders');
        console.log('Orders found:', orders.rows.length);
        console.log(orders.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
