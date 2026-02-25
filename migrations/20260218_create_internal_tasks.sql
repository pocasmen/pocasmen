-- Migration: Create internal_tasks and internal_task_time_blocks
-- Description: Add support for internal tasks (events, training, etc.) with multiple time blocks.
-- Author: Antigravity AI
-- Date: 2026-02-18

CREATE TABLE IF NOT EXISTS public.internal_tasks (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL CONSTRAINT internal_tasks_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE, -- Assignee
    created_by UUID NOT NULL CONSTRAINT internal_tasks_created_by_fkey REFERENCES public.profiles(id) ON DELETE CASCADE, -- Creator
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL, -- 'event', 'training', 'webinar', 'vacation', 'admin', 'other'
    priority TEXT NOT NULL, -- 'high', 'medium', 'low'
    client_id INTEGER CONSTRAINT internal_tasks_client_id_fkey REFERENCES public.clients(id) ON DELETE SET NULL,
    equipment_id INTEGER CONSTRAINT internal_tasks_equipment_id_fkey REFERENCES public.equipments(id) ON DELETE SET NULL,
    is_private BOOLEAN NOT NULL DEFAULT true,
    show_on_calendar BOOLEAN NOT NULL DEFAULT false,
    estimated_hours DECIMAL(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.internal_task_time_blocks (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL
);

-- Index for performance and security filtering
CREATE INDEX IF NOT EXISTS idx_internal_tasks_user_id ON public.internal_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_is_private ON public.internal_tasks(is_private);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_internal_tasks_updated_at
    BEFORE UPDATE ON public.internal_tasks
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
