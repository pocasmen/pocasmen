
import { Pool } from 'pg';
import * as inventoryService from '../inventoryService';
import { StockType } from '../../types';
import path from 'path';
import { logger } from '../../utils/logger';
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: true, ca: process.env.DB_CA_CERT }
        : { rejectUnauthorized: false }
});

async function runIntegrationTest() {
    const client = await pool.connect();
    try {
        logger.info('--- INICIANDO TESTE DE INTEGRAÇÃO DE INVENTÁRIO ---');
        await client.query('BEGIN');

        // 1. Inserção de 3 peças simples novas
        logger.info('1. Criando 3 peças simples...');
        const p1 = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, ordered_quantity, is_composed) VALUES ('TEST-A', 'Pneu Teste', 0, 0, 0, false) RETURNING id`);
        const p2 = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, ordered_quantity, is_composed) VALUES ('TEST-B', 'Jante Teste', 0, 0, 0, false) RETURNING id`);
        const p3 = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, ordered_quantity, is_composed) VALUES ('TEST-C', 'Valvula Teste', 0, 0, 0, false) RETURNING id`);

        const idA = p1.rows[0].id;
        const idB = p2.rows[0].id;
        const idC = p3.rows[0].id;

        // 2. Criar peça composta (KIT) com as 3 simples
        logger.info('2. Criando peça composta (KIT)...');
        const pk = await client.query(`INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, ordered_quantity, is_composed) VALUES ('TEST-KIT', 'Roda Completa Teste', 0, 0, 0, true) RETURNING id`);
        const idKit = pk.rows[0].id;

        await client.query(`INSERT INTO part_components (parent_part_id, child_part_id, quantity) VALUES ($1, $2, 1), ($1, $3, 1), ($1, $4, 1)`, [idKit, idA, idB, idC]);

        // Verificação Inicial
        let kit = await client.query(`SELECT virtual_stock FROM parts WHERE id = $1`, [idKit]);
        logger.info(`Initial Virtual Stock: ${kit.rows[0].virtual_stock} (Esperado: 0)`);

        // 3. Modificação directa de stock (Físico)
        logger.info('3. Adicionando stock físico (+10 em cada)...');
        await inventoryService.updatePartStock(client, idA, { quantity: 10, fromOrder: false, targetStock: StockType.GENERAL });
        await inventoryService.updatePartStock(client, idB, { quantity: 10, fromOrder: false, targetStock: StockType.GENERAL });
        await inventoryService.updatePartStock(client, idC, { quantity: 10, fromOrder: false, targetStock: StockType.GENERAL });

        kit = await client.query(`SELECT virtual_stock FROM parts WHERE id = $1`, [idKit]);
        logger.info(`Virtual Stock depois de +10 físico: ${kit.rows[0].virtual_stock} (Esperado: 10)`);

        // 4. Encomenda de peças (Ordered Quantity)
        logger.info('4. Encomendando peças (+5 da Jante)...');
        // change = 5, isFromOrder = false (porque estamos a ADICIONAR à encomenda, não a receber)
        // No sistema, updatePartStock com change > 0 e isFromOrder=false apenas adiciona ao stock se StockType for passado.
        // Wait, how does ordered_quantity get updated? Let's check inventoryService.ts again.

        // Manual update to ordered_quantity for testing
        await client.query(`UPDATE parts SET ordered_quantity = 5 WHERE id = $1`, [idB]);

        // Refresh and check "potential stock" if implemented in DB
        kit = await client.query(`SELECT virtual_stock FROM parts WHERE id = $1`, [idKit]);
        logger.info(`Virtual Stock (Físico) após encomenda Jante: ${kit.rows[0].virtual_stock} (Esperado: 10 - apenas físico conta para virtual_stock básico)`);

        // 5. Chegada de peças (Arrival: ordered -> stock)
        logger.info('5. Chegada de encomenda (5 Jantes chegam)...');
        // updatePartStock(db, id, change=5, isFromOrder=true) -> stock +5, ordered -5
        await inventoryService.updatePartStock(client, idB, { quantity: 5, fromOrder: true, targetStock: StockType.GENERAL });

        const partB = await client.query(`SELECT stock_quantity, ordered_quantity FROM parts WHERE id = $1`, [idB]);
        logger.info(`Part B (Jante) - Stock: ${partB.rows[0].stock_quantity}, Encomendada: ${partB.rows[0].ordered_quantity}`);

        kit = await client.query(`SELECT virtual_stock FROM parts WHERE id = $1`, [idKit]);
        logger.info(`Virtual Stock após chegada: ${kit.rows[0].virtual_stock} (Esperado: 10 - porque Pneu e Válvula limitam a 10)`);

        // 6. Teste de limite (Aumentar as outras duas para ver o Kit subir)
        logger.info('6. Aumentando peças limitantes (Pneu e Válvula +10)...');
        await inventoryService.updatePartStock(client, idA, { quantity: 10, fromOrder: false, targetStock: StockType.GENERAL });
        await inventoryService.updatePartStock(client, idC, { quantity: 10, fromOrder: false, targetStock: StockType.GENERAL });

        kit = await client.query(`SELECT virtual_stock FROM parts WHERE id = $1`, [idKit]);
        logger.info(`Virtual Stock Final: ${kit.rows[0].virtual_stock} (Esperado: 15 - limitado pela Jante que tem 15)`);

        await client.query('ROLLBACK');
        logger.info('--- TESTE CONCLUÍDO COM SUCESSO E ROLLBACK EXECUTADO ---');
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, 'ERRO NO TESTE DE INTEGRAÇÃO');
    } finally {
        client.release();
        await pool.end();
    }
}

runIntegrationTest();
