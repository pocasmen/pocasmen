import { pool } from './src/config/db';

async function fixStockType() {
    try {
        console.log('--- CORRIGINDO STOCK_TYPE NO LEDGER ---');

        // Confirmar quais registos têm 'contract' e deveriam ser 'foss'
        const { rows } = await pool.query("SELECT * FROM parts_transactions WHERE stock_type = 'contract'");
        
        if (rows.length === 0) {
            console.log('Nenhum registo com stock_type = \'contract\' encontrado.');
            return;
        }

        console.log(`Encontrados ${rows.length} registos para corrigir.`);

        // Executar a correção
        const { rowCount } = await pool.query("UPDATE parts_transactions SET stock_type = 'foss' WHERE stock_type = 'contract'");
        
        console.log(`✅ ${rowCount} registos atualizados para 'foss' com sucesso.`);

    } catch (e) {
        console.error('Erro ao corrigir stock_type:', e);
    } finally {
        process.exit(0);
    }
}

fixStockType();
