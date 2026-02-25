
-- Fix virtual_stock logic: Simple parts should have 0 virtual_stock
-- Date: 2026-02-25

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

    -- Case A: Simple Part -> Virtual Stock is 0 (only physical stock_quantity matters)
    IF v_is_composed IS NOT TRUE THEN
        RETURN 0;
    END IF;

    -- Case B: Composed Part (Kit) -> Calculate potential assemblies from components
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

-- Initial sync to fix existing values
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
