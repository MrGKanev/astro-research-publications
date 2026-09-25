import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { SourceConfig, SourceResult } from './types.js';

export interface SourceCacheEntry {
  fetchedAt: string;
  result: SourceResult;
}

export interface SourceCache {
  version: 3;
  entries: Record<string, SourceCacheEntry>;
  citations?: Record<string, { fetchedAt: string; bibtex: string }>;
}

export function sourceKey(source: SourceConfig): string {
  const id = source.type === 'google-scholar' ? source.profileId
    : source.type === 'orcid' ? source.orcidId : source.authorId;
  // Credentials and mailto affect the request, not the identity of the profile.
  return JSON.stringify([source.type, id]);
}

export function resolveCachePath(projectRoot: URL, relativePath: string): string {
  const root = fileURLToPath(projectRoot);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const resolved = resolve(root, relativePath);
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error('[astro-research-publications] cachePath must be inside the project root.');
  }
  return resolved;
}

export async function readCache(cachePath: string): Promise<SourceCache> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 3 ||
        !('entries' in parsed) || typeof parsed.entries !== 'object' || parsed.entries === null || Array.isArray(parsed.entries)) {
      return { version: 3, entries: {} };
    }
    const entries: Record<string, SourceCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (typeof value !== 'object' || value === null || !('fetchedAt' in value) || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt)) ||
          !('result' in value) || typeof value.result !== 'object' || value.result === null ||
          !('sourceName' in value.result) || typeof value.result.sourceName !== 'string' ||
          !('profileName' in value.result) || typeof value.result.profileName !== 'string' ||
          !('publications' in value.result) || !Array.isArray(value.result.publications) ||
          !value.result.publications.every((publication: unknown) =>
            typeof publication === 'object' && publication !== null &&
            'title' in publication && typeof publication.title === 'string' &&
            'authors' in publication && Array.isArray(publication.authors) &&
            'citations' in publication && typeof publication.citations === 'number')) continue;
      entries[key] = value as SourceCacheEntry;
    }
    const citations: NonNullable<SourceCache['citations']> = {};
    if ('citations' in parsed && typeof parsed.citations === 'object' && parsed.citations !== null && !Array.isArray(parsed.citations)) {
      for (const [doi, value] of Object.entries(parsed.citations)) {
        if (typeof value === 'object' && value !== null && 'fetchedAt' in value && typeof value.fetchedAt === 'string' &&
            Number.isFinite(Date.parse(value.fetchedAt)) && 'bibtex' in value && typeof value.bibtex === 'string') {
          citations[doi] = { fetchedAt: value.fetchedAt, bibtex: value.bibtex };
        }
      }
    }
    return { version: 3, entries, ...(Object.keys(citations).length ? { citations } : {}) };
  } catch {
    return { version: 3, entries: {} };
  }
}

export async function writeCache(cachePath: string, cache: SourceCache): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(cache, null, 2), 'utf-8');
    await rename(temporaryPath, cachePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function isCacheFresh(entry: SourceCacheEntry, maxAgeMs: number): boolean {
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < maxAgeMs;
}
