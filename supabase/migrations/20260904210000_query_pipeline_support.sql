-- Support for the Query pipeline: a queryable sample data source (standing
-- in for a real connected database) plus a place to keep a capped preview
-- of what a generated query returned.

create table sample_sales (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  sale_date date not null,
  region text not null,
  category text not null,
  amount numeric(10, 2) not null
);

create index sample_sales_org_id_idx on sample_sales (org_id);

alter table sample_sales enable row level security;
alter table sample_sales force row level security;
create policy sample_sales_isolation on sample_sales
  for all to authenticated
  using ((select private.is_org_member(org_id)));

alter table queries add column result_preview jsonb not null default '[]';

-- Seed a default org (matches lib/bootstrap.ts's "Default Organization")
-- and two months of sample sales so the Query pipeline has something real
-- to discover, query, and return.
do $$
declare
  v_org_id bigint;
begin
  select id into v_org_id from organizations where name = 'Default Organization';
  if v_org_id is null then
    insert into organizations (name) values ('Default Organization') returning id into v_org_id;
  end if;

  insert into data_sources (org_id, name, kind, connection_ref, schema_cache)
  values (
    v_org_id,
    'Sample Sales DB',
    'postgres',
    'sample_sales',
    jsonb_build_object(
      'tables', jsonb_build_array(
        jsonb_build_object(
          'name', 'sample_sales',
          'columns', jsonb_build_array(
            jsonb_build_object('name', 'sale_date', 'type', 'date'),
            jsonb_build_object('name', 'region', 'type', 'text'),
            jsonb_build_object('name', 'category', 'type', 'text'),
            jsonb_build_object('name', 'amount', 'type', 'numeric')
          )
        )
      )
    )
  )
  on conflict do nothing;

  if not exists (select 1 from sample_sales where org_id = v_org_id) then
    insert into sample_sales (org_id, sale_date, region, category, amount)
    select
      v_org_id,
      d::date,
      region,
      category,
      round((random() * 4000 + 500)::numeric, 2)
    from generate_series('2026-07-01'::date, '2026-08-31'::date, interval '1 day') as d
    cross join (values ('North'), ('South'), ('East')) as r(region)
    cross join (values ('Hardware'), ('Software'), ('Services')) as c(category)
    where random() < 0.35;
  end if;
end $$;
