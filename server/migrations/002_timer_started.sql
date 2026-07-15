ALTER TABLE rooms
  ADD COLUMN timer_started boolean NOT NULL DEFAULT false;

-- Reconstruct timer state in revision order. Board mutations start the timer,
-- Clear makes it dormant again, and Undo/Pause/Resume preserve the state set by
-- the latest decisive command. Terminal elapsed/running/undo fields are not
-- sufficient when several commands happen in the same millisecond.
WITH command_states AS (
  SELECT
    command.room_id,
    command.command_id,
    max(
      CASE
        WHEN command.event -> 'action' ->> 'type'
          IN ('setNumber', 'setNotes', 'clearCell', 'hint', 'clear')
        THEN command.revision
        ELSE NULL
      END
    ) OVER (
      PARTITION BY command.room_id
      ORDER BY command.revision, command.command_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS decisive_revision
  FROM processed_commands AS command
), inferred_states AS (
  SELECT
    state.room_id,
    state.command_id,
    CASE
      WHEN state.decisive_revision IS NULL THEN false
      WHEN decisive.event -> 'action' ->> 'type' = 'clear' THEN false
      ELSE true
    END AS timer_started
  FROM command_states AS state
  LEFT JOIN processed_commands AS decisive
    ON decisive.room_id = state.room_id
   AND decisive.revision = state.decisive_revision
)
UPDATE processed_commands AS command
SET event = jsonb_set(command.event, '{timerStarted}', to_jsonb(inferred.timer_started), true)
FROM inferred_states AS inferred
WHERE command.room_id = inferred.room_id
  AND command.command_id = inferred.command_id;

WITH latest_states AS (
  SELECT DISTINCT ON (command.room_id)
    command.room_id,
    (command.event ->> 'timerStarted')::boolean AS timer_started
  FROM processed_commands AS command
  ORDER BY command.room_id, command.revision DESC, command.command_id DESC
)
UPDATE rooms AS room
SET timer_started = latest.timer_started
FROM latest_states AS latest
WHERE room.id = latest.room_id;

-- The Fly release command runs before the old Machine is replaced. During that
-- overlap, the pre-migration repository still omits timer_started from room
-- writes and command events. These compatibility triggers keep both records
-- correct until a later contract migration removes them after every old server
-- version is unable to write.
CREATE FUNCTION multiplayer_compat_command_timer_started()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  action_type text;
  current_timer_started boolean;
  next_timer_started boolean;
BEGIN
  IF NEW.event ? 'timerStarted' THEN
    RETURN NEW;
  END IF;

  SELECT room.timer_started
  INTO current_timer_started
  FROM rooms AS room
  WHERE room.id = NEW.room_id;

  action_type := NEW.event -> 'action' ->> 'type';
  next_timer_started := CASE
    WHEN action_type IN ('setNumber', 'setNotes', 'clearCell', 'hint') THEN true
    WHEN action_type = 'clear' THEN false
    ELSE COALESCE(current_timer_started, false)
  END;

  NEW.event := jsonb_set(NEW.event, '{timerStarted}', to_jsonb(next_timer_started), true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER multiplayer_compat_command_timer_started_trigger
BEFORE INSERT ON processed_commands
FOR EACH ROW
EXECUTE FUNCTION multiplayer_compat_command_timer_started();

CREATE FUNCTION multiplayer_compat_room_timer_started()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  command_timer_started boolean;
BEGIN
  IF NEW.timer_started IS DISTINCT FROM OLD.timer_started THEN
    RETURN NEW;
  END IF;

  SELECT (command.event ->> 'timerStarted')::boolean
  INTO command_timer_started
  FROM processed_commands AS command
  WHERE command.room_id = NEW.id
    AND command.revision = NEW.revision
    AND command.event ? 'timerStarted'
  ORDER BY command.created_at DESC, command.command_id DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.timer_started := command_timer_started;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER multiplayer_compat_room_timer_started_trigger
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION multiplayer_compat_room_timer_started();
