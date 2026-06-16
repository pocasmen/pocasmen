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

async function finalReconcile() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('--- RECONCILIAÇÃO FINAL: STOCK E LEDGER ---');

        // 1. Desativar Triggers
        await client.query('ALTER TABLE parts_transactions DISABLE TRIGGER trg_parts_transactions_sync');
        console.log('Triggers desativados.');

        for (const item of targetInventory) {
            const { rows: partRows } = await client.query("SELECT id FROM parts WHERE reference = $1", [item.ref]);
            if (partRows.length === 0) continue;
            const partId = partRows[0].id;

            // 2. Calcular Soma Atual do Ledger (para saber quanto falta)
            const { rows: ledgerRows } = await client.query(`
                SELECT stock_type, SUM(quantity) as total 
                FROM parts_transactions 
                WHERE part_id = $1 
                GROUP BY stock_type
            `, [partId]);

            const ledgerGeral = ledgerRows.find(r => r.stock_type === 'general')?.total || 0;
            const ledgerFoss = ledgerRows.find(r => r.stock_type === 'foss')?.total || 0;

            // 3. Calcular Deltas
            const deltaGeral = item.geral - ledgerGeral;
            const deltaFoss = item.foss - ledgerFoss;

            // 4. Corrigir Ledger (Inserir Ajustes)
            if (deltaGeral !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, deltaGeral, 'general', 'MANUAL_ADJUST', 'Ajuste final (Conciliação Rigorosa)']
                );
            }
            if (deltaFoss !== 0) {
                await client.query(
                    'INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes) VALUES ($1, $2, $3, $4, $5)',
                    [partId, deltaFoss, 'foss', 'MANUAL_ADJUST', 'Ajuste final (Conciliação Rigorosa)']
                );
            }

            // 5. Corrigir Tabela Parts (Stock Real)
            await client.query(
                'UPDATE parts SET stock_quantity = $1, stock_quantity_foss = $2 WHERE id = $3',
                [item.geral, item.foss, partId]
            );

            console.log(`🔧 ${item.ref}: LedGeral ${ledgerGeral}->${item.geral} (D=${deltaGeral}), LedFoss ${ledgerFoss}->${item.foss} (D=${deltaFoss})`);
        }

        // 6. Reativar Triggers
        await client.query('ALTER TABLE parts_transactions ENABLE TRIGGER trg_parts_transactions_sync');
        console.log('Triggers reativados.');

        await client.query('COMMIT');
        console.log('✅ Reconciliação final concluída com sucesso!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', e);
    } finally {
        client.release();
        process.exit(0);
    }
}

finalReconcile();
