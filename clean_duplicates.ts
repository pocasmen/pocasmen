import { pool } from './src/config/db';

async function cleanDuplicateAdjustments() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('--- LIMPEZA DE TRANSAÇÕES DUPLICADAS ---');

        // 1. Desativar Triggers
        await client.query('ALTER TABLE parts_transactions DISABLE TRIGGER trg_parts_transactions_sync');
        console.log('Triggers desativados.');

        // 2. Apagar transações com a nota "Ajuste de inventário (Conciliação)"
        // mantendo apenas as com "Ajuste final (Conciliação Rigorosa)"
        const { rowCount } = await client.query(`
            DELETE FROM parts_transactions 
            WHERE notes = 'Ajuste de inventário (Conciliação)'
        `);
        console.log(`✅ Removidas ${rowCount} transações duplicadas.`);

        // 3. Reativar Triggers
        await client.query('ALTER TABLE parts_transactions ENABLE TRIGGER trg_parts_transactions_sync');
        console.log('Triggers reativados.');

        await client.query('COMMIT');
        console.log('✅ Limpeza concluída com sucesso.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

cleanDuplicateAdjustments();
