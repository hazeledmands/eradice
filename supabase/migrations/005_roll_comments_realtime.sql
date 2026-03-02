-- Enable realtime for roll_comments
ALTER PUBLICATION supabase_realtime ADD TABLE roll_comments;

-- Full replica identity so DELETE events include all columns
-- (needed for room_id filter to work on DELETE)
ALTER TABLE roll_comments REPLICA IDENTITY FULL;
