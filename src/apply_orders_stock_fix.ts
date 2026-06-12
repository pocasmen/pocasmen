import { pool } from './config/db';

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Updating CHECK constraints...');
        
        // parts_order_items
        await client.query('ALTER TABLE parts_order_items DROP CONSTRAINT IF EXISTS parts_order_items_stock_type_check');
        await client.query("ALTER TABLE parts_order_items ADD CONSTRAINT parts_order_items_stock_type_check CHECK (stock_type = ANY (ARRAY['general'::text, 'contract'::text, 'foss'::text, 'msd'::text]))");

        // parts_transactions
        await client.query('ALTER TABLE parts_transactions DROP CONSTRAINT IF EXISTS parts_transactions_stock_type_check');
        await client.query("ALTER TABLE parts_transactions ADD CONSTRAINT parts_transactions_stock_type_check CHECK (stock_type = ANY (ARRAY['general'::text, 'contract'::text, 'foss'::text, 'msd'::text]))");

        console.log('Updating trigger function fn_sync_parts_ledger_to_stock...');

        await client.query(`
            CREATE OR REPLACE FUNCTION public.fn_sync_parts_ledger_to_stock() RETURNS trigger
                LANGUAGE plpgsql
                AS $$
            BEGIN
                -- Mapeamento: 'foss' atualiza colunas _foss. Outros ('general', 'contract', 'msd') atualizam colunas standard.
                IF NEW.stock_type = 'foss' THEN
                    UPDATE parts 
                    SET stock_quantity_foss = stock_quantity_foss + NEW.quantity
                    WHERE id = NEW.part_id;
                    
                    -- Se for PURCHASE_ORDER e a quantidade for positiva (entrada), abater das quantidades encomendadas
                    IF NEW.type = 'PURCHASE_ORDER' AND NEW.quantity > 0 THEN
                        UPDATE parts 
                        SET ordered_quantity_foss = GREATEST(0, ordered_quantity_foss - NEW.quantity)
                        WHERE id = NEW.part_id;
                    END IF;
                ELSE
                    -- 'general', 'contract', 'msd'
                    UPDATE parts 
                    SET stock_quantity = stock_quantity + NEW.quantity
                    WHERE id = NEW.part_id;
                    
                    -- Se for PURCHASE_ORDER e a quantidade for positiva (entrada), abater das quantidades encomendadas
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
