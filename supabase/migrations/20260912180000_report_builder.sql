-- Interactive (manual) report builder: lets a user pick a connected data
-- source/table, choose/reorder columns, filter, group + aggregate, sort,
-- and pick a chart type, then save the resulting config for reuse. Fully
-- separate from the AI orchestrator pipeline (`reports`/`designs`/`queries`)
-- - there is no design/query/approval workflow here, just a saved query
-- definition the UI re-runs on demand.

create table report_builder_reports (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  data_source_id bigint references data_sources (id) on delete set null,
  table_name text not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_builder_reports_org_id_idx on report_builder_reports (org_id);
create index report_builder_reports_data_source_id_idx on report_builder_reports (data_source_id);

create trigger report_builder_reports_set_updated_at
  before update on report_builder_reports
  for each row execute function private.set_updated_at();

alter table report_builder_reports enable row level security;
alter table report_builder_reports force row level security;
create policy report_builder_reports_isolation on report_builder_reports
  for all to authenticated
  using ((select private.is_org_member(org_id)));
