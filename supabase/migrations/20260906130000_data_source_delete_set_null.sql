-- Deleting a data source previously failed with a foreign key violation
-- whenever any query had ever run against it, since queries.data_source_id
-- had no ON DELETE behavior. A query's sql_text/results are self-contained,
-- so on delete the historical record should just lose the dangling
-- reference rather than block the delete.

alter table queries drop constraint queries_data_source_id_fkey;
alter table queries add constraint queries_data_source_id_fkey
  foreign key (data_source_id) references data_sources (id) on delete set null;
