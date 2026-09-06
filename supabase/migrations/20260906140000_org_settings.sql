-- Organization-level settings: a per-org default distribution recipient
-- list, so email delivery doesn't depend solely on the global
-- DEFAULT_DISTRIBUTION_EMAIL env var once more than one org exists.

alter table organizations add column default_distribution_email text;
