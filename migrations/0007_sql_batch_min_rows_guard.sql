CREATE TABLE IF NOT EXISTS __sql_batch_min_rows_guard (
  v INTEGER NOT NULL,
  CONSTRAINT sql_batch_min_rows_guard_failed CHECK (0)
);
