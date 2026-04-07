DO $$
DECLARE
    affected_count_foss INTEGER;
    affected_count_general INTEGER;
BEGIN
    -- 1. Sincronizar Stock FOSS (Contract) para igualar a soma das transações no Ledger
    -- Isto corrige o erro de "dupla contagem" que ocorreu na sincronização inicial
    WITH ledger_sums AS (
        SELECT part_id, SUM(quantity) as correct_sum
        FROM parts_transactions
        WHERE stock_type = 'contract'
        GROUP BY part_id
    )
    UPDATE parts p
    SET stock_quantity_foss = COALESCE(ls.correct_sum, 0)
    FROM ledger_sums ls
    WHERE p.id = ls.part_id
      AND p.is_composed = false
      AND p.stock_quantity_foss != COALESCE(ls.correct_sum, 0);
    
    GET DIAGNOSTICS affected_count_foss = ROW_COUNT;

    -- Caso existam partes no ledger que não estão na subquery (ex: soma é 0 e não há registos)
    UPDATE parts p
    SET stock_quantity_foss = 0
    WHERE p.is_composed = false
      AND p.stock_quantity_foss != 0
      AND NOT EXISTS (SELECT 1 FROM parts_transactions WHERE part_id = p.id AND stock_type = 'contract');

    -- 2. Sincronizar Stock General para igualar a soma das transações no Ledger
    WITH ledger_sums_gen AS (
        SELECT part_id, SUM(quantity) as correct_sum
        FROM parts_transactions
        WHERE stock_type = 'general'
        GROUP BY part_id
    )
    UPDATE parts p
    SET stock_quantity = COALESCE(lsg.correct_sum, 0)
    FROM ledger_sums_gen lsg
    WHERE p.id = lsg.part_id
      AND p.is_composed = false
      AND p.stock_quantity != COALESCE(lsg.correct_sum, 0);

    GET DIAGNOSTICS affected_count_general = ROW_COUNT;

    -- Peças sem transações gerais mas com stock != 0
    UPDATE parts p
    SET stock_quantity = 0
    WHERE p.is_composed = false
      AND p.stock_quantity != 0
      AND NOT EXISTS (SELECT 1 FROM parts_transactions WHERE part_id = p.id AND stock_type = 'general');

    RAISE NOTICE 'Sincronização concluída: % itens FOSS e % itens General corrigidos.', affected_count_foss, affected_count_general;
END $$;
