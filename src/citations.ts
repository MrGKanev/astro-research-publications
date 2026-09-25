import { normaliseDoi } from './merger.js';
import type { SourceCache } from './cache.js';
import type { ScholarData } from './types.js';

async function fetchBibTeX(doi: string): Promise<string> {
  const path = doi.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://doi.org/${path}`, {
    headers: { Accept: 'application/x-bibtex' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DOI citation HTTP ${response.status}`);
  const bibtex = (await response.text()).trim();
  if (!bibtex.startsWith('@') || bibtex.length > 100_000) throw new Error('Invalid DOI citation response');
  return bibtex;
}

/** Enrich DOI records, falling back to the local generic citation when lookup fails. */
export async function enrichCitations(
  data: ScholarData,
  cache: SourceCache,
  maxAgeMs: number,
  fetchCitation: (doi: string) => Promise<string> = fetchBibTeX,
  skipIds: Set<string> = new Set(),
): Promise<{ data: ScholarData; cache: SourceCache; updated: boolean; warnings: string[] }> {
  const citations = { ...cache.citations };
  const warnings: string[] = [];
  let updated = false;
  const dois = [...new Set(data.publications.filter((publication) => !skipIds.has(publication.id))
    .map((publication) => normaliseDoi(publication.doi)).filter(Boolean))];

  // Keep concurrent requests bounded for authors with long publication lists.
  for (let index = 0; index < dois.length; index += 4) {
    await Promise.all(dois.slice(index, index + 4).map(async (doi) => {
      const cached = citations[doi];
      const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
      if (cached && Number.isFinite(age) && age >= 0 && age < maxAgeMs) return;
      try {
        const bibtex = await fetchCitation(doi);
        if (!bibtex.trim().startsWith('@')) throw new Error('Invalid DOI citation response');
        citations[doi] = { bibtex: bibtex.trim(), fetchedAt: new Date().toISOString() };
        updated = true;
      } catch (error) {
        warnings.push(`Citation lookup failed for ${doi}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }

  const publications = data.publications.map((publication) => ({
    ...publication,
    bibtex: skipIds.has(publication.id) ? null : citations[normaliseDoi(publication.doi)]?.bibtex ?? null,
  }));
  return { data: { ...data, publications }, cache: { ...cache, citations }, updated, warnings };
}
