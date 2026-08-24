import { pool } from './src/config/db';

async function check() {
    const { rows } = await pool.query('SELECT id, "clientId", "equipmentId" FROM reports WHERE id = 541');
    console.log('Report:', rows[0]);
    process.exit(0);
}
check();
