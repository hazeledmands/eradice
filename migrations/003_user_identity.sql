-- Ported from supabase/migrations/003_user_identity.sql.
--
-- Still UUID at this point, matching Supabase's auth.uid(), so imported rows
-- load cleanly. 006 widens it to TEXT for Cloudflare Access subjects.
-- The owner_update_reveal policy is dropped with the rest of RLS.

ALTER TABLE room_rolls
  ADD COLUMN user_id UUID;

CREATE INDEX idx_room_rolls_user_id ON room_rolls(user_id);
