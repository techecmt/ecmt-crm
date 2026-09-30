-- Align DB lead_status enum with CRM pipeline (bulk update + reporting).
-- Enum values must be committed before use in functions (split across migrations).

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'withdrawn';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'dropped';
