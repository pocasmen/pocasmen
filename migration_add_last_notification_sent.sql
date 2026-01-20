-- Migration: Add last_notification_sent column to profiles table
-- Purpose: Track when the last daily reminder was sent to prevent duplicates

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_notification_sent TIMESTAMP;

-- Create index for faster queries on notification time
CREATE INDEX IF NOT EXISTS idx_profiles_notification_time 
ON profiles(notification_time) 
WHERE daily_notifications_enabled = true;

-- Add comment for documentation
COMMENT ON COLUMN profiles.last_notification_sent IS 'Timestamp of the last daily reminder notification sent to this user';
