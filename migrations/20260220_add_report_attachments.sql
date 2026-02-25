-- 1. Create table for report attachments
CREATE TABLE IF NOT EXISTS public.report_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id INTEGER REFERENCES public.reports(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_by_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add default settings for image compression if they don't exist
INSERT INTO public.settings (key, value)
VALUES 
    ('img_compression_quality', '0.7'),
    ('img_compression_max_width', '1280')
ON CONFLICT (key) DO NOTHING;
