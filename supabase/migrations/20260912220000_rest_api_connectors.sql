-- REST API data connector: extends data_sources with a "sync to table"
-- connector type. connector_config holds non-secret settings (url, auth
-- type, header name, response path, pagination); connector_secret holds
-- the actual credential value(s) and - like connection_ref - must never be
-- selected back to a client. Each sync fetches the API, flattens the JSON
-- into rows, and drops+recreates synced_table_name in this app's own
-- database, so Report Builder/Dashboards/the AI query pipeline see it as
-- an ordinary Postgres table with no changes needed on their end.

alter table data_sources
  add column connector_config jsonb,
  add column connector_secret jsonb,
  add column synced_table_name text,
  add column last_synced_at timestamptz,
  add column sync_error text;
