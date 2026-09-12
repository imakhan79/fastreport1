-- Report templates: a saved natural-language request + export format
-- preferences a user can start a new AI report request from. Fully
-- separate from report_builder_reports (manual SQL configs) - this is
-- specifically for the AI orchestrator's /reports/new flow.
--
-- Design versioning/reuse needs no schema change: designs.version and
-- the 'superseded' status already existed but were never used by any
-- code path - this migration is app-code-only for that part.

create table report_templates (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  description text,
  natural_language_request text not null,
  export_formats text[] not null default '{pdf,excel}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_templates_org_id_idx on report_templates (org_id);

create trigger report_templates_set_updated_at
  before update on report_templates
  for each row execute function private.set_updated_at();

alter table report_templates enable row level security;
alter table report_templates force row level security;
create policy report_templates_isolation on report_templates
  for all to authenticated
  using ((select private.is_org_member(org_id)));
