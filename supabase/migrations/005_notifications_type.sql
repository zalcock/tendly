-- Fix notifications.type check constraint to include 'daily_digest'
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('NEW_HIGH_FIT', 'DEADLINE_REMINDER', 'RFP_AMENDMENT', 'daily_digest'));
