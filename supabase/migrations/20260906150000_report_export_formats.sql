-- Lets a request choose which export formats to generate instead of the
-- pipeline always producing both PDF and Excel.

alter table reports add column export_formats text[] not null default '{pdf,excel}';
