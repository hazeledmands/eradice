-- Ported from supabase/migrations/001_rooms.sql.
--
-- The table and index definitions are carried over verbatim so that a
-- data-only pg_dump taken from Supabase restores into this schema without
-- transformation. What was dropped, and why:
--
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY and the anon_* policies.
--     Under Supabase the browser was itself a database client, so RLS was the
--     only thing standing between a user and every row. Here the application
--     server is the sole client and holds the only credentials; authorization
--     lives in the API route handlers.
--   * ALTER PUBLICATION supabase_realtime. Change delivery is handled by the
--     NOTIFY triggers in 007, not by logical replication.

CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rooms_slug ON rooms(slug);

CREATE TABLE room_rolls (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  roll_id BIGINT NOT NULL,        -- Date.now() from the client
  user_nickname TEXT NOT NULL,
  roll_data JSONB NOT NULL,        -- full Roll object
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_room_rolls_room_id ON room_rolls(room_id);
