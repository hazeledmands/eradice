-- Cloudflare Access replaces Supabase anonymous auth as the identity source.
--
-- (The original supabase/migrations/005 had no non-Supabase content — it only
-- added roll_comments to the realtime publication and set REPLICA IDENTITY
-- FULL so realtime DELETE events carried room_id. Both are obsolete here, so
-- this number is reused.)
--
-- Access subjects are opaque strings, not UUIDs, so the two ownership columns
-- widen to TEXT. Existing Supabase auth UUIDs cast to their text form and keep
-- working as historical provenance; they simply will not match any Access
-- subject, so imported rolls render as another user's until they are
-- explicitly remapped. Run this AFTER importing the Supabase dump.

ALTER TABLE room_rolls
  ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE roll_comments
  ALTER COLUMN author_id TYPE TEXT USING author_id::text;

-- Reveal and CP-spend both address a roll by (room_id, roll_id). Under
-- PostgREST that was two equality filters against idx_room_rolls_room_id; give
-- it a covering index now that these are hot update paths.
CREATE INDEX idx_room_rolls_room_roll ON room_rolls(room_id, roll_id);
