-- Recurring report schedules: re-run a saved natural-language request on a
-- daily/weekly/monthly cadence via a Vercel Cron job hitting
-- /api/cron/run-schedules. Cron on Vercel's Hobby plan only fires once a
-- day, so `next_run_at` is a due-time check the cron endpoint evaluates
-- rather than something it ticks in lockstep with.

create table report_schedules (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  title text,
  natural_language_request text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  hour_utc int not null default 9 check (hour_utc between 0 and 23),
  status text not null default 'active' check (status in ('active', 'paused')),
  last_run_at timestamptz,
  last_report_id bigint references reports (id) on delete set null,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_needs_day_of_week check (frequency != 'weekly' or day_of_week is not null),
  constraint monthly_needs_day_of_month check (frequency != 'monthly' or day_of_month is not null)
);

create index report_schedules_org_id_idx on report_schedules (org_id);
create index report_schedules_due_idx on report_schedules (status, next_run_at);

alter table report_schedules enable row level security;
alter table report_schedules force row level security;
create policy report_schedules_isolation on report_schedules
  for all to authenticated
  using ((select private.is_org_member(org_id)));
