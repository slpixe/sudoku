CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  code varchar(6) NOT NULL UNIQUE,
  collection_id text NOT NULL CHECK (collection_id IN ('easy','medium','hard','expert','evil')),
  puzzle_number integer NOT NULL CHECK (puzzle_number > 0),
  givens smallint[] NOT NULL CHECK (cardinality(givens) = 81),
  solution smallint[] NOT NULL CHECK (cardinality(solution) = 81),
  values smallint[] NOT NULL CHECK (cardinality(values) = 81),
  notes integer[] NOT NULL CHECK (cardinality(notes) = 81),
  revision bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('running','paused','completed')),
  elapsed_ms bigint NOT NULL DEFAULT 0,
  running_since timestamptz,
  created_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE processed_commands (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  revision bigint NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, command_id)
);

CREATE TABLE undo_actions (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  inverse jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, sequence)
);

CREATE INDEX rooms_expires_at_idx ON rooms (expires_at);
