-- migration: 20260324_create_parts_transactions.sql

-- Task 1: Create Enum
DO $$ BEGIN
    CREATE TYPE part_transaction_type AS ENUM ('AD_HOC', 'PURCHASE_ORDER', 'SERVICE_REPORT', 'DIRECT_SALE', 'MANUAL_ADJUST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Table parts_transactions
CREATE TABLE IF NOT EXISTS parts_transactions (
    id SERIAL PRIMARY KEY,
    part_id INTEGER NOT NULL REFERENCES parts(id),
    user_id UUID REFERENCES profiles(id),
    quantity INTEGER NOT NULL,
    stock_type TEXT NOT NULL CHECK (stock_type IN ('general', 'contract')),
    type part_transaction_type NOT NULL,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for history lookups
CREATE INDEX IF NOT EXISTS idx_parts_transactions_part_id ON parts_transactions(part_id);

-- Trigger Function fn_sync_parts_ledger_to_stock()
CREATE OR REPLACE FUNCTION fn_sync_parts_ledger_to_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar stock_quantity ou stock_quantity_foss
    IF NEW.stock_type = 'general' THEN
        UPDATE parts 
        SET stock_quantity = stock_quantity + NEW.quantity
        WHERE id = NEW.part_id;
        
        -- Se for PURCHASE_ORDER e a quantidade for positiva (entrada), abater das quantidades encomendadas
        IF NEW.type = 'PURCHASE_ORDER' AND NEW.quantity > 0 THEN
            UPDATE parts 
            SET ordered_quantity = GREATEST(0, ordered_quantity - NEW.quantity)
            WHERE id = NEW.part_id;
        END IF;
    ELSIF NEW.stock_type = 'contract' THEN
        UPDATE parts 
        SET stock_quantity_foss = stock_quantity_foss + NEW.quantity
        WHERE id = NEW.part_id;
        
        -- Se for PURCHASE_ORDER e a quantidade for positiva (entrada), abater das quantidades encomendadas
        IF NEW.type = 'PURCHASE_ORDER' AND NEW.quantity > 0 THEN
            UPDATE parts 
            SET ordered_quantity_foss = GREATEST(0, ordered_quantity_foss - NEW.quantity)
            WHERE id = NEW.part_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trg_parts_transactions_sync ON parts_transactions;
CREATE TRIGGER trg_parts_transactions_sync
AFTER INSERT ON parts_transactions
FOR EACH ROW
EXECUTE FUNCTION fn_sync_parts_ledger_to_stock();
