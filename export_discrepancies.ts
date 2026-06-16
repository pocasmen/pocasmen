import { pool } from './src/config/db';
import * as fs from 'fs';
import * as path from 'path';

async function exportDiscrepancies() {
    try {
        console.log('--- A ANALISAR DISCREPÂNCIAS PARA EXPORTAÇÃO ---');

        const { rows } = await pool.query(`
            WITH ledger_balances AS (
                SELECT 
                    part_id,
                    SUM(CASE WHEN stock_type = 'general' THEN quantity ELSE 0 END) as ledger_general,
                    SUM(CASE WHEN stock_type = 'foss' THEN quantity ELSE 0 END) as ledger_foss
                FROM parts_transactions
                GROUP BY part_id
            )
            SELECT 
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

        if (rows.length === 0) {
            console.log('✅ Nenhuma discrepância encontrada.');
            process.exit(0);
        }

        const filePath = path.join(__dirname, 'discrepancias_inventario_export.csv');
        const header = 'Referencia;Designacao;Fisico Geral;Ledger Geral;Diferenca Geral;Fisico Foss;Ledger Foss;Diferenca Foss\n';
        
        const csvContent = rows.map(r => 
            `"${r.reference}";"${r.designation.replace(/"/g, '""')}";${r.physical_general};${r.ledger_general};${r.diff_general};${r.physical_foss};${r.ledger_foss};${r.diff_foss}`
        ).join('\n');

        fs.writeFileSync(filePath, header + csvContent);
        console.log(`✅ Relatório exportado com sucesso para: ${filePath}`);

    } catch (e) {
        console.error('Erro ao gerar exportação:', e);
    } finally {
        process.exit(0);
    }
}

exportDiscrepancies();
