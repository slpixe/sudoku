ALTER TABLE rooms
  ADD COLUMN timer_started boolean NOT NULL DEFAULT false;

UPDATE rooms
SET timer_started = true
WHERE running_since IS NOT NULL
   OR elapsed_ms > 0
   OR status = 'completed';

UPDATE processed_commands
SET event = jsonb_set(
  event,
  '{timerStarted}',
  to_jsonb(
    CASE
      WHEN event -> 'action' ->> 'type' = 'clear' THEN false
      WHEN event ->> 'status' = 'completed' THEN true
      WHEN event -> 'runningSince' <> 'null'::jsonb THEN true
      WHEN COALESCE((event ->> 'elapsedMs')::bigint, 0) > 0 THEN true
      WHEN COALESCE((event ->> 'canUndo')::boolean, false) THEN true
      WHEN event -> 'action' ->> 'type' IN ('setNumber', 'setNotes', 'clearCell', 'hint', 'undo') THEN true
      ELSE false
    END
  ),
  true
)
WHERE NOT event ? 'timerStarted';
