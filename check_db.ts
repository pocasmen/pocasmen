
import { Pool } from 'pg';
import path from 'path';
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function verify() {
    try {
        const { rows } = await pool.query('SELECT id, reference, designation, is_composed, virtual_stock FROM parts WHERE is_composed = false AND virtual_stock > 0 LIMIT 10');
        console.log('Peças Simples com virtual_stock > 0 (Deveriam ser 0):');
        console.log(JSON.stringify(rows, null, 2));

        const { rows: kits } = await pool.query('SELECT id, reference, designation, is_composed, virtual_stock FROM parts WHERE is_composed = true LIMIT 5');
        console.log('\nExemplos de Kits (Deveriam ter virtual_stock baseado em componentes):');
        console.log(JSON.stringify(kits, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

verify();
