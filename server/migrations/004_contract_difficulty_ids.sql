-- Contract migration: deploy only after images that write expert/evil are
-- retired from both serving traffic and the supported rollback window.
UPDATE rooms
SET collection_id = CASE collection_id
  WHEN 'expert' THEN 'fiendish'
  WHEN 'evil' THEN 'diabolical'
  ELSE collection_id
END
WHERE collection_id IN ('expert', 'evil');

ALTER TABLE rooms DROP CONSTRAINT rooms_collection_id_check;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_collection_id_check
  CHECK (collection_id IN ('easy', 'medium', 'hard', 'fiendish', 'diabolical'));
