import { pool } from './src/config/db';

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

async function reconcileStrict() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('--- RECONCILIAÇÃO RIGOROSA ---');

        // Para evitar conflito com os triggers que SOMAM ao stock, 
        // vamos LIMPAR os ajustes anteriores no ledger e RESETAR o stock 
        // para um estado conhecido antes de aplicar a diferença.
        // Contudo, como o trigger fn_sync_parts_ledger_to_stock é AFTER INSERT,
        // se alterarmos o stock diretamente, o trigger não é disparado.
        // A estratégia é: 
        // 1. Limpar ajustes manuais anteriores do ledger.
        // 2. Definir o stock real na tabela parts como 0 (fictício) para resetar.
        // 3. Inserir a contagem total desejada como UM ÚNICO ajuste manual.
        
        for (const item of targetInventory) {
            const { rows: partRows } = await client.query("SELECT id, stock_quantity, stock_quantity_foss FROM parts WHERE reference = $1", [item.ref]);
            if (partRows.length === 0) continue;
            const partId = partRows[0].id;

            console.log(`🔧 Processando ${item.ref}: Target Geral=${item.geral}, Foss=${item.foss}`);

            // 1. Apagar ajustes anteriores para este item
            await client.query("DELETE FROM parts_transactions WHERE part_id = $1 AND notes = 'Ajuste de inventário (Conciliação)'", [partId]);

            // 2. Resetar stock na tabela parts para 0
            await client.query("UPDATE parts SET stock_quantity = 0, stock_quantity_foss = 0 WHERE id = $1", [partId]);

            // 3. Inserir o stock final como ajuste manual (o trigger somará 0 + contagem)
            if (item.geral !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, item.geral, 'general', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
            if (item.foss !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, item.foss, 'foss', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
        }

        await client.query('COMMIT');
        console.log('✅ Reconciliação rigorosa concluída.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

reconcileStrict();
