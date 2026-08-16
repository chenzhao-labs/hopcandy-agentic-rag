import type { DemoCase, ExperimentRow, LiveHealth, HopCandyResponse, PublicationData, PublicationEnvelope, PublicationManifest } from '../types';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadBundled(): Promise<PublicationData> {
  const [cases, experiments, manifest] = await Promise.all([
    getJson<PublicationEnvelope<DemoCase>>('/data/demo_cases.json'),
    getJson<PublicationEnvelope<ExperimentRow>>('/data/experiments.json'),
    getJson<PublicationManifest>('/data/publication_manifest.json'),
  ]);

  if (
    cases.fixture_bundle_sha256 !== manifest.fixture_bundle_sha256 ||
    experiments.fixture_bundle_sha256 !== manifest.fixture_bundle_sha256
  ) {
    throw new Error('Bundled publication data does not match its manifest.');
  }

  return { cases: cases.rows, experiments: experiments.rows, manifest, source: 'bundled' };
}

async function loadSupabase(fallback: PublicationData): Promise<PublicationData> {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return fallback;

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const select = 'select=*&published=eq.true';
  const [cases, experiments] = await Promise.all([
    getJson<DemoCase[]>(`${url}/rest/v1/demo_cases?${select}&order=display_order.asc`, { headers }),
    getJson<ExperimentRow[]>(`${url}/rest/v1/experiments?${select}&order=display_order.asc`, { headers }),
  ]);

  const allRows = [...cases, ...experiments];
  const versionMatches = allRows.length > 0 && allRows.every(
    (row) => row.fixture_bundle_sha256 === fallback.manifest.fixture_bundle_sha256,
  );
  const countsMatch = cases.length === fallback.manifest.row_counts.demo_cases
    && experiments.length === fallback.manifest.row_counts.experiments;
  if (!versionMatches || !countsMatch) return fallback;

  return { ...fallback, cases, experiments, source: 'supabase' };
}

export async function loadPublication(): Promise<PublicationData> {
  const fallback = await loadBundled();
  try {
    return await loadSupabase(fallback);
  } catch {
    return fallback;
  }
}

export async function getLiveHealth(): Promise<LiveHealth> {
  if (import.meta.env.VITE_HOPCANDY_LIVE_ENABLED !== 'true') {
    return {
      status: 'ok',
      replay_available: true,
      live: { enabled: false, ready: false, state: 'on_demand', model: null },
    };
  }
  return getJson<LiveHealth>('/api/v1/health', { signal: AbortSignal.timeout(5000) });
}

export async function runLiveQuery(question: string): Promise<HopCandyResponse> {
  return getJson<HopCandyResponse>('/api/v1/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, request_id: crypto.randomUUID() }),
    signal: AbortSignal.timeout(120000),
  });
}
