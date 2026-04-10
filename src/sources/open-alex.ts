import type { Publication, SourceResult } from '../types.js';
import { generateId } from '../merger.js';

const BASE = 'https://api.openalex.org';

// Use polite pool by adding mailto - no key required
const MAILTO = 'astro-research-publications@example.com';

interface OAWork {
  title: string;
  publication_year: number | null;
  cited_by_count: number;
  authorships: { author: { display_name: string } }[];
  primary_location?: { source?: { display_name?: string } } | null;
  doi?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  id: string;
}

interface OAAuthor {
  display_name: string;
  summary_stats?: {
    h_index?: number;
    i10_index?: number;
    '2yr_cited_by_count'?: number;
  };
  cited_by_count?: number;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const separator = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${separator}mailto=${MAILTO}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status} - ${url}`);
  return res.json() as Promise<T>;
}

/** Reconstruct abstract from OpenAlex inverted index format */
function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string | null {
  if (!invertedIndex) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ') || null;
}

export async function fetchOpenAlex(authorId: string): Promise<SourceResult> {
  const authorData = await fetchJSON<OAAuthor>(`${BASE}/authors/${authorId}`);

  // Paginate through all works
  let works: OAWork[] = [];
  let cursor = '*';
  const fields = 'title,publication_year,cited_by_count,authorships,primary_location,doi,abstract_inverted_index,id';
  while (true) {
    const page = await fetchJSON<{ results: OAWork[]; meta: { next_cursor?: string } }>(
      `${BASE}/works?filter=authorships.author.id:${authorId}&per_page=200&cursor=${cursor}&select=${fields}`,
    );
    works = works.concat(page.results ?? []);
    if (!page.meta?.next_cursor || page.results.length === 0) break;
    cursor = page.meta.next_cursor;
  }

  const publications: Publication[] = works.map((w) => {
    const title = w.title ?? '';
    const doi = w.doi?.replace('https://doi.org/', '') ?? null;
    const openAlexUrl = w.id ?? '';
    return {
      id: generateId(title),
      title,
      authors: (w.authorships ?? []).map((a) => a.author.display_name),
      venue: w.primary_location?.source?.display_name ?? '',
      year: w.publication_year ?? null,
      citations: w.cited_by_count ?? 0,
      scholarUrl: openAlexUrl,
      citationsUrl: null,
      doi,
      abstract: reconstructAbstract(w.abstract_inverted_index),
      sources: ['open-alex'],
    };
  });

  const stats = authorData.summary_stats
    ? {
        hIndex: authorData.summary_stats.h_index ?? 0,
        i10Index: authorData.summary_stats.i10_index ?? 0,
        totalCitations: authorData.cited_by_count ?? 0,
      }
    : undefined;

  return {
    sourceName: 'open-alex',
    profileName: authorData.display_name,
    publications,
    stats,
  };
}
