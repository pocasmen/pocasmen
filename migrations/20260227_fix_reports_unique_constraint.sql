-- Migration: fix_reports_unique_constraint
-- Description: Changes the unique constraint on reports.scheduleId to a partial unique index that ignores soft-deleted rows.
-- This allows creating a new report for a schedule if the previous one was deleted.

-- Drop the existing unique constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_scheduleid_unique' AND conrelid = 'reports'::regclass) THEN
        ALTER TABLE reports DROP CONSTRAINT reports_scheduleid_unique;
    END IF;
END $$;

-- Drop the index if it was already created as an index
DROP INDEX IF EXISTS reports_scheduleid_unique;

-- Create a partial unique index that only considers active (non-deleted) reports
CREATE UNIQUE INDEX IF NOT EXISTS reports_scheduleid_active_unique ON reports ("scheduleId") WHERE deleted_at IS NULL;
