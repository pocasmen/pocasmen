import { pool } from './config/db';

async function audit() {
    try {
        console.log('--- RELATÓRIO DE DISCREPÂNCIAS DE INVENTÁRIO ---\n');
        console.log('Comparando Saldo da Ledger (Histórico) com Stock Físico Real...\n');

        const { rows: results } = await pool.query(`
            WITH ledger_balances AS (
                SELECT 
                    part_id,
                    SUM(CASE WHEN stock_type = 'general' THEN quantity ELSE 0 END) as ledger_general,
                    SUM(CASE WHEN stock_type = 'foss' THEN quantity ELSE 0 END) as ledger_foss
                FROM parts_transactions
                GROUP BY part_id
            )
            SELECT 
                p.id,
                p.reference,
                p.designation,
                p.stock_quantity as physical_general,
                COALESCE(lb.ledger_general, 0) as ledger_general,
                (p.stock_quantity - COALESCE(lb.ledger_general, 0)) as diff_general,
                p.stock_quantity_foss as physical_foss,
                COALESCE(lb.ledger_foss, 0) as ledger_foss,
                (p.stock_quantity_foss - COALESCE(lb.ledger_foss, 0)) as diff_foss
            FROM parts p
            LEFT JOIN ledger_balances lb ON p.id = lb.part_id
            WHERE p.deleted_at IS NULL
            AND (
                p.stock_quantity != COALESCE(lb.ledger_general, 0) 
                OR p.stock_quantity_foss != COALESCE(lb.ledger_foss, 0)
            )
            ORDER BY p.designation ASC
        `);

        if (results.length === 0) {
            console.log('✅ Nenhuma discrepância encontrada! A ledger e o stock físico estão perfeitamente sincronizados.');
        } else {
            console.log(`Encontradas ${results.length} peças com discrepâncias:\n`);
            
            console.log(String('REFERÊNCIA').padEnd(15), String('DESIGNAÇÃO').padEnd(40), String('GERAL (Fis/Led/Dif)').padEnd(25), String('FOSS (Fis/Led/Dif)'));
            console.log('-'.repeat(100));

            results.forEach(r => {
                const generalStr = `${r.physical_general}/${r.ledger_general}/${r.diff_general > 0 ? '+' : ''}${r.diff_general}`;
                const fossStr = `${r.physical_foss}/${r.ledger_foss}/${r.diff_foss > 0 ? '+' : ''}${r.diff_foss}`;
                
                console.log(
                    String(r.reference).padEnd(15),
                    String(r.designation).substring(0, 38).padEnd(40),
                    generalStr.padEnd(25),
                    fossStr
                );
            });
            
            console.log('\n--- FIM DO RELATÓRIO ---');
        }

    } catch (e) {
        console.error('Erro ao executar auditoria:', e);
    } finally {
        process.exit(0);
    }
}

audit();
