import type { AstroIntegration } from 'astro';
import { syncPublications } from './fetcher.js';
import { resolveCachePath, readCache, writeCache } from './cache.js';
import type { ResearchPublicationsOptions, SourceConfig } from './types.js';

export type { ResearchPublicationsOptions, ScholarData, Publication, CoAuthor, CitationStats, SourceConfig } from './types.js';
export { toBibTeX } from './bibtex.js';

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
    cachePath: cachePathOption = '.astro/scholar-cache.json',
  } = options;
  const cacheMaxAgeMs = Math.max(0, options.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS);

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
                const cache = await readCache(cachePath);
                const sourceLabels = sources.map(describeSource).join(', ');
                logger.info(`Loading: ${sourceLabels}`);
                const { data, cache: nextCache, updated, warnings } = await syncPublications(sources, cache, cacheMaxAgeMs);
                for (const warning of warnings) logger.warn(warning);
                if (updated) await writeCache(cachePath, nextCache);
                logger.info(`Ready: ${data.publications.length} publications, ${data.stats.totalCitations} total citations.`);

                return `export default ${JSON.stringify(data)}`;
              },
            }],
          },
        });
      },
    },
  };
}
