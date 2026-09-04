-- Room presence, replacing Supabase Realtime's Presence channel.
--
-- Kept in the database rather than in each pod's memory so presence does not
-- depend on which replica a viewer's stream happens to land on. That is the
-- one piece of Supabase Realtime that has no NOTIFY equivalent: events are
-- naturally broadcast, but presence is SHARED STATE, and two pods each holding
-- half the roster would show each other's viewers as absent.
--
-- Keyed by (room_id, user_id) rather than by connection: a Cloudflare Access
-- subject is one person, so reloading a tab or opening a second one refreshes
-- the same row instead of showing a duplicate. This is an improvement on the
-- old nickname-keyed presence, which double-counted exactly that case.
--
-- Liveness is a heartbeat rather than a disconnect hook, because a pod that is
-- killed never gets to run one. Readers filter on last_seen, so a stale row is
-- invisible the moment it ages out and no cleanup job is required; the delete
-- on graceful disconnect is an optimization, not the mechanism.

CREATE TABLE room_presence (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_room_presence_last_seen ON room_presence(room_id, last_seen);

CREATE FUNCTION notify_presence_event() RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
BEGIN
  rec := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  PERFORM pg_notify('eradice_events', json_build_object(
    'table',   'room_presence',
    'op',      TG_OP,
    'room_id', rec.room_id
  )::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Heartbeats update last_seen every few seconds and would otherwise wake every
-- subscriber in the room each time. Only a genuine roster change is announced:
-- someone arriving, leaving, or renaming themselves.
CREATE TRIGGER room_presence_notify
  AFTER INSERT OR DELETE ON room_presence
  FOR EACH ROW EXECUTE FUNCTION notify_presence_event();

CREATE TRIGGER room_presence_rename_notify
  AFTER UPDATE OF nickname ON room_presence
  FOR EACH ROW WHEN (OLD.nickname IS DISTINCT FROM NEW.nickname)
  EXECUTE FUNCTION notify_presence_event();
