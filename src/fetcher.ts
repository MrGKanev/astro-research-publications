import type { SourceConfig, SourceResult, ScholarData } from './types.js';
import { fetchGoogleScholar } from './sources/google-scholar.js';
import { fetchSemanticScholar } from './sources/semantic-scholar.js';
import { fetchOpenAlex } from './sources/open-alex.js';
import { fetchOrcid } from './sources/orcid.js';
import { mergeResults } from './merger.js';

async function fetchSource(source: SourceConfig): Promise<SourceResult> {
  switch (source.type) {
    case 'google-scholar':
      return fetchGoogleScholar(source.profileId);
    case 'semantic-scholar':
      return fetchSemanticScholar(source.authorId, source.apiKey);
    case 'open-alex':
      return fetchOpenAlex(source.authorId);
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

export async function fetchPublications(sources: SourceConfig[]): Promise<ScholarData> {
  const results = await Promise.all(sources.map(fetchSource));
  return mergeResults(results, deriveProfileId(sources));
}

/** @deprecated Use `fetchPublications([{ type: 'google-scholar', profileId }])` instead. */
export async function fetchScholarProfile(profileId: string): Promise<ScholarData> {
  return fetchPublications([{ type: 'google-scholar', profileId }]);
}
