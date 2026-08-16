# HopCandy Supabase publication layer

This directory contains the deployable database contract for HopCandy v0.1.

## Scope

- `demo_cases`, `experiments`, and `timeline_entries` expose only rows where
  `published=true` through Row Level Security.
- Browser roles receive `SELECT` only. They cannot insert, update, or delete.
- `query_runs` has no browser grant or public policy. A trusted server may write
  privacy-minimized telemetry with a Supabase Secret Key.
- `query_runs` has no raw-question column. The server must hash client and
  question identifiers with a rotating salt before insertion.
- Supabase stores published Replay data, not vectors, indexes, reports, model
  weights, or the Agent runtime.

## Generated files

`seed.sql` and `../public_data/*.json` are generated from the frozen Step 0 and
Step 1 artifacts:

```powershell
.\.venv\Scripts\python.exe scripts\196.prepare_hopcandy_step2_publication.py --apply
.\.venv\Scripts\python.exe scripts\197.validate_hopcandy_step2_publication.py
```

Do not edit generated rows manually.

## Deployment boundary

The local workstation used for Step 2 did not have Supabase CLI, Docker, or
`psql`, so Step 2 validates deployable SQL and policy contracts statically.
During Step 7, use a disposable Preview project to execute the migration and
verify real `anon` reads and denied writes before Production deployment.

The browser may contain only `VITE_SUPABASE_URL` and a Supabase Publishable Key.
A Secret Key must remain in server-only environment variables.
