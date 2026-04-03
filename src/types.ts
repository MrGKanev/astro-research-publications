export interface Publication {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number | null;
  citations: number;
  scholarUrl: string;
  citationsUrl: string | null;
}

export interface CoAuthor {
  name: string;
  scholarUrl: string;
  affiliation: string | null;
}

export interface CitationStats {
  totalCitations: number;
  totalCitationsSince: number;
  hIndex: number;
  hIndexSince: number;
  i10Index: number;
  i10IndexSince: number;
  sinceYear: number;
}

export interface ScholarData {
  profileId: string;
  profileName: string;
  publications: Publication[];
  stats: CitationStats;
  /** Citations per year, e.g. { "2023": 12, "2024": 30 } */
  citationsByYear: Record<string, number>;
  coAuthors: CoAuthor[];
  lastSynced: string;
}

export interface ResearchPublicationsOptions {
  /** Google Scholar profile ID (the user= param in your Scholar URL) */
  scholarId: string;
  /** How long to keep cached data before re-fetching. Defaults to 24 hours. */
  cacheMaxAgeMs?: number;
  /** Path to the cache file, relative to the project root. Defaults to .scholar-cache.json */
  cachePath?: string;
}
