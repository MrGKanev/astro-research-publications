import type { AstroIntegration } from 'astro';
import { fetchScholarProfile } from './fetcher.js';
import { resolveCachePath, readCache, writeCache, isCacheFresh } from './cache.js';
import type { ResearchPublicationsOptions, ScholarData } from './types.js';

export type { ResearchPublicationsOptions, ScholarData, Publication, CoAuthor, CitationStats } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:scholar-data';
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default function researchPublications(options: ResearchPublicationsOptions): AstroIntegration {
  const {
    scholarId,
    cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
    cachePath: cachePathOption = '.scholar-cache.json',
  } = options;

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
                  try {
                    logger.info(`[astro-research-publications] Fetching Google Scholar profile: ${scholarId}`);
                    data = await fetchScholarProfile(scholarId);
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
