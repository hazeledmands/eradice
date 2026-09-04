-- Ported from supabase/migrations/004_roll_comments.sql, minus RLS.

CREATE TABLE roll_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  roll_id BIGINT NOT NULL,
  text TEXT NOT NULL,
  author_nickname TEXT NOT NULL,
  author_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_roll_comments_room_roll ON roll_comments(room_id, roll_id);
