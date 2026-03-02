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

ALTER TABLE roll_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_comments"   ON roll_comments FOR SELECT USING (true);
CREATE POLICY "anon_insert_comments" ON roll_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "owner_update_comment" ON roll_comments FOR UPDATE
  USING (auth.uid() = author_id OR author_id IS NULL);
CREATE POLICY "owner_delete_comment" ON roll_comments FOR DELETE
  USING (auth.uid() = author_id OR author_id IS NULL);
