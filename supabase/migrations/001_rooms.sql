-- rooms table
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rooms_slug ON rooms(slug);

-- room_rolls table (stores each roll as JSONB)
CREATE TABLE room_rolls (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  roll_id BIGINT NOT NULL,        -- Date.now() from client
  user_nickname TEXT NOT NULL,
  roll_data JSONB NOT NULL,        -- full Roll object
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_room_rolls_room_id ON room_rolls(room_id);

-- RLS: open read/insert, no update/delete needed
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "anon_insert_rooms" ON rooms FOR INSERT WITH CHECK (true);

ALTER TABLE room_rolls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_rolls" ON room_rolls FOR SELECT USING (true);
CREATE POLICY "anon_insert_rolls" ON room_rolls FOR INSERT WITH CHECK (true);

-- Enable realtime for room_rolls
ALTER PUBLICATION supabase_realtime ADD TABLE room_rolls;
