-- 1. Extend ticket_status enum with 'void'
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'void';
