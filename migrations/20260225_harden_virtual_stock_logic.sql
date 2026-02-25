
-- Hardening of virtual_stock logic
-- Date: 2026-02-25

-- 1. Ensure default values are 0 for virtual stock columns
ALTER TABLE parts ALTER COLUMN virtual_stock SET DEFAULT 0;
ALTER TABLE parts ALTER COLUMN virtual_stock_contract SET DEFAULT 0;

-- 2. Update the trigger to include INSERT
-- This ensures that as soon as a part is created, the virtual_stock is calculated (and set to 0 if it's a simple part)
DROP TRIGGER IF EXISTS trigger_update_virtual_stock ON parts;

CREATE TRIGGER trigger_update_virtual_stock
AFTER INSERT OR UPDATE OF stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract, is_composed ON parts
FOR EACH ROW
WHEN (pg_trigger_depth() < 1)
EXECUTE FUNCTION update_part_virtual_stock_fn();

-- 3. Safety Check: Update any existing NULLs to 0
UPDATE parts SET 
    virtual_stock = COALESCE(virtual_stock, 0),
    virtual_stock_contract = COALESCE(virtual_stock_contract, 0);
