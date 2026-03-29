-- migration: 20260324_create_parts_orders.sql

DO $$ BEGIN
    CREATE TYPE parts_order_status AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS parts_orders (
    id SERIAL PRIMARY KEY,
    document_number TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    status parts_order_status DEFAULT 'PENDING' NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parts_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES parts_orders(id) ON DELETE CASCADE,
    part_id INTEGER NOT NULL REFERENCES parts(id),
    designation TEXT,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0 NOT NULL,
    stock_type TEXT NOT NULL CHECK (stock_type IN ('general', 'contract')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parts_orders_status ON parts_orders(status);
CREATE INDEX IF NOT EXISTS idx_parts_order_items_order_id ON parts_order_items(order_id);
