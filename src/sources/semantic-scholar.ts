import type { Publication, SourceResult } from '../types.js';
import { generateId } from '../merger.js';

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
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Semantic Scholar HTTP ${res.status} - ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchSemanticScholar(authorId: string, apiKey?: string): Promise<SourceResult> {
  const authorData = await fetchJSON<SSAuthor>(
    `${BASE}/author/${authorId}?fields=${AUTHOR_FIELDS}`,
    apiKey,
  );

  // Fetch all papers — first page gives us `total` so remaining pages load in parallel
  const limit = 1000;
  const firstPage = await fetchJSON<{ data: SSPaper[]; total?: number; next?: number }>(
    `${BASE}/author/${authorId}/papers?fields=${PAPER_FIELDS}&limit=${limit}&offset=0`,
    apiKey,
  );
  let papers: SSPaper[] = firstPage.data ?? [];
  const total = firstPage.total ?? papers.length;

  if (total > limit) {
    const offsets: number[] = [];
    for (let o = limit; o < total; o += limit) offsets.push(o);
    const remaining = await Promise.all(
      offsets.map((o) =>
        fetchJSON<{ data: SSPaper[] }>(
          `${BASE}/author/${authorId}/papers?fields=${PAPER_FIELDS}&limit=${limit}&offset=${o}`,
          apiKey,
        ),
      ),
    );
    for (const page of remaining) papers = papers.concat(page.data ?? []);
  }

  const publications: Publication[] = papers.map((p) => {
    const doi = p.externalIds?.DOI ?? null;
    return {
      id: generateId(p.title),
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
