ALTER TABLE room_rolls
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared',
  ADD COLUMN is_revealed BOOLEAN NOT NULL DEFAULT false;

CREATE POLICY "anon_update_reveal" ON room_rolls
  FOR UPDATE USING (true) WITH CHECK (true);
