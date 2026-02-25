-- Add virtual_stock columns to parts table
ALTER TABLE parts ADD COLUMN IF NOT EXISTS virtual_stock INTEGER DEFAULT 0;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS virtual_stock_contract INTEGER DEFAULT 0;

-- Function to calculate virtual stock for a part (recursive for composed parts)
CREATE OR REPLACE FUNCTION calculate_virtual_stock(p_id INTEGER, p_stock_type TEXT DEFAULT 'GENERAL')
RETURNS INTEGER AS $$
DECLARE
    r_stock INTEGER;
    comp RECORD;
    min_possible INTEGER := 999999;
    comp_stock INTEGER;
    v_is_composed BOOLEAN;
    v_stock_qty INTEGER;
    v_reserved_qty INTEGER;
BEGIN
    -- Get part info based on stock type
    IF p_stock_type = 'CONTRACT' THEN
        SELECT is_composed, stock_quantity_contract, reserved_quantity_contract 
        INTO v_is_composed, v_stock_qty, v_reserved_qty
        FROM parts WHERE id = p_id;
    ELSE
        SELECT is_composed, stock_quantity, reserved_quantity 
        INTO v_is_composed, v_stock_qty, v_reserved_qty
        FROM parts WHERE id = p_id;
    END IF;

    -- If not composed, virtual stock is simply (stock - reserved)
    IF v_is_composed IS NOT TRUE THEN
        RETURN GREATEST(0, v_stock_qty - v_reserved_qty);
    END IF;

    -- If composed, calculate based on composed hierarchy
    FOR comp IN SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = p_id LOOP
        -- Recursively get virtual stock of child
        IF p_stock_type = 'CONTRACT' THEN
            SELECT stock_quantity_contract - reserved_quantity_contract INTO comp_stock FROM parts WHERE id = comp.child_part_id;
        ELSE
            SELECT stock_quantity - reserved_quantity INTO comp_stock FROM parts WHERE id = comp.child_part_id;
        END IF;
        
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

-- Function to update virtual stock for a specific part
CREATE OR REPLACE FUNCTION update_part_virtual_stock()
RETURNS TRIGGER AS $$
DECLARE
    parent_rec RECORD;
BEGIN
    -- Update the part itself
    NEW.virtual_stock := calculate_virtual_stock(NEW.id, 'GENERAL');
    NEW.virtual_stock_contract := calculate_virtual_stock(NEW.id, 'CONTRACT');
    
    -- If this part is a component of other parts (parents), update them too
    FOR parent_rec IN SELECT parent_part_id FROM part_components WHERE child_part_id = NEW.id LOOP
        UPDATE parts SET 
            virtual_stock = calculate_virtual_stock(parent_rec.parent_part_id, 'GENERAL'),
            virtual_stock_contract = calculate_virtual_stock(parent_rec.parent_part_id, 'CONTRACT')
        WHERE id = parent_rec.parent_part_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update virtual stock when stock_quantity or reserved_quantity changes
DROP TRIGGER IF EXISTS trigger_update_virtual_stock ON parts;
CREATE TRIGGER trigger_update_virtual_stock
BEFORE UPDATE OF stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract, is_composed ON parts
FOR EACH ROW
EXECUTE FUNCTION update_part_virtual_stock();

-- Also need a trigger on part_components changes
CREATE OR REPLACE FUNCTION update_parent_virtual_stock_on_component_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE parts SET 
            virtual_stock = calculate_virtual_stock(OLD.parent_part_id, 'GENERAL'),
            virtual_stock_contract = calculate_virtual_stock(OLD.parent_part_id, 'CONTRACT')
        WHERE id = OLD.parent_part_id;
        RETURN OLD;
    ELSE
        UPDATE parts SET 
            virtual_stock = calculate_virtual_stock(NEW.parent_part_id, 'GENERAL'),
            virtual_stock_contract = calculate_virtual_stock(NEW.parent_part_id, 'CONTRACT')
        WHERE id = NEW.parent_part_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_virtual_on_component_change ON part_components;
CREATE TRIGGER trigger_update_virtual_on_component_change
AFTER INSERT OR UPDATE OR DELETE ON part_components
FOR EACH ROW
EXECUTE FUNCTION update_parent_virtual_stock_on_component_change();

-- Initial calculation for all parts
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_contract = calculate_virtual_stock(id, 'CONTRACT');
