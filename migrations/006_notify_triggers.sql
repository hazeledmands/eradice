-- Change delivery, replacing Supabase Realtime's postgres_changes streams.
--
-- Every mutation announces itself on a single `eradice_events` channel; the
-- application server holds one LISTEN connection and fans each event out to
-- the SSE subscribers for that room. One channel rather than one per room
-- because LISTEN takes an identifier, not a parameter — routing by the
-- room_id in the payload is simpler than the dynamic SQL the alternative
-- needs, and it means a new room requires no new subscription.
--
-- The payload carries identifiers only, never roll_data. NOTIFY payloads are
-- capped at 8000 bytes and a roll with a long explosion chain could approach
-- that; the server re-reads the row, which is a fast indexed lookup and keeps
-- this trigger indifferent to how the row is shaped.

CREATE FUNCTION notify_room_event() RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  rec RECORD;
BEGIN
  rec := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  payload := json_build_object(
    'table',   TG_TABLE_NAME,
    'op',      TG_OP,
    'room_id', rec.room_id,
    'roll_id', rec.roll_id,
    'id',      rec.id
  );
  PERFORM pg_notify('eradice_events', payload::text);
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER room_rolls_notify
  AFTER INSERT OR UPDATE ON room_rolls
  FOR EACH ROW EXECUTE FUNCTION notify_room_event();

CREATE TRIGGER roll_comments_notify
  AFTER INSERT OR UPDATE OR DELETE ON roll_comments
  FOR EACH ROW EXECUTE FUNCTION notify_room_event();
