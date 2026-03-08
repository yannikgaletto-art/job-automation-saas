-- Add 'coaching' to the tasks source constraint
-- Allows coaching analysis topics to be saved as tasks

-- Drop the old constraint (was: manual, pulse)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;

-- Re-create with coaching included
ALTER TABLE tasks
  ADD CONSTRAINT tasks_source_check
  CHECK (source IN ('manual', 'pulse', 'coaching')) NOT VALID;

-- Validate existing rows
ALTER TABLE tasks
  VALIDATE CONSTRAINT tasks_source_check;
