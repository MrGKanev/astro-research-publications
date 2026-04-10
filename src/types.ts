export interface Publication {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number | null;
  citations: number;
  scholarUrl: string;
  citationsUrl: string | null;
  doi?: string | null;
  abstract?: string | null;
  /** Which sources contributed this publication, e.g. ['google-scholar', 'semantic-scholar'] */
  sources?: string[];
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
  /** Citations per year, e.g. { "2023": 12, "2024": 30 } — only available from Google Scholar */
  citationsByYear: Record<string, number>;
  /** Publications per year, computed from merged publications — always available */
  publicationsByYear: Record<string, number>;
  coAuthors: CoAuthor[];
  lastSynced: string;
}

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

export type SourceConfig =
  | { type: 'google-scholar'; profileId: string }
  | { type: 'semantic-scholar'; authorId: string; apiKey?: string }
  | { type: 'open-alex'; authorId: string }
  | { type: 'orcid'; orcidId: string };

export interface ResearchPublicationsOptions {
  /**
   * Google Scholar profile ID (the `user=` param in your Scholar URL).
   * Shorthand for `sources: [{ type: 'google-scholar', profileId: '...' }]`.
   * Ignored when `sources` is provided.
   */
  scholarId?: string;
  /**
   * One or more data sources. If omitted and `scholarId` is set, defaults to
   * Google Scholar. Results from multiple sources are merged automatically.
   */
  sources?: SourceConfig[];
  /** How long to keep cached data before re-fetching. Defaults to 24 hours. */
  cacheMaxAgeMs?: number;
  /** Path to the cache file, relative to the project root. Defaults to .scholar-cache.json */
  cachePath?: string;
}

// ---------------------------------------------------------------------------
// Internal per-source result (not exported to users)
// ---------------------------------------------------------------------------

export interface SourceResult {
  sourceName: string;
  profileName: string;
  publications: Publication[];
  stats?: Partial<CitationStats>;
  citationsByYear?: Record<string, number>;
  coAuthors?: CoAuthor[];
}
