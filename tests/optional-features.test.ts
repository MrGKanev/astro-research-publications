import { describe, expect, it, vi } from 'vitest';
import { mergeResults } from '../src/merger.js';
import { applyOverrides } from '../src/overrides.js';
import { enrichCitations } from '../src/citations.js';
import { toBibTeX } from '../src/bibtex.js';
import { toCslJson } from '../src/csl.js';
import { fetchOpenAlex } from '../src/sources/open-alex.js';
import type { SourceResult } from '../src/types.js';
import type { SourceCache } from '../src/cache.js';

function source(name: string, title: string, doi: string): SourceResult {
  return {
    sourceName: name,
    profileName: 'Researcher',
    publications: [{ id: title, title, authors: ['Ada Lovelace'], venue: 'Journal', year: 2024,
      citations: 2, scholarUrl: null, citationsUrl: null, doi, sources: [name] }],
  };
}

describe('optional DOI deduplication', () => {
  it('merges different titles with the same normalized DOI', () => {
    const data = mergeResults([
      source('semantic-scholar', 'A Study', 'https://doi.org/10.1234/ABC'),
      source('open-alex', 'A Study: Extended', '10.1234/abc'),
    ], 'A', true);
    expect(data.publications).toHaveLength(1);
    expect(data.publications[0].sources).toEqual(['semantic-scholar', 'open-alex']);
  });

  it('keeps identical titles with conflicting DOIs separate when enabled', () => {
    const results = [source('semantic-scholar', 'A Study', '10.1234/a'), source('open-alex', 'A Study', '10.1234/b')];
    const distinct = mergeResults(results, 'A', true).publications;
    expect(distinct).toHaveLength(2);
    expect(new Set(distinct.map((publication) => publication.id)).size).toBe(2);
    expect(mergeResults(results, 'A').publications).toHaveLength(1);
  });
});

describe('manual overrides', () => {
  it('corrects a record, hides another, and recalculates publication years', () => {
    const original = mergeResults([
      source('open-alex', 'Keep', '10.1234/keep'),
      source('semantic-scholar', 'Hide', '10.1234/hide'),
    ], 'A');
    const { data, warnings } = applyOverrides(original, [
      { match: { doi: 'https://doi.org/10.1234/keep' }, title: 'Corrected', year: 2025 },
      { match: { title: 'Hide' }, hide: true },
    ]);
    expect(warnings).toEqual([]);
    expect(data.publications.map((publication) => publication.title)).toEqual(['Corrected']);
    expect(data.publicationsByYear).toEqual({ '2025': 1 });
    expect(original.publications).toHaveLength(2);
    expect(original.publications[0].title).not.toBe('Corrected');
  });

  it('keeps a manual correction in BibTeX instead of replacing it with DOI metadata', async () => {
    const original = mergeResults([source('open-alex', 'Original', '10.1234/original')], 'A');
    const overridden = applyOverrides(original, [{ match: { doi: '10.1234/original' }, title: 'Corrected' }]);
    const enriched = await enrichCitations(overridden.data, { version: 3, entries: {} }, 0,
      async () => { throw new Error('should not fetch'); }, overridden.correctedIds);
    expect(enriched.warnings).toEqual([]);
    expect(toBibTeX(enriched.data.publications)).toContain('title = {Corrected}');
  });
});

describe('citation enrichment and exports', () => {
  it('uses and reuses DOI BibTeX, with a generic fallback for missing DOIs', async () => {
    const data = mergeResults([source('open-alex', 'A Study', '10.1234/a')], 'A');
    const cache: SourceCache = { version: 3, entries: {} };
    let calls = 0;
    const fetchCitation = async () => { calls++; return '@article{doi-key, title={A Study}}'; };
    const first = await enrichCitations(data, cache, 86_400_000, fetchCitation);
    const second = await enrichCitations(data, first.cache, 86_400_000, fetchCitation);
    expect(calls).toBe(1);
    expect(first.updated).toBe(true);
    expect(second.updated).toBe(false);
    expect(toBibTeX(first.data.publications)).toContain('@article{doi-key');
    expect(toCslJson(first.data.publications)[0]).toMatchObject({
      id: 'A Study', type: 'article', DOI: '10.1234/a', author: [{ literal: 'Ada Lovelace' }],
      issued: { 'date-parts': [[2024]] },
    });
  });

  it('falls back when citation lookup fails', async () => {
    const data = mergeResults([source('open-alex', 'A Study', '10.1234/a')], 'A');
    const result = await enrichCitations(data, { version: 3, entries: {} }, 0, async () => { throw new Error('offline'); });
    expect(result.warnings).toHaveLength(1);
    expect(toBibTeX(result.data.publications)).toContain('@misc{rp-A-Study,');
  });
});

describe('OpenAlex access links', () => {
  it('reads the best open location and direct PDF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes('/authors/')
        ? { display_name: 'Researcher' }
        : { results: [{ id: 'https://openalex.org/W1', title: 'Open Paper', publication_year: 2024,
          cited_by_count: 1, authorships: [], best_oa_location: {
            landing_page_url: 'https://example.org/open', pdf_url: 'https://example.org/open.pdf',
          } }], meta: {} };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    try {
      const data = await fetchOpenAlex('A1');
      expect(data.publications[0]).toMatchObject({
        openAccessUrl: 'https://example.org/open', pdfUrl: 'https://example.org/open.pdf',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
