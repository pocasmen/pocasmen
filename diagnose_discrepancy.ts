import { pool } from './src/config/db';

async function diagnoseDiscrepancy() {
    try {
        console.log('--- DIAGNÓSTICO: Referência 60044277 ---');
        
        // 1. Verificar Trigger
        const { rows: triggerRows } = await pool.query(`
            SELECT tgname, tgenabled 
            FROM pg_trigger 
            WHERE tgname = 'trg_parts_transactions_sync'
        `);
        console.log('Trigger status:', triggerRows);

        // 2. Verificar Stock Real na tabela parts
        const { rows: partRows } = await pool.query(`
            SELECT id, stock_quantity, stock_quantity_foss 
            FROM parts 
            WHERE reference = '60044277'
        `);
        console.log('Dados em parts:', partRows);

        // 3. Verificar transações no ledger
        if (partRows.length > 0) {
            const { rows: transRows } = await pool.query(`
                SELECT id, quantity, stock_type, type, created_at 
                FROM parts_transactions 
                WHERE part_id = $1 
                ORDER BY created_at ASC
            `, [partRows[0].id]);
            console.log('Transações no ledger (ordem cronológica):', transRows);
            
            const totalFoss = transRows
                .filter(t => t.stock_type === 'contract')
                .reduce((acc, curr) => acc + curr.quantity, 0);
            console.log('Soma das transações Foss:', totalFoss);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

diagnoseDiscrepancy();
