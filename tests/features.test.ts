import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCache, sourceKey, writeCache } from '../src/cache.js';
import type { SourceCache } from '../src/cache.js';
import { syncPublications } from '../src/fetcher.js';
import { toBibTeX } from '../src/bibtex.js';
import type { Publication, SourceConfig, SourceResult } from '../src/types.js';

const scholar: SourceConfig = { type: 'google-scholar', profileId: 'A' };
const semantic: SourceConfig = { type: 'semantic-scholar', authorId: 'B' };
const emptyCache = (): SourceCache => ({ version: 3, entries: {} });
const result = (name: string, title: string): SourceResult => ({
  sourceName: name,
  profileName: name,
  publications: [{ id: title, title, authors: [], venue: '', year: 2024, citations: 1, scholarUrl: null, citationsUrl: null, sources: [name] }],
});

describe('per-source sync', () => {
  it('keeps stale data for a failed source while updating another', async () => {
    const oldTime = '2020-01-01T00:00:00.000Z';
    const cache: SourceCache = { version: 3, entries: {
      [sourceKey(scholar)]: { fetchedAt: oldTime, result: result('google-scholar', 'Old Scholar') },
      [sourceKey(semantic)]: { fetchedAt: oldTime, result: result('semantic-scholar', 'Old Semantic') },
    } };
    const synced = await syncPublications([scholar, semantic], cache, 0, async (source) => {
      if (source.type === 'google-scholar') throw new Error('CAPTCHA');
      return result('semantic-scholar', 'New Semantic');
    });
    expect(synced.data.publications.map((publication) => publication.title)).toEqual(['Old Scholar', 'New Semantic']);
    expect(synced.data.lastSynced).toBe(oldTime);
    expect(synced.cache.entries[sourceKey(semantic)].result.publications[0].title).toBe('New Semantic');
    expect(synced.warnings).toHaveLength(1);
    expect(synced.updated).toBe(true);
  });

  it('does not reuse a different profile and still returns available sources', async () => {
    const cache: SourceCache = { version: 3, entries: {
      [sourceKey({ type: 'google-scholar', profileId: 'other' })]: {
        fetchedAt: new Date().toISOString(), result: result('google-scholar', 'Wrong Profile'),
      },
    } };
    const synced = await syncPublications([scholar, semantic], cache, 86_400_000, async (source) => {
      if (source.type === 'google-scholar') throw new Error('offline');
      return result('semantic-scholar', 'Good Profile');
    });
    expect(synced.data.publications.map((publication) => publication.title)).toEqual(['Good Profile']);
    expect(synced.data.sources).toEqual(['semantic-scholar']);
    expect(synced.data.profileId).toBe('B');
    expect(synced.warnings[0]).toContain('no cached data');
  });

  it('does not fetch fresh entries and fails when no source is available', async () => {
    const cache: SourceCache = { version: 3, entries: {
      [sourceKey(scholar)]: { fetchedAt: new Date().toISOString(), result: result('google-scholar', 'Cached') },
    } };
    const cached = await syncPublications([scholar], cache, 86_400_000, async () => { throw new Error('should not fetch'); });
    expect(cached.updated).toBe(false);
    expect(cached.data.publications[0].title).toBe('Cached');
    await expect(syncPublications([semantic], emptyCache(), 0, async () => { throw new Error('offline'); })).rejects.toThrow('No publication data available');
  });

  it('excludes cached profiles removed from the configuration', async () => {
    const fetchedAt = new Date().toISOString();
    const cache: SourceCache = { version: 3, entries: {
      [sourceKey(scholar)]: { fetchedAt, result: result('google-scholar', 'Scholar Paper') },
      [sourceKey(semantic)]: { fetchedAt, result: result('semantic-scholar', 'Semantic Paper') },
    } };
    const synced = await syncPublications([semantic], cache, 86_400_000, async () => { throw new Error('should not fetch'); });
    expect(synced.data.publications.map((publication) => publication.title)).toEqual(['Semantic Paper']);
    expect(synced.data.sources).toEqual(['semantic-scholar']);
  });
});

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('cache format', () => {
  it('persists source results and ignores the old merged format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rp-cache-'));
    dirs.push(dir);
    const path = join(dir, 'cache.json');
    const cache: SourceCache = { version: 3, entries: {
      [sourceKey(scholar)]: { fetchedAt: new Date().toISOString(), result: result('google-scholar', 'Saved') },
    } };
    await writeCache(path, cache);
    expect(await readCache(path)).toEqual(cache);
    await writeFile(path, JSON.stringify({ profileId: 'A', publications: [{ title: 'Legacy' }] }));
    expect(await readCache(path)).toEqual(emptyCache());
  });
});

describe('BibTeX export', () => {
  it('exports stable keys, authors, DOI and escaped text', () => {
    const publication: Publication = {
      id: 'abc123', title: 'A {Study} of \\Models', authors: ['Ada Lovelace', 'Grace Hopper'],
      venue: 'Journal of Tests', year: 2024, citations: 2, scholarUrl: 'https://example.org/paper',
      citationsUrl: null, doi: '10.1234/test',
    };
    const bibtex = toBibTeX([publication]);
    expect(bibtex).toContain('@misc{rp-abc123,');
    expect(bibtex).toContain('author = {Ada Lovelace and Grace Hopper}');
    expect(bibtex).toContain('doi = {10.1234/test}');
    expect(bibtex).toContain('url = {https://doi.org/10.1234/test}');
    expect(bibtex).toContain('title = {A \\{Study\\} of \\textbackslash{}Models}');
  });
});
