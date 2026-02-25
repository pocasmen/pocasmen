
-- Final simple logic for flat kit structure
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

    -- If simple part, virtual = stock - reserved
    IF v_is_composed IS NOT TRUE THEN
        RETURN get_available_stock(p_id, p_stock_type);
    END IF;

    -- If Kit, check ONLY its direct children (no recursion)
    FOR comp IN SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = p_id LOOP
        v_has_components := true;
        -- Use get_available_stock to avoid any recursive loops
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

UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
