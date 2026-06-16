import { pool } from './src/config/db';

async function fixOrders() {
    try {
        console.log('--- CORRIGINDO ENCOMENDAS ---');

        await pool.query("UPDATE parts SET ordered_quantity = 0 WHERE reference = '60098026'");
        
        console.log('✅ ordered_quantity corrigido para 0 na tabela parts para a ref 60098026.');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

fixOrders();
