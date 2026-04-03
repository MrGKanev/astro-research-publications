import type { AstroIntegration } from 'astro';
import { fetchPublications } from './fetcher.js';
import { resolveCachePath, readCache, writeCache, isCacheFresh } from './cache.js';
import type { ResearchPublicationsOptions, SourceConfig, ScholarData } from './types.js';

export type { ResearchPublicationsOptions, ScholarData, Publication, CoAuthor, CitationStats, SourceConfig } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:scholar-data';
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function resolveSources(options: ResearchPublicationsOptions): SourceConfig[] {
  if (options.sources && options.sources.length > 0) return options.sources;
  if (options.scholarId) return [{ type: 'google-scholar', profileId: options.scholarId }];
  throw new Error('[astro-research-publications] Provide either `scholarId` or `sources` in the integration options.');
}

function describeSource(source: SourceConfig): string {
  switch (source.type) {
    case 'google-scholar': return `Google Scholar (${source.profileId})`;
    case 'semantic-scholar': return `Semantic Scholar (${source.authorId})`;
    case 'open-alex': return `OpenAlex (${source.authorId})`;
    case 'orcid': return `ORCID (${source.orcidId})`;
  }
}

export default function researchPublications(options: ResearchPublicationsOptions): AstroIntegration {
  const {
    cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
    cachePath: cachePathOption = '.scholar-cache.json',
  } = options;

  const sources = resolveSources(options);

  return {
    name: 'astro-research-publications',
    hooks: {
      'astro:config:setup': ({ updateConfig, config, logger }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-research-publications',
              enforce: 'pre',
              resolveId(id) {
                if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID;
              },
              async load(id) {
                if (id !== RESOLVED_ID) return;
                const cachePath = resolveCachePath(config.root, cachePathOption);
                let data: ScholarData | null = readCache(cachePath);

                if (data && isCacheFresh(data, cacheMaxAgeMs)) {
                  const age = Math.round((Date.now() - new Date(data.lastSynced).getTime()) / 60000);
                  logger.info(`[astro-research-publications] Using cached data (${age}m old, ${data.publications.length} publications).`);
                } else {
                  const sourceLabels = sources.map(describeSource).join(', ');
                  try {
                    logger.info(`[astro-research-publications] Fetching from: ${sourceLabels}`);
                    data = await fetchPublications(sources);
                    writeCache(cachePath, data);
                    logger.info(`[astro-research-publications] Synced ${data.publications.length} publications, ${data.stats.totalCitations} total citations.`);
                  } catch (err) {
                    if (data) {
                      logger.warn(`[astro-research-publications] Fetch failed (${err}). Using stale cache from ${data.lastSynced}.`);
                    } else {
                      throw new Error(`[astro-research-publications] Fetch failed and no cache: ${err}`);
                    }
                  }
                }

                return `export default ${JSON.stringify(data)}`;
              },
            }],
          },
        });
      },
    },
  };
}
