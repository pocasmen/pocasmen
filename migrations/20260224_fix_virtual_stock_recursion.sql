
-- Fix virtual_stock calculation to be truly recursive and improve propagation
CREATE OR REPLACE FUNCTION calculate_virtual_stock(p_id INTEGER, p_stock_type TEXT DEFAULT 'GENERAL')
RETURNS INTEGER AS $$
DECLARE
    comp RECORD;
    min_possible INTEGER := 999999;
    comp_stock INTEGER;
    v_is_composed BOOLEAN;
    v_stock_qty INTEGER;
    v_reserved_qty INTEGER;
BEGIN
    -- Get part info
    SELECT is_composed, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract
    INTO v_is_composed, v_stock_qty, v_reserved_qty, v_stock_qty, v_reserved_qty -- Just placeholder, we assign below
    FROM parts WHERE id = p_id;

    IF p_stock_type = 'CONTRACT' THEN
        SELECT stock_quantity_contract, reserved_quantity_contract INTO v_stock_qty, v_reserved_qty FROM parts WHERE id = p_id;
    ELSE
        SELECT stock_quantity, reserved_quantity INTO v_stock_qty, v_reserved_qty FROM parts WHERE id = p_id;
    END IF;

    -- If not composed, virtual stock is simply (stock - reserved)
    IF v_is_composed IS NOT TRUE THEN
        RETURN GREATEST(0, v_stock_qty - v_reserved_qty);
    END IF;

    -- If composed, calculate based on components
    FOR comp IN SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = p_id LOOP
        -- TRULY Recursive call
        comp_stock := calculate_virtual_stock(comp.child_part_id, p_stock_type);
        
        IF comp_stock IS NULL THEN
            comp_stock := 0;
        END IF;

        min_possible := LEAST(min_possible, FLOOR(comp_stock / comp.quantity));
    END LOOP;

    IF min_possible = 999999 THEN
        RETURN 0;
    END IF;

    RETURN GREATEST(0, min_possible);
END;
$$ LANGUAGE plpgsql;

-- Improve Trigger to be AFTER UPDATE and handle depth better
-- (Using BEFORE UPDATE for the self-column update is fine, but propagation should be careful)

-- We'll stay with the existing trigger structure but make sure we recalculate EVERYTHING on changes.
-- Correcting the update function to propagate upwards
CREATE OR REPLACE FUNCTION update_part_virtual_stock()
RETURNS TRIGGER AS $$
DECLARE
    parent_rec RECORD;
BEGIN
    -- 1. Update the current part's virtual stock columns
    NEW.virtual_stock := calculate_virtual_stock(NEW.id, 'GENERAL');
    NEW.virtual_stock_contract := calculate_virtual_stock(NEW.id, 'CONTRACT');
    
    -- 2. Propagate to parents. Each UPDATE on a parent will fire this same trigger on that parent.
    -- This handles any depth of kits.
    FOR parent_rec IN SELECT parent_part_id FROM part_components WHERE child_part_id = NEW.id LOOP
        -- We just need to trigger an update. The BEFORE UPDATE trigger on the parent will do the job.
        -- We set a dummy value or just the column itself to trigger it.
        UPDATE parts SET 
            -- This will fire the trigger on the parent, which will call calculate_virtual_stock for it
            virtual_stock = calculate_virtual_stock(parent_rec.parent_part_id, 'GENERAL') 
        WHERE id = parent_rec.parent_part_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Final Step: Force a full recalculation of all parts to fix current data
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
