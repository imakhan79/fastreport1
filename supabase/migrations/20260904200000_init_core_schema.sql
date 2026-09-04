-- Core data model for the autonomous reporting platform.
-- Multi-tenant via organizations; RLS enforced on every org-scoped table
-- using a SECURITY DEFINER helper so policies stay index-friendly.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table organizations (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per auth.users, for display info independent of org membership.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table org_members (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'manager', 'designer', 'analyst', 'member')),
  department text,
  skills text[] not null default '{}',
  is_available boolean not null default true,
  active_task_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_members_org_id_idx on org_members (org_id);
create index org_members_user_id_idx on org_members (user_id);

-- SECURITY DEFINER helper so RLS policies avoid a join per row.
-- Lives in `private` (not exposed via PostgREST) and re-checks auth.uid()
-- internally so it cannot be used to check on someone else's behalf.
create or replace function private.is_org_member(target_org_id bigint)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = target_org_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_org_member(bigint) from public, anon;
grant execute on function private.is_org_member(bigint) to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Report type templates (drives automatic report-type / KPI detection)
-- ---------------------------------------------------------------------------

create table report_types (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  default_sections jsonb not null default '[]',
  default_kpis jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create index report_types_org_id_idx on report_types (org_id);

-- ---------------------------------------------------------------------------
-- Data sources discovered/registered for query generation
-- ---------------------------------------------------------------------------

create table data_sources (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  name text not null,
  kind text not null default 'postgres',
  connection_ref text,
  schema_cache jsonb,
  created_at timestamptz not null default now()
);

create index data_sources_org_id_idx on data_sources (org_id);

-- ---------------------------------------------------------------------------
-- Reports: one row per user report request; structured_plan holds the
-- AI orchestrator's decision (design/query/attachments/approval/distribution)
-- ---------------------------------------------------------------------------

create table reports (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  title text,
  natural_language_request text not null,
  report_type_id bigint references report_types (id),
  structured_plan jsonb,
  status text not null default 'analyzing'
    check (status in (
      'analyzing', 'designing', 'querying', 'attachments_pending', 'qa',
      'pending_approval', 'approved', 'generating', 'exporting',
      'distributing', 'completed', 'failed', 'cancelled'
    )),
  confidence_overall numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_org_id_idx on reports (org_id);
create index reports_requested_by_idx on reports (requested_by);
create index reports_report_type_id_idx on reports (report_type_id);
create index reports_status_idx on reports (status);

create trigger reports_set_updated_at
  before update on reports
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Designs: AI-generated layout/components/style per report, versioned
-- ---------------------------------------------------------------------------

create table designs (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint not null references reports (id) on delete cascade,
  version int not null default 1,
  layout jsonb not null default '{}',
  components jsonb not null default '[]',
  style jsonb not null default '{}',
  confidence numeric(5, 2) not null,
  status text not null default 'pending_review'
    check (status in ('auto_approved', 'pending_review', 'approved', 'rejected', 'superseded')),
  generated_by text not null default 'ai' check (generated_by in ('ai', 'human')),
  qa_issues jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index designs_org_id_idx on designs (org_id);
create index designs_report_id_idx on designs (report_id);

-- ---------------------------------------------------------------------------
-- Queries: AI-generated SQL per report, with validation + execution state
-- ---------------------------------------------------------------------------

create table queries (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint not null references reports (id) on delete cascade,
  data_source_id bigint references data_sources (id),
  natural_language_request text,
  sql_text text,
  tables text[] not null default '{}',
  fields jsonb not null default '[]',
  confidence numeric(5, 2),
  status text not null default 'pending_review'
    check (status in ('auto_approved', 'pending_review', 'approved', 'rejected', 'executed', 'failed')),
  validation_errors jsonb not null default '[]',
  result_ref text,
  row_count int,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index queries_org_id_idx on queries (org_id);
create index queries_report_id_idx on queries (report_id);
create index queries_data_source_id_idx on queries (data_source_id);

-- ---------------------------------------------------------------------------
-- Attachments: required documents per report, and what was actually uploaded
-- ---------------------------------------------------------------------------

create table attachment_requirements (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint not null references reports (id) on delete cascade,
  requirement_key text not null,
  description text,
  is_required boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'found', 'requested', 'uploaded', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index attachment_requirements_org_id_idx on attachment_requirements (org_id);
create index attachment_requirements_report_id_idx on attachment_requirements (report_id);

create table attachments (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  requirement_id bigint references attachment_requirements (id) on delete set null,
  storage_path text not null,
  uploaded_by uuid references auth.users (id),
  classification text,
  classification_confidence numeric(5, 2),
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'invalid')),
  created_at timestamptz not null default now()
);

create index attachments_org_id_idx on attachments (org_id);
create index attachments_requirement_id_idx on attachments (requirement_id);

-- ---------------------------------------------------------------------------
-- Tasks: the automatic task engine's human-escalation queue
-- (design review, query review, attachment request/review, approval, ...)
-- ---------------------------------------------------------------------------

create table tasks (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint references reports (id) on delete cascade,
  task_type text not null
    check (task_type in ('design_review', 'query_review', 'attachment_request', 'attachment_review', 'approval', 'other')),
  related_entity_type text,
  related_entity_id bigint,
  assigned_to uuid references auth.users (id),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled', 'overdue')),
  confidence numeric(5, 2),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_org_id_idx on tasks (org_id);
create index tasks_report_id_idx on tasks (report_id);
create index tasks_assigned_to_idx on tasks (assigned_to);
create index tasks_status_idx on tasks (status);
create index tasks_related_entity_idx on tasks (related_entity_type, related_entity_id);

-- ---------------------------------------------------------------------------
-- Notifications for task assignment/reminders/escalation
-- ---------------------------------------------------------------------------

create table notifications (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id bigint references tasks (id) on delete cascade,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_org_id_idx on notifications (org_id);
create index notifications_user_id_idx on notifications (user_id);
create index notifications_task_id_idx on notifications (task_id);

-- ---------------------------------------------------------------------------
-- Per-org confidence thresholds gating automatic approval vs. escalation
-- ---------------------------------------------------------------------------

create table confidence_thresholds (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  action_type text not null check (action_type in ('design', 'query', 'attachment_match')),
  threshold numeric(5, 2) not null default 90,
  unique (org_id, action_type)
);

create index confidence_thresholds_org_id_idx on confidence_thresholds (org_id);

-- ---------------------------------------------------------------------------
-- Distribution + export tracking for automatic completion
-- ---------------------------------------------------------------------------

create table distributions (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint not null references reports (id) on delete cascade,
  channel text not null check (channel in ('email', 'slack', 'download')),
  recipients text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index distributions_org_id_idx on distributions (org_id);
create index distributions_report_id_idx on distributions (report_id);

create table report_exports (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  report_id bigint not null references reports (id) on delete cascade,
  format text not null check (format in ('pdf', 'excel', 'html')),
  storage_path text,
  generated_at timestamptz not null default now()
);

create index report_exports_org_id_idx on report_exports (org_id);
create index report_exports_report_id_idx on report_exports (report_id);

-- ---------------------------------------------------------------------------
-- Audit trail: every automated and human action, for the acceptance test's
-- "record audit trail" requirement
-- ---------------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  org_id bigint references organizations (id) on delete cascade,
  report_id bigint references reports (id) on delete set null,
  actor_type text not null check (actor_type in ('system', 'ai', 'user')),
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text,
  entity_id bigint,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_org_id_idx on audit_log (org_id);
create index audit_log_report_id_idx on audit_log (report_id);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: every org-scoped table is isolated by org membership.
-- Service role (used by the orchestrator backend) bypasses RLS by default.
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table organizations force row level security;
create policy organizations_member_isolation on organizations
  for all to authenticated
  using ((select private.is_org_member(id)));

alter table profiles enable row level security;
alter table profiles force row level security;
create policy profiles_self_access on profiles
  for all to authenticated
  using (id = (select auth.uid()));

alter table org_members enable row level security;
alter table org_members force row level security;
create policy org_members_isolation on org_members
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table report_types enable row level security;
alter table report_types force row level security;
create policy report_types_isolation on report_types
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table data_sources enable row level security;
alter table data_sources force row level security;
create policy data_sources_isolation on data_sources
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table reports enable row level security;
alter table reports force row level security;
create policy reports_isolation on reports
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table designs enable row level security;
alter table designs force row level security;
create policy designs_isolation on designs
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table queries enable row level security;
alter table queries force row level security;
create policy queries_isolation on queries
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table attachment_requirements enable row level security;
alter table attachment_requirements force row level security;
create policy attachment_requirements_isolation on attachment_requirements
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table attachments enable row level security;
alter table attachments force row level security;
create policy attachments_isolation on attachments
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table tasks enable row level security;
alter table tasks force row level security;
create policy tasks_isolation on tasks
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table notifications enable row level security;
alter table notifications force row level security;
create policy notifications_isolation on notifications
  for all to authenticated
  using (user_id = (select auth.uid()));

alter table confidence_thresholds enable row level security;
alter table confidence_thresholds force row level security;
create policy confidence_thresholds_isolation on confidence_thresholds
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table distributions enable row level security;
alter table distributions force row level security;
create policy distributions_isolation on distributions
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table report_exports enable row level security;
alter table report_exports force row level security;
create policy report_exports_isolation on report_exports
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy audit_log_isolation on audit_log
  for select to authenticated
  using (org_id is not null and (select private.is_org_member(org_id)));
