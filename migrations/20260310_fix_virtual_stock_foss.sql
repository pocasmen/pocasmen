
-- Migration to rename 'virtual_stock_contract' to 'virtual_stock_foss' in all DB logic
-- and update related column references (stock_quantity_contract, reserved_quantity_contract)

-- 0. Drop dependent triggers and functions first to avoid dependency errors
DROP TRIGGER IF EXISTS trigger_update_virtual_stock ON parts;
DROP TRIGGER IF EXISTS trigger_update_parent_virtual_stock ON part_components;

-- Drop functions (using CASCADE to handle any other dependencies safely)
DROP FUNCTION IF EXISTS calculate_virtual_stock(INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_available_stock(INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_part_virtual_stock_fn() CASCADE;
DROP FUNCTION IF EXISTS update_parent_virtual_stock_on_component_change() CASCADE;

-- 1. Create get_available_stock to use FOSS columns instead of CONTRACT
CREATE OR REPLACE FUNCTION get_available_stock(p_id INTEGER, p_stock_type TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_stock INTEGER;
    v_res INTEGER;
BEGIN
    IF p_stock_type = 'CONTRACT' OR p_stock_type = 'FOSS' THEN
        SELECT stock_quantity_foss, reserved_quantity_foss INTO v_stock, v_res FROM parts WHERE id = p_id;
    ELSE
        SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM parts WHERE id = p_id;
    END IF;
    RETURN GREATEST(0, COALESCE(v_stock, 0) - COALESCE(v_res, 0));
END;
$$ LANGUAGE plpgsql;

-- 2. Create calculate_virtual_stock
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

-- 3. Create Trigger Function to use virtual_stock_foss instead of virtual_stock_contract
CREATE OR REPLACE FUNCTION update_part_virtual_stock_fn()
RETURNS TRIGGER AS $$
DECLARE
    parent_id INTEGER;
BEGIN
    -- This runs AFTER the simple part or kit itself is updated.
    -- If it's a simple part, update its own virtual columns
    UPDATE parts SET 
        virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
        virtual_stock_foss = calculate_virtual_stock(id, 'FOSS')
    WHERE id = NEW.id;

    -- Then, find all Kits that use this part and update them
    FOR parent_id IN SELECT parent_part_id FROM part_components WHERE child_part_id = NEW.id LOOP
        UPDATE parts SET 
            virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
            virtual_stock_foss = calculate_virtual_stock(id, 'FOSS')
        WHERE id = parent_id;
    END LOOP;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-configure Trigger with new column dependencies
CREATE TRIGGER trigger_update_virtual_stock
AFTER UPDATE OF stock_quantity, reserved_quantity, stock_quantity_foss, reserved_quantity_foss, is_composed ON parts
FOR EACH ROW
WHEN (pg_trigger_depth() < 1) 
EXECUTE FUNCTION update_part_virtual_stock_fn();

-- 5. Create component change trigger function
CREATE OR REPLACE FUNCTION update_parent_virtual_stock_on_component_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE parts SET
            virtual_stock = calculate_virtual_stock(OLD.parent_part_id, 'GENERAL'),
            virtual_stock_foss = calculate_virtual_stock(OLD.parent_part_id, 'FOSS')
        WHERE id = OLD.parent_part_id;
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        UPDATE parts SET
            virtual_stock = calculate_virtual_stock(NEW.parent_part_id, 'GENERAL'),
            virtual_stock_foss = calculate_virtual_stock(NEW.parent_part_id, 'FOSS')
        WHERE id = NEW.parent_part_id;
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE parts SET
            virtual_stock = calculate_virtual_stock(NEW.parent_part_id, 'GENERAL'),
            virtual_stock_foss = calculate_virtual_stock(NEW.parent_part_id, 'FOSS')
        WHERE id = NEW.parent_part_id;
        IF (OLD.parent_part_id <> NEW.parent_part_id) THEN
            UPDATE parts SET
                virtual_stock = calculate_virtual_stock(OLD.parent_part_id, 'GENERAL'),
                virtual_stock_foss = calculate_virtual_stock(OLD.parent_part_id, 'FOSS')
            WHERE id = OLD.parent_part_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- 5.1 Re-configure component trigger
CREATE TRIGGER trigger_update_parent_virtual_stock
AFTER INSERT OR UPDATE OR DELETE ON part_components
FOR EACH ROW
EXECUTE FUNCTION update_parent_virtual_stock_on_component_change();

-- 6. Force initial sync using new columns
UPDATE parts SET 
    virtual_stock = calculate_virtual_stock(id, 'GENERAL'),
    virtual_stock_foss = calculate_virtual_stock(id, 'FOSS');
