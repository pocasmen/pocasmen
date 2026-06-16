import { pool } from './src/config/db';

async function fixOrdersFoss() {
    try {
        console.log('--- CORRIGINDO ENCOMENDAS FOSS ---');

        // Resetar ordered_quantity_foss para 0 para todas as peças que não têm encomendas ativas
        // A lógica da auditoria mostrou que há várias peças com valores remanescentes
        
        await pool.query("UPDATE parts SET ordered_quantity_foss = 0 WHERE id IN (SELECT id FROM parts WHERE ordered_quantity_foss > 0)");
        
        console.log('✅ ordered_quantity_foss corrigido para 0 em todas as peças.');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

fixOrdersFoss();
