import { pool } from './src/config/db';
import * as fs from 'fs';

// Dados do CSV (Geral / Foss)
const inventoryData = [
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

async function reconcileInventory() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🚀 Iniciando reconciliação de inventário...');

        // 1. Desativar Triggers
        console.log('🔒 Desativando triggers...');
        await client.query('ALTER TABLE parts_transactions DISABLE TRIGGER trg_parts_transactions_sync');

        for (const item of inventoryData) {
            // Obter peça atual
            const { rows: partRows } = await client.query('SELECT id, stock_quantity, stock_quantity_foss FROM parts WHERE reference = $1', [item.ref]);
            
            if (partRows.length === 0) {
                console.warn(`⚠️ Peça não encontrada: ${item.ref}. Pulando.`);
                continue;
            }

            const part = partRows[0];
            const diffGeral = item.geral - (part.stock_quantity || 0);
            const diffFoss = item.foss - (part.stock_quantity_foss || 0);

            if (diffGeral === 0 && diffFoss === 0) continue;

            console.log(`🔧 Ajustando ${item.ref}: Geral ${part.stock_quantity}->${item.geral} (Diff ${diffGeral}), Foss ${part.stock_quantity_foss}->${item.foss} (Diff ${diffFoss})`);

            // 2. Atualizar Stock
            await client.query(
                'UPDATE parts SET stock_quantity = $1, stock_quantity_foss = $2 WHERE id = $3',
                [item.geral, item.foss, part.id]
            );

            // 3. Inserir deltas no Ledger
            if (diffGeral !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [part.id, diffGeral, 'general', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
            if (diffFoss !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [part.id, diffFoss, 'contract', 'MANUAL_ADJUST', 'Ajuste de inventário (Conciliação)']
                );
            }
        }

        // 4. Reativar Triggers
        console.log('🔓 Reativando triggers...');
        await client.query('ALTER TABLE parts_transactions ENABLE TRIGGER trg_parts_transactions_sync');

        await client.query('COMMIT');
        console.log('✅ Reconciliação concluída com sucesso!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Erro na reconciliação, transação revertida:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

reconcileInventory();
