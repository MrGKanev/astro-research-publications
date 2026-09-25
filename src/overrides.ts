import { normaliseDoi } from './merger.js';
import type { Publication, PublicationOverride, ScholarData } from './types.js';

function matches(publication: Publication, override: PublicationOverride): boolean {
  const { id, doi, title } = override.match;
  if (!id && !doi && !title) throw new Error('[astro-research-publications] An override needs match.id, match.doi, or match.title.');
  return (!id || publication.id === id) &&
    (!doi || normaliseDoi(publication.doi) === normaliseDoi(doi)) &&
    (!title || publication.title.trim().toLowerCase() === title.trim().toLowerCase());
}

export function applyOverrides(data: ScholarData, overrides: PublicationOverride[]): { data: ScholarData; warnings: string[]; correctedIds: Set<string> } {
  const warnings: string[] = [];
  const correctedIds = new Set<string>();
  const publications = data.publications.map((publication) => ({ ...publication }));
  const hidden = new Set<Publication>();

  for (const override of overrides) {
    const found = publications.filter((publication) => matches(publication, override));
    if (found.length === 0) {
      warnings.push(`No publication matched override ${JSON.stringify(override.match)}.`);
      continue;
    }
    for (const publication of found) {
      if (override.hide) hidden.add(publication);
      for (const field of ['title', 'authors', 'venue', 'year', 'doi', 'abstract', 'openAccessUrl', 'pdfUrl'] as const) {
        const value = override[field];
        if (value !== undefined) {
          Object.assign(publication, { [field]: value });
          correctedIds.add(publication.id);
          publication.bibtex = null;
        }
      }
    }
  }

  const visible = publications.filter((publication) => !hidden.has(publication))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citations - a.citations);
  const publicationsByYear: Record<string, number> = {};
  for (const publication of visible) {
    if (publication.year !== null) {
      const year = String(publication.year);
      publicationsByYear[year] = (publicationsByYear[year] ?? 0) + 1;
    }
  }
  return { data: { ...data, publications: visible, publicationsByYear }, warnings, correctedIds };
}
