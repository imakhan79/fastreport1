-- Independent correctness verification for generated queries. Until now
-- `queries.confidence` was self-reported by the same model call that wrote
-- the SQL - an overconfident generation just states a high number, and
-- nothing checks it. verification_confidence/verification_issues come from
-- a second, independent model call that critiques the SQL and its actual
-- result rows rather than generating them, plus free deterministic
-- result-sanity checks (empty result, all-null/all-zero columns, etc).

alter table queries
  add column verification_confidence numeric(5, 2),
  add column verification_issues jsonb not null default '[]';
