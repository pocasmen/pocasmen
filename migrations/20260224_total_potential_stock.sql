
-- Adjust virtual stock to represent "Total Potential" (Assembled + Can Assemble)
-- This logic assumes 'stock_quantity' of simple parts is the raw total.

CREATE OR REPLACE FUNCTION get_raw_stock(p_id INTEGER, p_stock_type TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_stock INTEGER;
BEGIN
    IF p_stock_type = 'CONTRACT' THEN
        SELECT stock_quantity_contract INTO v_stock FROM parts WHERE id = p_id;
    ELSE
        SELECT stock_quantity INTO v_stock FROM parts WHERE id = p_id;
    END IF;
    RETURN COALESCE(v_stock, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_virtual_stock(p_id INTEGER, p_stock_type TEXT DEFAULT 'GENERAL')
RETURNS INTEGER AS $$
DECLARE
    v_is_composed BOOLEAN;
    v_parent_stock INTEGER;
    v_min_from_comps INTEGER := 999999;
    comp RECORD;
    v_comp_raw_stock INTEGER;
    v_can_make INTEGER;
    v_has_components BOOLEAN := false;
BEGIN
    SELECT is_composed INTO v_is_composed FROM parts WHERE id = p_id;
    v_parent_stock := get_raw_stock(p_id, p_stock_type);

    -- If simple part, virtual stock IS the raw physical stock
    IF v_is_composed IS NOT TRUE THEN
        RETURN v_parent_stock;
    END IF;

    -- If Kit, calculate based on components' RAW stock
    -- Potential = (Already Assembled) + min(Components Stock / Needed)
    FOR comp IN SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = p_id LOOP
        v_has_components := true;
        v_comp_raw_stock := get_raw_stock(comp.child_part_id, p_stock_type);
        v_can_make := FLOOR(v_comp_raw_stock / comp.quantity);
        IF v_can_make < v_min_from_comps THEN
            v_min_from_comps := v_can_make;
        END IF;
    END LOOP;

    IF NOT v_has_components OR v_min_from_comps = 999999 THEN
        -- If it's a kit but has no components defined yet, just return its own physical stock
        RETURN GREATEST(0, v_parent_stock);
    END IF;

    RETURN GREATEST(0, v_parent_stock + v_min_from_comps);
END;
$$ LANGUAGE plpgsql;

-- Force recalculation with the new "Total Potential" logic
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
