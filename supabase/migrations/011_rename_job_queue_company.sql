-- Migration 011: Rename job_queue.company -> company_name + copy and generate company_slug

ALTER TABLE job_queue RENAME COLUMN company TO company_name;

-- Standard approach for generated columns in Postgres 12+
ALTER TABLE job_queue
ADD COLUMN company_slug text GENERATED ALWAYS AS (
  lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g'))
) STORED;
