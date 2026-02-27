ALTER TABLE room_rolls
  ADD COLUMN user_id UUID;

CREATE INDEX idx_room_rolls_user_id ON room_rolls(user_id);

-- Tighten UPDATE RLS: only row owner can reveal their own roll
DROP POLICY "anon_update_reveal" ON room_rolls;
CREATE POLICY "owner_update_reveal" ON room_rolls
  FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
