import type { Publication, SourceResult } from '../types.js';

const BASE = 'https://pub.orcid.org/v3.0';

interface OrcidWorkSummary {
  'put-code': number;
  title?: { title?: { value?: string } };
  'publication-date'?: { year?: { value?: string } };
  'external-ids'?: {
    'external-id'?: { 'external-id-type': string; 'external-id-value': string }[];
  };
  'journal-title'?: { value?: string };
  url?: { value?: string };
}

interface OrcidWorksGroup {
  'work-summary': OrcidWorkSummary[];
}

interface OrcidWorks {
  group: OrcidWorksGroup[];
}

interface OrcidPerson {
  name?: { 'given-names'?: { value?: string }; 'family-name'?: { value?: string } };
}

interface OrcidRecord {
  person?: OrcidPerson;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ORCID HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchOrcid(orcidId: string): Promise<SourceResult> {
  const [record, worksData] = await Promise.all([
    fetchJSON<OrcidRecord>(`${BASE}/${orcidId}/person`),
    fetchJSON<OrcidWorks>(`${BASE}/${orcidId}/works`),
  ]);

  const given = record.person?.name?.['given-names']?.value ?? '';
  const family = record.person?.name?.['family-name']?.value ?? '';
  const profileName = [given, family].filter(Boolean).join(' ') || orcidId;

  const publications: Publication[] = (worksData.group ?? []).flatMap((group): Publication[] => {
    // Take the first work-summary in the group (they are duplicates across sources)
    const summary = group['work-summary'][0];
    const title = summary?.title?.title?.value ?? '';
    if (!title) return [];

    const yearStr = summary?.['publication-date']?.year?.value;
    const year = yearStr ? parseInt(yearStr, 10) : null;

    const externalIds = summary?.['external-ids']?.['external-id'] ?? [];
    const doi = externalIds.find((e) => e['external-id-type'] === 'doi')?.['external-id-value'] ?? null;

    const venue = summary?.['journal-title']?.value ?? '';
    const url = summary?.url?.value ?? (doi ? `https://doi.org/${doi}` : '');

    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

    return [{
      id,
      title,
      authors: [],   // ORCID works summary doesn't include co-author list
      venue,
      year,
      citations: 0,  // ORCID public API doesn't provide citation counts
      scholarUrl: url,
      citationsUrl: null,
      doi,
      abstract: null,
      sources: ['orcid'],
    }];
  });

  return {
    sourceName: 'orcid',
    profileName,
    publications,
  };
}
