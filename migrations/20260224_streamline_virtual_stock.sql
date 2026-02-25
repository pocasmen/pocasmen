
-- Simplify and fix virtual stock calculation (No recursion, accurate timing)

-- 1. Simple function for simple parts
CREATE OR REPLACE FUNCTION get_available_stock(p_id INTEGER, p_stock_type TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_stock INTEGER;
    v_res INTEGER;
BEGIN
    IF p_stock_type = 'CONTRACT' THEN
        SELECT stock_quantity_contract, reserved_quantity_contract INTO v_stock, v_res FROM parts WHERE id = p_id;
    ELSE
        SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM parts WHERE id = p_id;
    END IF;
    RETURN GREATEST(0, COALESCE(v_stock, 0) - COALESCE(v_res, 0));
END;
$$ LANGUAGE plpgsql;

-- 2. Main calculation function (Non-recursive as requested)
CREATE OR REPLACE FUNCTION calculate_virtual_stock(p_id INTEGER, p_stock_type TEXT DEFAULT 'GENERAL')
RETURNS INTEGER AS $$
DECLARE
    v_is_composed BOOLEAN;
    v_min INTEGER := 999999;
    comp RECORD;
    v_available INTEGER;
    v_can_make INTEGER;
    v_has_components BOOLEAN := false;
BEGIN
    SELECT is_composed INTO v_is_composed FROM parts WHERE id = p_id;

    -- Case A: Simple Part
    IF v_is_composed IS NOT TRUE THEN
        RETURN get_available_stock(p_id, p_stock_type);
    END IF;

    -- Case B: Composed Part (Kit)
    FOR comp IN SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = p_id LOOP
        v_has_components := true;
        v_available := get_available_stock(comp.child_part_id, p_stock_type);
        v_can_make := FLOOR(v_available / comp.quantity);
        IF v_can_make < v_min THEN
            v_min := v_can_make;
        END IF;
    END LOOP;

    IF NOT v_has_components OR v_min = 999999 THEN
        RETURN 0;
    END IF;

    RETURN GREATEST(0, v_min);
END;
$$ LANGUAGE plpgsql;

-- 3. Optimized Trigger Function
CREATE OR REPLACE FUNCTION update_part_virtual_stock_fn()
RETURNS TRIGGER AS $$
DECLARE
    parent_id INTEGER;
BEGIN
    -- This runs AFTER the simple part or kit itself is updated.
    -- If it's a simple part, update its own virtual columns
    UPDATE parts SET 
        virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
        virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT')
    WHERE id = NEW.id;

    -- Then, find all Kits that use this part and update them
    FOR parent_id IN SELECT parent_part_id FROM part_components WHERE child_part_id = NEW.id LOOP
        UPDATE parts SET 
            virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
            virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT')
        WHERE id = parent_id;
    END LOOP;

    RETURN NULL; -- AFTER trigger return is ignored
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate Trigger as AFTER UPDATE
DROP TRIGGER IF EXISTS trigger_update_virtual_stock ON parts;
CREATE TRIGGER trigger_update_virtual_stock
AFTER UPDATE OF stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract, is_composed ON parts
FOR EACH ROW
WHEN (pg_trigger_depth() < 1) -- Prevent infinite recursion
EXECUTE FUNCTION update_part_virtual_stock_fn();

-- 5. Force initial sync
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
