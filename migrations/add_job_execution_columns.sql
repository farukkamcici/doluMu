-- Migration: Add end_date and metadata columns to job_executions table
-- Date: 2025-12-12
-- Description: Support multi-day forecast tracking and additional job metadata

-- Add end_date column to track date range for multi-day jobs
ALTER TABLE job_executions 
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add metadata column to store additional job information as JSON
ALTER TABLE job_executions 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comment to columns for documentation
COMMENT ON COLUMN job_executions.end_date IS 'End date for multi-day jobs (NULL for single-day jobs)';
COMMENT ON COLUMN job_executions.metadata IS 'Additional job metadata stored as JSON (e.g., num_days, days array, issues)';

-- Create index on metadata for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_job_executions_metadata ON job_executions USING gin(metadata);

-- Update existing records to have empty metadata
UPDATE job_executions 
SET metadata = '{}'::jsonb 
WHERE metadata IS NULL;
