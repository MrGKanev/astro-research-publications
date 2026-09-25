import type { SourceConfig, SourceResult, ScholarData } from './types.js';
import { fetchGoogleScholar } from './sources/google-scholar.js';
import { fetchSemanticScholar } from './sources/semantic-scholar.js';
import { fetchOpenAlex } from './sources/open-alex.js';
import { fetchOrcid } from './sources/orcid.js';
import { mergeResults } from './merger.js';
import { isCacheFresh, sourceKey } from './cache.js';
import type { SourceCache, SourceCacheEntry } from './cache.js';

async function fetchSource(source: SourceConfig): Promise<SourceResult> {
  switch (source.type) {
    case 'google-scholar':
      return fetchGoogleScholar(source.profileId);
    case 'semantic-scholar':
      return fetchSemanticScholar(source.authorId, source.apiKey);
    case 'open-alex':
      return fetchOpenAlex(source.authorId, source.mailto);
    case 'orcid':
      return fetchOrcid(source.orcidId);
  }
}

function deriveProfileId(sources: SourceConfig[]): string {
  for (const s of sources) {
    if (s.type === 'google-scholar') return s.profileId;
    if (s.type === 'semantic-scholar') return s.authorId;
    if (s.type === 'open-alex') return s.authorId;
    if (s.type === 'orcid') return s.orcidId;
  }
  return 'unknown';
}

export async function fetchPublications(sources: SourceConfig[], dedupeByDoi = false): Promise<ScholarData> {
  const results = await Promise.all(sources.map(fetchSource));
  return mergeResults(results, deriveProfileId(sources), dedupeByDoi);
}

export interface SyncResult {
  data: ScholarData;
  cache: SourceCache;
  updated: boolean;
  warnings: string[];
}

/** Refresh each configured profile independently, keeping valid stale data on failure. */
export async function syncPublications(
  sources: SourceConfig[],
  cache: SourceCache,
  maxAgeMs: number,
  fetchOne: (source: SourceConfig) => Promise<SourceResult> = fetchSource,
  dedupeByDoi = false,
): Promise<SyncResult> {
  const entries = { ...cache.entries };
  let updated = false;
  const warnings: string[] = [];
  const keys = new Set<string>();

  const settled = await Promise.all(sources.map(async (source): Promise<SourceCacheEntry | null> => {
    const key = sourceKey(source);
    if (keys.has(key)) return null;
    keys.add(key);
    const cached = entries[key];
    if (cached && cached.result.sourceName === source.type && isCacheFresh(cached, maxAgeMs)) return cached;

    try {
      const result = await fetchOne(source);
      const entry = { result, fetchedAt: new Date().toISOString() };
      entries[key] = entry;
      updated = true;
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (cached?.result.sourceName === source.type) {
        warnings.push(`${source.type} (${key}): ${message}; using stale data from ${cached.fetchedAt}`);
        return cached;
      }
      warnings.push(`${source.type} (${key}): ${message}; no cached data available`);
      return null;
    }
  }));

  const available = settled
    .map((entry, index) => entry ? { entry, source: sources[index] } : null)
    .filter((item): item is { entry: SourceCacheEntry; source: SourceConfig } => item !== null);
  if (available.length === 0) {
    throw new Error(`[astro-research-publications] No publication data available. ${warnings.join(' | ')}`);
  }

  const data = mergeResults(available.map(({ entry }) => entry.result), deriveProfileId(available.map(({ source }) => source)), dedupeByDoi);
  // A mixed result is only as current as its oldest contributing source.
  data.lastSynced = new Date(Math.min(...available.map(({ entry }) => Date.parse(entry.fetchedAt)))).toISOString();
  return { data, cache: { version: 3, entries, citations: cache.citations }, updated, warnings };
}

/** @deprecated Use `fetchPublications([{ type: 'google-scholar', profileId }])` instead. */
export async function fetchScholarProfile(profileId: string): Promise<ScholarData> {
  return fetchPublications([{ type: 'google-scholar', profileId }]);
}
