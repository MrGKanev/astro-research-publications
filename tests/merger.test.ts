import { describe, it, expect } from 'vitest';
import { generateId, computeHIndex, computeI10Index, mergeResults } from '../src/merger.js';
import type { SourceResult } from '../src/types.js';

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('is deterministic for the same title', () => {
    expect(generateId('Deep Learning')).toBe(generateId('Deep Learning'));
  });

  it('is case-insensitive', () => {
    expect(generateId('Deep Learning')).toBe(generateId('deep learning'));
  });

  it('returns 16 hex characters', () => {
    expect(generateId('Some Title')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns different IDs for different titles', () => {
    expect(generateId('Title A')).not.toBe(generateId('Title B'));
  });
});

// ---------------------------------------------------------------------------
// computeHIndex
// ---------------------------------------------------------------------------

describe('computeHIndex', () => {
  it('returns 0 for an empty list', () => {
    expect(computeHIndex([])).toBe(0);
  });

  it('returns correct h-index for a simple case', () => {
    // 4 papers with [10, 8, 5, 3] → h=3 (3 papers with ≥3 citations)
    expect(computeHIndex([10, 8, 5, 3])).toBe(3);
  });

  it('handles all papers with equal citations', () => {
    // 5 papers each with 5 citations → h=5
    expect(computeHIndex([5, 5, 5, 5, 5])).toBe(5);
  });

  it('returns 1 when only one paper has any citations', () => {
    expect(computeHIndex([100, 0, 0])).toBe(1);
  });

  it('accepts unsorted input', () => {
    expect(computeHIndex([3, 10, 5, 8])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeI10Index
// ---------------------------------------------------------------------------

describe('computeI10Index', () => {
  it('returns 0 when no papers have 10+ citations', () => {
    expect(computeI10Index([9, 5, 2, 0])).toBe(0);
  });

  it('counts papers with exactly 10 citations', () => {
    expect(computeI10Index([10, 10, 9])).toBe(2);
  });

  it('counts papers with more than 10 citations', () => {
    expect(computeI10Index([100, 50, 10, 9])).toBe(3);
  });

  it('returns 0 for an empty list', () => {
    expect(computeI10Index([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mergeResults — deduplication
// ---------------------------------------------------------------------------

function makeSource(name: string, pubs: Partial<SourceResult['publications'][number]>[]): SourceResult {
  return {
    sourceName: name,
    profileName: 'Test Author',
    publications: pubs.map((p, i) => ({
      id: `id-${i}`,
      title: p.title ?? `Paper ${i}`,
      authors: p.authors ?? [],
      venue: p.venue ?? '',
      year: p.year ?? 2020,
      citations: p.citations ?? 0,
      scholarUrl: p.scholarUrl ?? '',
      citationsUrl: p.citationsUrl ?? null,
      sources: p.sources ?? [name],
      ...p,
    })),
  };
}

describe('mergeResults — exact deduplication', () => {
  it('merges identical titles from two sources into one publication', () => {
    const a = makeSource('google-scholar', [{ title: 'Attention Is All You Need', citations: 50000 }]);
    const b = makeSource('semantic-scholar', [{ title: 'Attention Is All You Need', citations: 48000 }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications).toHaveLength(1);
  });

  it('prefers the higher citation count when merging', () => {
    const a = makeSource('google-scholar', [{ title: 'My Paper', citations: 100 }]);
    const b = makeSource('semantic-scholar', [{ title: 'My Paper', citations: 150 }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications[0].citations).toBe(150);
  });

  it('fills in missing DOI from a secondary source', () => {
    const a = makeSource('google-scholar', [{ title: 'My Paper', citations: 10, doi: null }]);
    const b = makeSource('semantic-scholar', [{ title: 'My Paper', citations: 5, doi: '10.1234/abc' }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications[0].doi).toBe('10.1234/abc');
  });

  it('tracks contributing sources on merged publication', () => {
    const a = makeSource('google-scholar', [{ title: 'My Paper', sources: ['google-scholar'] }]);
    const b = makeSource('semantic-scholar', [{ title: 'My Paper', sources: ['semantic-scholar'] }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications[0].sources).toContain('google-scholar');
    expect(result.publications[0].sources).toContain('semantic-scholar');
  });
});

describe('mergeResults — fuzzy deduplication', () => {
  it('merges titles that differ only by punctuation', () => {
    const a = makeSource('google-scholar', [{ title: 'Attention Is All You Need', citations: 50 }]);
    const b = makeSource('semantic-scholar', [{ title: 'Attention is All You Need.', citations: 40 }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications).toHaveLength(1);
  });

  it('does NOT merge clearly different titles', () => {
    const a = makeSource('google-scholar', [{ title: 'Deep Learning for Vision' }]);
    const b = makeSource('semantic-scholar', [{ title: 'Reinforcement Learning for Robotics' }]);
    const result = mergeResults([a, b], 'test');
    expect(result.publications).toHaveLength(2);
  });
});

describe('mergeResults — sorting', () => {
  it('sorts by year descending, then citations descending', () => {
    const source = makeSource('google-scholar', [
      { title: 'Old Paper Low Cit', year: 2018, citations: 5 },
      { title: 'New Paper High Cit', year: 2023, citations: 100 },
      { title: 'Old Paper High Cit', year: 2018, citations: 200 },
    ]);
    const result = mergeResults([source], 'test');
    expect(result.publications[0].title).toBe('New Paper High Cit');
    expect(result.publications[1].title).toBe('Old Paper High Cit');
    expect(result.publications[2].title).toBe('Old Paper Low Cit');
  });
});

describe('mergeResults — publicationsByYear', () => {
  it('counts publications per year', () => {
    const source = makeSource('semantic-scholar', [
      { title: 'Paper A', year: 2021 },
      { title: 'Paper B', year: 2021 },
      { title: 'Paper C', year: 2022 },
    ]);
    const result = mergeResults([source], 'test');
    expect(result.publicationsByYear['2021']).toBe(2);
    expect(result.publicationsByYear['2022']).toBe(1);
  });

  it('ignores publications without a year', () => {
    const source = makeSource('semantic-scholar', [
      { title: 'Paper A', year: null },
      { title: 'Paper B', year: 2022 },
    ]);
    const result = mergeResults([source], 'test');
    expect(Object.keys(result.publicationsByYear)).toHaveLength(1);
  });
});
