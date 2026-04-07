DO $$
DECLARE
    r RECORD;
    diff INTEGER;
BEGIN
    -- Usar session_replication_role = 'replica' para desativar triggers localmente nesta sessão
    SET session_replication_role = 'replica';

    -- 1. Sincronizar Stock FOSS (Contract)
    FOR r IN 
        SELECT p.id, p.reference, p.stock_quantity_foss, 
               COALESCE((SELECT SUM(quantity) FROM parts_transactions WHERE part_id = p.id AND stock_type = 'contract'), 0) as ledger_sum
        FROM parts p
        WHERE p.is_composed = false
    LOOP
        diff := r.stock_quantity_foss - r.ledger_sum;
        IF diff != 0 THEN
            RAISE NOTICE 'Reconciliando FOSS para %: Stock=%, Ledger=%, Diff=%', r.reference, r.stock_quantity_foss, r.ledger_sum, diff;
            INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
            VALUES (r.id, diff, 'contract', 'MANUAL_ADJUST', 'Sincronização automática de reconciliação (Legacy Stock)');
        END IF;
    END LOOP;

    -- 2. Sincronizar Stock General
    FOR r IN 
        SELECT p.id, p.reference, p.stock_quantity, 
               COALESCE((SELECT SUM(quantity) FROM parts_transactions WHERE part_id = p.id AND stock_type = 'general'), 0) as ledger_sum
        FROM parts p
        WHERE p.is_composed = false
    LOOP
        diff := r.stock_quantity - r.ledger_sum;
        IF diff != 0 THEN
            RAISE NOTICE 'Reconciliando General para %: Stock=%, Ledger=%, Diff=%', r.reference, r.stock_quantity, r.ledger_sum, diff;
            INSERT INTO parts_transactions (part_id, quantity, stock_type, type, notes)
            VALUES (r.id, diff, 'general', 'MANUAL_ADJUST', 'Sincronização automática de reconciliação (Legacy Stock)');
        END IF;
    END LOOP;

    -- Voltar ao normal
    SET session_replication_role = 'origin';
END $$;
