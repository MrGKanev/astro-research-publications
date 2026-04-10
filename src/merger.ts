import { createHash } from 'node:crypto';
import type { Publication, CitationStats, CoAuthor, ScholarData, SourceResult } from './types.js';

/** Generate a stable, unique ID for a publication from its full title */
export function generateId(title: string): string {
  return createHash('sha1').update(title.toLowerCase().trim()).digest('hex').slice(0, 16);
}

/** Jaccard similarity on normalised word sets — used for fuzzy title deduplication */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Normalise a title for fuzzy deduplication across sources */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute h-index from a sorted (desc) list of citation counts */
export function computeHIndex(counts: number[]): number {
  const sorted = [...counts].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

/** Compute i10-index: number of publications with at least 10 citations */
export function computeI10Index(counts: number[]): number {
  return counts.filter((c) => c >= 10).length;
}

const FUZZY_THRESHOLD = 0.85;

function mergePublications(allResults: SourceResult[]): Publication[] {
  // Map from normalised title → merged Publication
  const merged = new Map<string, Publication>();

  for (const result of allResults) {
    for (const pub of result.publications) {
      const key = normaliseTitle(pub.title);
      if (!key) continue;

      // Exact match first (fast path), then fuzzy match
      let matchKey = merged.has(key) ? key : undefined;
      if (!matchKey) {
        for (const existingKey of merged.keys()) {
          if (jaccardSimilarity(key, existingKey) >= FUZZY_THRESHOLD) {
            matchKey = existingKey;
            break;
          }
        }
      }

      const existing = matchKey ? merged.get(matchKey) : undefined;
      if (!existing) {
        merged.set(key, { ...pub });
        continue;
      }

      // Merge: prefer higher citation count
      if (pub.citations > existing.citations) {
        existing.citations = pub.citations;
        existing.citationsUrl = pub.citationsUrl ?? existing.citationsUrl;
      }

      // Fill in missing fields from other sources
      if (!existing.doi && pub.doi) existing.doi = pub.doi;
      if (!existing.abstract && pub.abstract) existing.abstract = pub.abstract;
      if (!existing.year && pub.year) existing.year = pub.year;
      if (existing.authors.length === 0 && pub.authors.length > 0) existing.authors = pub.authors;
      if (!existing.venue && pub.venue) existing.venue = pub.venue;

      // Scholar URL: prefer Google Scholar, fall back to whatever exists
      if (!existing.scholarUrl && pub.scholarUrl) existing.scholarUrl = pub.scholarUrl;

      // Track all contributing sources
      const existingSources = new Set(existing.sources ?? []);
      for (const s of pub.sources ?? [result.sourceName]) existingSources.add(s);
      existing.sources = Array.from(existingSources);
    }
  }

  // Sort by year descending, then by citations descending
  return Array.from(merged.values()).sort((a, b) => {
    if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
    return b.citations - a.citations;
  });
}

function mergeStats(
  results: SourceResult[],
  publications: Publication[],
): CitationStats {
  // Prefer Google Scholar stats (most complete), then fall back to other sources,
  // and finally compute what we can from the merged publications list.
  const scholarResult = results.find((r) => r.sourceName === 'google-scholar');
  if (scholarResult?.stats) {
    const s = scholarResult.stats;
    return {
      totalCitations: s.totalCitations ?? 0,
      totalCitationsSince: s.totalCitationsSince ?? 0,
      hIndex: s.hIndex ?? 0,
      hIndexSince: s.hIndexSince ?? 0,
      i10Index: s.i10Index ?? 0,
      i10IndexSince: s.i10IndexSince ?? 0,
      sinceYear: s.sinceYear ?? new Date().getFullYear() - 5,
    };
  }

  // Try any other source that returned partial stats
  for (const result of results) {
    if (result.stats) {
      const s = result.stats;
      const counts = publications.map((p) => p.citations);
      return {
        totalCitations: s.totalCitations ?? counts.reduce((a, b) => a + b, 0),
        totalCitationsSince: s.totalCitationsSince ?? 0,
        hIndex: s.hIndex ?? computeHIndex(counts),
        hIndexSince: s.hIndexSince ?? 0,
        i10Index: s.i10Index ?? computeI10Index(counts),
        i10IndexSince: s.i10IndexSince ?? 0,
        sinceYear: s.sinceYear ?? new Date().getFullYear() - 5,
      };
    }
  }

  // Compute everything from merged publications
  const counts = publications.map((p) => p.citations);
  return {
    totalCitations: counts.reduce((a, b) => a + b, 0),
    totalCitationsSince: 0,
    hIndex: computeHIndex(counts),
    hIndexSince: 0,
    i10Index: computeI10Index(counts),
    i10IndexSince: 0,
    sinceYear: new Date().getFullYear() - 5,
  };
}

function mergeCitationsByYear(results: SourceResult[]): Record<string, number> {
  // Prefer Google Scholar (has the bar chart data); others don't provide this
  const scholarResult = results.find((r) => r.sourceName === 'google-scholar');
  return scholarResult?.citationsByYear ?? {};
}

function computePublicationsByYear(publications: Publication[]): Record<string, number> {
  const byYear: Record<string, number> = {};
  for (const pub of publications) {
    if (pub.year) {
      const y = String(pub.year);
      byYear[y] = (byYear[y] ?? 0) + 1;
    }
  }
  return byYear;
}

function mergeCoAuthors(results: SourceResult[]): CoAuthor[] {
  const seen = new Set<string>();
  const coAuthors: CoAuthor[] = [];
  for (const result of results) {
    for (const ca of result.coAuthors ?? []) {
      if (!seen.has(ca.name)) {
        seen.add(ca.name);
        coAuthors.push(ca);
      }
    }
  }
  return coAuthors;
}

export function mergeResults(results: SourceResult[], profileId: string): ScholarData {
  const publications = mergePublications(results);

  // Profile name: prefer Google Scholar, then first available
  const profileName =
    results.find((r) => r.sourceName === 'google-scholar')?.profileName ??
    results[0]?.profileName ??
    profileId;

  return {
    profileId,
    profileName,
    publications,
    stats: mergeStats(results, publications),
    citationsByYear: mergeCitationsByYear(results),
    publicationsByYear: computePublicationsByYear(publications),
    coAuthors: mergeCoAuthors(results),
    lastSynced: new Date().toISOString(),
  };
}
