import { pool } from './src/config/db';

async function fixSpecificAdjustment() {
    try {
        console.log('--- CORRIGINDO AJUSTE PARA 60044277 ---');

        // Identificar as transações de ajuste recentes para este item
        const { rows: partRows } = await pool.query("SELECT id FROM parts WHERE reference = '60044277'");
        const partId = partRows[0].id;

        // Encontrar os dois ajustes de reconciliação errados (os últimos da lista)
        const { rows: adjustRows } = await pool.query(`
            SELECT id, quantity, stock_type 
            FROM parts_transactions 
            WHERE part_id = $1 
            AND type = 'MANUAL_ADJUST' 
            AND notes = 'Ajuste de inventário (Conciliação)'
            ORDER BY created_at DESC 
            LIMIT 2
        `, [partId]);

        console.log('Ajustes encontrados:', adjustRows);

        // Corrigir Geral (era +1, deve ser -2 para baixar de 14 para 12)
        // Corrigir Foss (era -6, deve ser -3 para baixar de 9 para 6)
        
        await pool.query("UPDATE parts_transactions SET quantity = -2 WHERE id = $1", [adjustRows.find(r => r.stock_type === 'general').id]);
        await pool.query("UPDATE parts_transactions SET quantity = -3 WHERE id = $1", [adjustRows.find(r => r.stock_type === 'foss').id]);

        console.log('✅ Ajustes corrigidos no ledger.');

    } catch (e) {
        console.error('Erro:', e);
    } finally {
        process.exit(0);
    }
}

fixSpecificAdjustment();
