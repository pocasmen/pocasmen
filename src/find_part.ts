import { pool } from './config/db';

async function find() {
    try {
        const { rows } = await pool.query(
            "SELECT pt.*, p.reference, p.designation FROM parts_transactions pt JOIN parts p ON pt.part_id = p.id WHERE (pt.quantity = 4 OR pt.quantity = 3) AND pt.created_at::date = '2026-06-03'"
        );
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

find();
