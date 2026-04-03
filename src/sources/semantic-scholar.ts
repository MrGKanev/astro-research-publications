import type { Publication, SourceResult } from '../types.js';

const BASE = 'https://api.semanticscholar.org/graph/v1';

const PAPER_FIELDS = 'title,year,citationCount,authors,venue,externalIds,abstract';
const AUTHOR_FIELDS = 'name,hIndex,citationCount';

interface SSPaper {
  paperId: string;
  title: string;
  year: number | null;
  citationCount: number;
  authors: { authorId: string; name: string }[];
  venue: string;
  externalIds: Record<string, string>;
  abstract?: string;
}

interface SSAuthor {
  authorId: string;
  name: string;
  hIndex?: number;
  citationCount?: number;
}

async function fetchJSON<T>(url: string, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Semantic Scholar HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchSemanticScholar(authorId: string, apiKey?: string): Promise<SourceResult> {
  const authorData = await fetchJSON<SSAuthor>(
    `${BASE}/author/${authorId}?fields=${AUTHOR_FIELDS}`,
    apiKey,
  );

  // Fetch all papers with pagination
  let papers: SSPaper[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const page = await fetchJSON<{ data: SSPaper[]; next?: number }>(
      `${BASE}/author/${authorId}/papers?fields=${PAPER_FIELDS}&limit=${limit}&offset=${offset}`,
      apiKey,
    );
    papers = papers.concat(page.data ?? []);
    if (page.next === undefined || (page.data ?? []).length === 0) break;
    offset = page.next;
  }

  const publications: Publication[] = papers.map((p) => {
    const doi = p.externalIds?.DOI ?? null;
    const id = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    return {
      id,
      title: p.title,
      authors: (p.authors ?? []).map((a) => a.name),
      venue: p.venue ?? '',
      year: p.year ?? null,
      citations: p.citationCount ?? 0,
      scholarUrl: `https://www.semanticscholar.org/paper/${p.paperId}`,
      citationsUrl: null,
      doi,
      abstract: p.abstract ?? null,
      sources: ['semantic-scholar'],
    };
  });

  return {
    sourceName: 'semantic-scholar',
    profileName: authorData.name,
    publications,
    stats: authorData.hIndex !== undefined || authorData.citationCount !== undefined
      ? {
          hIndex: authorData.hIndex ?? 0,
          totalCitations: authorData.citationCount ?? 0,
        }
      : undefined,
  };
}
