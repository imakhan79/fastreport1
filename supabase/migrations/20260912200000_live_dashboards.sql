-- Live dashboards: named collections of widgets, each polling for fresh
-- data on an interval. A widget snapshots its own {data_source, table,
-- config} at add-time (deliberately not a live foreign key into
-- report_builder_reports) so editing or deleting a saved Report Builder
-- report later can never silently change or break a dashboard.

create table dashboards (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  refresh_seconds int not null default 0 check (refresh_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dashboards_org_id_idx on dashboards (org_id);

create trigger dashboards_set_updated_at
  before update on dashboards
  for each row execute function private.set_updated_at();

alter table dashboards enable row level security;
alter table dashboards force row level security;
create policy dashboards_isolation on dashboards
  for all to authenticated
  using ((select private.is_org_member(org_id)));

create table dashboard_widgets (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  dashboard_id bigint not null references dashboards (id) on delete cascade,
  widget_type text not null check (widget_type in ('kpi', 'chart', 'table')),
  title text not null,
  data_source_id bigint references data_sources (id) on delete set null,
  table_name text not null,
  config jsonb not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index dashboard_widgets_dashboard_id_idx on dashboard_widgets (dashboard_id);
create index dashboard_widgets_org_id_idx on dashboard_widgets (org_id);

alter table dashboard_widgets enable row level security;
alter table dashboard_widgets force row level security;
create policy dashboard_widgets_isolation on dashboard_widgets
  for all to authenticated
  using ((select private.is_org_member(org_id)));
