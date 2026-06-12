import { pool } from './config/db';

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Updating trigger function fn_sync_parts_ledger_to_stock to include "contract" in FOSS bucket...');

        await client.query(`
            CREATE OR REPLACE FUNCTION public.fn_sync_parts_ledger_to_stock() RETURNS trigger
                LANGUAGE plpgsql
                AS $$
            BEGIN
                -- NOVO MAPEAMENTO: 'foss' e 'contract' atualizam colunas _foss. 
                -- 'general' e 'msd' atualizam colunas standard.
                IF NEW.stock_type IN ('foss', 'contract') THEN
                    UPDATE parts 
                    SET stock_quantity_foss = stock_quantity_foss + NEW.quantity
                    WHERE id = NEW.part_id;
                    
                    IF NEW.type = 'PURCHASE_ORDER' AND NEW.quantity > 0 THEN
                        UPDATE parts 
                        SET ordered_quantity_foss = GREATEST(0, ordered_quantity_foss - NEW.quantity)
                        WHERE id = NEW.part_id;
                    END IF;
                ELSE
                    -- 'general', 'msd'
                    UPDATE parts 
                    SET stock_quantity = stock_quantity + NEW.quantity
                    WHERE id = NEW.part_id;
                    
                    IF NEW.type = 'PURCHASE_ORDER' AND NEW.quantity > 0 THEN
                        UPDATE parts 
                        SET ordered_quantity = GREATEST(0, ordered_quantity - NEW.quantity)
                        WHERE id = NEW.part_id;
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$;
        `);

        console.log('Migrating existing "contract" stock quantities from General to Foss columns...');

        // Identificar todas as peças que têm transações de 'contract'
        const { rows: affectedParts } = await client.query(`
            SELECT part_id, SUM(quantity) as total_contract
            FROM parts_transactions
            WHERE stock_type = 'contract'
            GROUP BY part_id
        `);

        for (const part of affectedParts) {
            console.log(`  Moving ${part.total_contract} units for Part ID ${part.part_id} from General to Foss...`);
            await client.query(`
                UPDATE parts 
                SET stock_quantity = GREATEST(0, stock_quantity - $1),
                    stock_quantity_foss = stock_quantity_foss + $1
                WHERE id = $2
            `, [part.total_contract, part.part_id]);
        }

        await client.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        client.release();
    }
}

migrate();
