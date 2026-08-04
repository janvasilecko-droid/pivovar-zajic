-- Add who column to fasovani and fasovani_private tables
ALTER TABLE public.fasovani ADD COLUMN IF NOT EXISTS who text;
ALTER TABLE public.fasovani_private ADD COLUMN IF NOT EXISTS who text;
