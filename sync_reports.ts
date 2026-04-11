
import { pool } from './src/config/db';

async function syncAllReports() {
    console.log("Iniciando sincronização de datas dos relatórios...");
    try {
        const { rows } = await pool.query(`
            SELECT id, time_blocks 
            FROM reports 
            WHERE deleted_at IS NULL AND time_blocks IS NOT NULL AND jsonb_array_length(time_blocks) > 0
        `);

        let updatedCount = 0;
        for (const report of rows) {
            const firstBlock = report.time_blocks[0];
            const firstDate = firstBlock.start || firstBlock.start_time;
            
            if (firstDate) {
                await pool.query(
                    'UPDATE reports SET "serviceDate" = $1 WHERE id = $2',
                    [firstDate, report.id]
                );
                updatedCount++;
            }
        }

        console.log(`Sucesso! ${updatedCount} relatórios sincronizados.`);
        process.exit(0);
    } catch (err) {
        console.error("Erro na sincronização:", err);
        process.exit(1);
    }
}

syncAllReports();
