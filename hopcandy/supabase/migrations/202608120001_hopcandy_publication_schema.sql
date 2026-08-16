-- HopCandy v0.1 publication schema. Apply with the Supabase CLI.

create table if not exists public.demo_cases (
    id text primary key,
    display_order integer not null check (display_order > 0),
    title text not null,
    case_type text not null,
    release_label text not null check (release_label in ('Stable', 'Development Baseline', 'Ablation')),
    release_name text not null,
    response jsonb not null,
    fixture_version text not null,
    fixture_bundle_sha256 text not null check (fixture_bundle_sha256 ~ '^[0-9a-f]{64}$'),
    api_schema_version text not null,
    contract_bundle_sha256 text not null check (contract_bundle_sha256 ~ '^[0-9a-f]{64}$'),
    published boolean not null default false,
    created_at timestamptz not null default now(),
    unique (display_order)
);

create table if not exists public.experiments (
    id text primary key,
    display_order integer not null check (display_order > 0),
    name text not null,
    label text not null check (label in ('Stable', 'Development Baseline', 'Ablation')),
    status text not null,
    scope text not null,
    metrics jsonb not null,
    source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
    fixture_version text not null,
    fixture_bundle_sha256 text not null check (fixture_bundle_sha256 ~ '^[0-9a-f]{64}$'),
    published boolean not null default false,
    created_at timestamptz not null default now(),
    unique (display_order)
);

create table if not exists public.timeline_entries (
    id text primary key,
    display_order integer not null check (display_order > 0),
    record_section integer not null,
    title text not null,
    problem text not null,
    change text not null,
    verification text not null,
    conclusion text not null,
    fixture_version text not null,
    fixture_bundle_sha256 text not null check (fixture_bundle_sha256 ~ '^[0-9a-f]{64}$'),
    published boolean not null default false,
    created_at timestamptz not null default now(),
    unique (display_order),
    unique (record_section)
);

create table if not exists public.query_runs (
    request_id text primary key,
    client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
    question_hash text not null check (question_hash ~ '^[0-9a-f]{64}$'),
    mode text not null check (mode in ('replay', 'live')),
    status text not null check (status in ('success', 'clarification', 'abstained', 'error')),
    route_category text not null check (route_category in ('structured', 'textual', 'unknown')),
    structured_route text,
    model text not null,
    latency_ms double precision not null check (latency_ms >= 0),
    iterations integer not null check (iterations >= 0),
    tool_calls integer not null check (tool_calls >= 0),
    evidence_count integer not null check (evidence_count >= 0),
    replans integer not null check (replans >= 0),
    api_schema_version text not null,
    created_at timestamptz not null default now()
);

alter table public.demo_cases enable row level security;
alter table public.experiments enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.query_runs enable row level security;

alter table public.demo_cases force row level security;
alter table public.experiments force row level security;
alter table public.timeline_entries force row level security;
alter table public.query_runs force row level security;

revoke all on table public.demo_cases from public, anon, authenticated;
revoke all on table public.experiments from public, anon, authenticated;
revoke all on table public.timeline_entries from public, anon, authenticated;
revoke all on table public.query_runs from public, anon, authenticated;

grant select on table public.demo_cases to anon, authenticated;
grant select on table public.experiments to anon, authenticated;
grant select on table public.timeline_entries to anon, authenticated;

grant all on table public.demo_cases to service_role;
grant all on table public.experiments to service_role;
grant all on table public.timeline_entries to service_role;
grant all on table public.query_runs to service_role;

drop policy if exists demo_cases_public_read on public.demo_cases;
create policy demo_cases_public_read
on public.demo_cases
for select
to anon, authenticated
using (published is true);

drop policy if exists experiments_public_read on public.experiments;
create policy experiments_public_read
on public.experiments
for select
to anon, authenticated
using (published is true);

drop policy if exists timeline_entries_public_read on public.timeline_entries;
create policy timeline_entries_public_read
on public.timeline_entries
for select
to anon, authenticated
using (published is true);

comment on table public.query_runs is
'Privacy-minimized server telemetry. Raw user questions are intentionally not stored.';
