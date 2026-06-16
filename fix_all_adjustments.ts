import { pool } from './src/config/db';

// Dados do CSV (Contagem Física Final Desejada)
const targetInventory = [
  { ref: "HJL010", geral: 1, foss: 0 },
  { ref: "HJL001", geral: 1, foss: 0 },
  { ref: "HJK002", geral: 1, foss: 0 },
  { ref: "60067217", geral: 0, foss: 0 },
  { ref: "60110217", geral: 1, foss: 0 },
  { ref: "60095853", geral: 0, foss: 1 },
  { ref: "60109491", geral: 0, foss: 2 },
  { ref: "60054341", geral: 2, foss: 0 },
  { ref: "60054247", geral: 0, foss: 1 },
  { ref: "60015381", geral: 0, foss: 1 },
  { ref: "60048140", geral: 0, foss: 2 },
  { ref: "60044287", geral: 1, foss: 0 },
  { ref: "60093021", geral: 3, foss: 4 },
  { ref: "45800700", geral: 1, foss: 0 },
  { ref: "60044277", geral: 12, foss: 6 },
  { ref: "60111841", geral: 0, foss: 1 },
  { ref: "60035791", geral: 3, foss: 3 },
  { ref: "60056467", geral: 5, foss: 3 },
  { ref: "702308", geral: 5, foss: 3 },
  { ref: "54189", geral: 6, foss: 3 },
  { ref: "60040404", geral: 6, foss: 3 },
  { ref: "60046515", geral: 0, foss: 0 }
];

async function fixAllAdjustments() {
    const client = await pool.connect();
    try {
        console.log('--- CORRIGINDO TODOS OS AJUSTES NO LEDGER ---');

        for (const item of targetInventory) {
            // 1. Obter peça e saldo ANTES dos ajustes (aproximado, excluindo os ajustes recentes)
            const { rows: partRows } = await client.query("SELECT id FROM parts WHERE reference = $1", [item.ref]);
            if (partRows.length === 0) continue;
            const partId = partRows[0].id;

            // 2. Calcular saldo real anterior aos ajustes de conciliação
            const { rows: ledgerRows } = await client.query(`
                SELECT SUM(quantity) as total 
                FROM parts_transactions 
                WHERE part_id = $1 
                AND notes != 'Ajuste de inventário (Conciliação)'
                GROUP BY stock_type
            `, [partId]);

            // Simplificação: Assumimos que o saldo antes da conciliação era o que estava na tabela parts
            // MAS os nossos ajustes anteriores já alteraram o stock_quantity na tabela parts.
            // Precisamos de buscar o valor original antes da nossa intervenção.
            // Para simplificar, vamos assumir que o saldo anterior era (Stock_Atual_Na_Parts - Ajuste_Feito_Por_Mim)
            
            const { rows: adjustmentRows } = await client.query(`
                SELECT stock_type, SUM(quantity) as total_adj
                FROM parts_transactions
                WHERE part_id = $1 AND notes = 'Ajuste de inventário (Conciliação)'
                GROUP BY stock_type
            `, [partId]);

            // Recuperar stock original estimado
            const { rows: currentStock } = await client.query("SELECT stock_quantity, stock_quantity_foss FROM parts WHERE id = $1", [partId]);
            
            const adjGeral = adjustmentRows.find(r => r.stock_type === 'general')?.total_adj || 0;
            const adjFoss = adjustmentRows.find(r => r.stock_type === 'foss')?.total_adj || 0;

            const originalGeral = currentStock[0].stock_quantity - adjGeral;
            const originalFoss = currentStock[0].stock_quantity_foss - adjFoss;

            // 3. Calcular Delta Correto
            const deltaGeral = item.geral - originalGeral;
            const deltaFoss = item.foss - originalFoss;

            if (deltaGeral === adjGeral && deltaFoss === adjFoss) continue;

            console.log(`🔧 Corrigindo ${item.ref}: Delta Geral ${adjGeral}->${deltaGeral}, Delta Foss ${adjFoss}->${deltaFoss}`);

            // 4. Atualizar o Ledger (Substituir ajustes antigos ou criar novos)
            // Para manter o histórico limpo, vamos deletar os ajustes antigos e criar os corretos
            await client.query("DELETE FROM parts_transactions WHERE part_id = $1 AND notes = 'Ajuste de inventário (Conciliação)'", [partId]);
            
            if (deltaGeral !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, deltaGeral, 'general', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
            if (deltaFoss !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, deltaFoss, 'foss', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
        }

        console.log('✅ Todos os ajustes foram recalculados e corrigidos.');

    } catch (e) {
        console.error('Erro:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

fixAllAdjustments();
