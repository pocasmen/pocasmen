import { pool } from './config/db';
import * as fs from 'fs';
import * as path from 'path';

async function exportCSV() {
    try {
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
                p.reference,
                p.designation,
                p.stock_quantity as fisico_geral,
                COALESCE(lb.ledger_general, 0) as ledger_geral,
                (p.stock_quantity - COALESCE(lb.ledger_general, 0)) as diff_geral,
                p.stock_quantity_foss as fisico_foss,
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
            console.log('Nenhuma discrepância encontrada.');
            return;
        }

        const header = 'Referencia;Designacao;Fisico Geral;Ledger Geral;Diferenca Geral;Fisico Foss;Ledger Foss;Diferenca Foss\n';
        const rows = results.map(r => 
            `"${r.reference}";"${r.designation}";${r.fisico_geral};${r.ledger_geral};${r.diff_geral};${r.fisico_foss};${r.ledger_foss};${r.diff_foss}`
        ).join('\n');

        const filePath = path.join(process.cwd(), '..', 'discrepancias_inventario.csv');
        fs.writeFileSync(filePath, header + rows, 'utf8');

        console.log(`Ficheiro CSV gerado com sucesso em: ${filePath}`);

    } catch (e) {
        console.error('Erro ao exportar CSV:', e);
    } finally {
        process.exit(0);
    }
}

exportCSV();
