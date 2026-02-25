
import { Pool } from 'pg';
import * as inventoryService from '../inventoryService';
import * as scheduleService from '../scheduleService';
import * as reportService from '../reportService';
import { StockType, ScheduleStatus, TicketStatus } from '../../types';
import path from 'path';
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runComplexIntegrationTest() {
    const client = await pool.connect();
    try {
        console.log('--- INICIANDO TESTE DE INTEGRAÇÃO COMPLEXO: AGENDAMENTO E RELATÓRIO ---');
        await client.query('BEGIN');

        // 0. Obter IDs válidos para evitar erros de FK
        let validUserId = '00000000-0000-0000-0000-000000000000';
        let validClientId = 1;
        let validEquipmentId = 1;

        try {
            const { rows: userRows } = await client.query('SELECT id FROM profiles LIMIT 1');
            if (userRows.length > 0) validUserId = userRows[0].id;

            const { rows: clientRows } = await client.query('SELECT id FROM clients LIMIT 1');
            if (clientRows.length > 0) validClientId = clientRows[0].id;

            const { rows: equipRows } = await client.query('SELECT id FROM equipments LIMIT 1');
            if (equipRows.length > 0) validEquipmentId = equipRows[0].id;

        } catch (e) {
            console.warn('Alerta: Erro ao buscar IDs reais, usando defaults. Pode haver falha de FK.', (e as any).message);
        }
        console.log(`Usando IDs: User=${validUserId}, Client=${validClientId}, Equipment=${validEquipmentId}`);

        // 1. Setup: Criar peças com stock
        console.log('1. Preparando peças (Pneu e Jante)...');
        const p1 = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, is_composed) VALUES ('INT-PNEU', 'Pneu Original', 20, 0, false) RETURNING id`);
        const p2 = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, is_composed) VALUES ('INT-JANTE', 'Jante Original', 20, 0, false) RETURNING id`);
        const idPneu = p1.rows[0].id;
        const idJante = p2.rows[0].id;

        // 2. Criar Agendamento e Reservar
        console.log('2. Criando Agendamento com reserva de 2 Pneus...');
        const s1 = await client.query(`INSERT INTO schedules (title, "startDate", "endDate", "isCompleted") VALUES ('Teste Agendamento', NOW(), NOW(), false) RETURNING id`);
        const scheduleId = s1.rows[0].id;

        await scheduleService.syncPartsAndReservations(client, scheduleId, [{ id: idPneu, quantity: 2, stockType: StockType.GENERAL }], false);

        let pneu = await client.query(`SELECT stock_quantity, reserved_quantity FROM parts WHERE id = $1`, [idPneu]);
        console.log(`Pneu após reserva: Stock=${pneu.rows[0].stock_quantity}, Reservado=${pneu.rows[0].reserved_quantity} (Esperado: 20, 2)`);

        // 3. Modificar Agendamento (Trocar Pneu por Jante)
        console.log('3. Modificando Agendamento: Trocar 2 Pneus por 1 Jante...');
        await scheduleService.syncPartsAndReservations(client, scheduleId, [{ id: idJante, quantity: 1, stockType: StockType.GENERAL }], false);

        pneu = await client.query(`SELECT reserved_quantity FROM parts WHERE id = $1`, [idPneu]);
        let jante = await client.query(`SELECT reserved_quantity FROM parts WHERE id = $1`, [idJante]);
        console.log(`Pneu reservado: ${pneu.rows[0].reserved_quantity} (Esperado: 0)`);
        console.log(`Jante reservada: ${jante.rows[0].reserved_quantity} (Esperado: 1)`);

        // 4. Concluir Agendamento
        console.log('4. Concluindo Agendamento (Reservas devem ser limpas)...');
        // Usamos syncPartsAndReservations diretamente como o completeFullSchedule faz
        await scheduleService.syncPartsAndReservations(client, scheduleId, [{ id: idJante, quantity: 1, stockType: StockType.GENERAL }], true);
        await client.query(`UPDATE schedules SET "isCompleted" = true WHERE id = $1`, [scheduleId]);

        jante = await client.query(`SELECT stock_quantity, reserved_quantity FROM parts WHERE id = $1`, [idJante]);
        console.log(`Jante após conclusão: Stock=${jante.rows[0].stock_quantity}, Reservado=${jante.rows[0].reserved_quantity} (Esperado: 20, 0)`);

        // 5. Criar Relatório (Abate Stock)
        console.log('5. Criando Relatório (Abate 1 Jante)...');
        const reportData = {
            clientId: validClientId,
            equipmentId: validEquipmentId,
            scheduleId: scheduleId,
            serviceDate: new Date().toISOString(),
            hours: 1,
            description: 'Teste',
            technicianIds: [],
            parts: [{ id: idJante, quantity: 1, stockType: StockType.GENERAL }]
        };
        const reportId = await reportService.createFullReport(client, reportData, validUserId);

        jante = await client.query(`SELECT stock_quantity, reserved_quantity FROM parts WHERE id = $1`, [idJante]);
        console.log(`Jante após Relatório: Stock=${jante.rows[0].stock_quantity}, Reservado=${jante.rows[0].reserved_quantity} (Esperado: 19, 0)`);

        // 6. Atualizar Relatório (Adicionar 1 Pneu também)
        console.log('6. Atualizando Relatório: Adicionar 1 Pneu (Total: 1 Jante + 1 Pneu)...');
        const updateData = {
            ...reportData,
            clientId: validClientId,
            equipmentId: validEquipmentId,
            parts: [
                { id: idJante, quantity: 1, stockType: StockType.GENERAL },
                { id: idPneu, quantity: 1, stockType: StockType.GENERAL }
            ]
        };
        await reportService.updateFullReport(client, reportId, updateData);

        pneu = await client.query(`SELECT stock_quantity FROM parts WHERE id = $1`, [idPneu]);
        jante = await client.query(`SELECT stock_quantity FROM parts WHERE id = $1`, [idJante]);
        console.log(`Stocks após Update Report: Pneu=${pneu.rows[0].stock_quantity}, Jante=${jante.rows[0].stock_quantity} (Esperado: 19, 19)`);

        // 7. Eliminar Relatório (Restaurar Stock)
        console.log('7. Eliminando Relatório (Restaurar stocks de Jante e Pneu)...');
        await reportService.deleteFullReport(client, reportId, validUserId, true);

        pneu = await client.query(`SELECT stock_quantity FROM parts WHERE id = $1`, [idPneu]);
        jante = await client.query(`SELECT stock_quantity FROM parts WHERE id = $1`, [idJante]);
        console.log(`Stocks após Delete Report: Pneu=${pneu.rows[0].stock_quantity}, Jante=${jante.rows[0].stock_quantity} (Esperado: 20, 20)`);

        await client.query('ROLLBACK');
        console.log('--- TESTE COMPLEXO CONCLUÍDO COM SUCESSO E ROLLBACK EXECUTADO ---');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ERRO NO TESTE COMPLEXO:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runComplexIntegrationTest();
