-- Ported from supabase/migrations/002_roll_visibility.sql.
-- The anon_update_reveal policy is dropped along with the rest of RLS; the
-- reveal endpoint enforces ownership instead.

ALTER TABLE room_rolls
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared',
  ADD COLUMN is_revealed BOOLEAN NOT NULL DEFAULT false;
