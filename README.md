# astro-research-publications

[![npm](https://img.shields.io/npm/v/astro-research-publications)](https://www.npmjs.com/package/astro-research-publications)
[![npm downloads](https://img.shields.io/npm/dm/astro-research-publications)](https://www.npmjs.com/package/astro-research-publications)
[![Socket Badge](https://badge.socket.dev/npm/package/astro-research-publications)](https://socket.dev/npm/package/astro-research-publications)
[![Publish to npm](https://github.com/MrGKanev/astro-research-publications/actions/workflows/publish.yml/badge.svg)](https://github.com/MrGKanev/astro-research-publications/actions/workflows/publish.yml)

An Astro integration that fetches your academic publications at build time from one or more sources and renders a fully-styled publications page - complete with citation stats, a citations-per-year bar chart, and co-author list.

Supports **Google Scholar**, **Semantic Scholar**, **OpenAlex**, and **ORCID**. Results from multiple sources are merged and deduplicated automatically.

Data is cached locally so repeat builds are fast, and a stale cache is used if any source is unreachable.

---

## Features

- Fetches publications, citation counts, h-index, i10-index, and co-authors
- **Multi-source** - combine Google Scholar, Semantic Scholar, OpenAlex, and/or ORCID; results are merged and deduplicated by title
- Renders a ready-to-use `<ResearchPublications />` component with a responsive two-column layout
- Expandable abstract and DOI badge per publication (no JavaScript required)
- Local JSON cache per source and profile with configurable max-age (default: 24 h)
- Refreshes healthy sources independently and uses stale data for any source that fails
- BibTeX download and year/source filters on the publications page
- Optional DOI-first deduplication, manual corrections, open-access links, citation tools, and JSON exports
- CSS custom properties for easy theming - no stylesheet overrides required
- Full TypeScript types exported for `ScholarData`, `Publication`, `CitationStats`, `SourceConfig`, and more
- Works with Astro 4, 5, 6, and 7

---

## Installation

```bash
# npm
npm install astro-research-publications
# pnpm
pnpm add astro-research-publications
```

---

## Quick Start

### Google Scholar only (default)

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import researchPublications from 'astro-research-publications';

export default defineConfig({
  integrations: [
    researchPublications({
      scholarId: 'YOUR_SCHOLAR_ID',
    }),
  ],
});
```

Your Scholar ID is the `user=` value in your Google Scholar profile URL, e.g. `https://scholar.google.com/citations?user=XXXXXXXX`.

Drop the component into any page:

```astro
---
import ResearchPublications from 'astro-research-publications/components';
---

<ResearchPublications />
```

To show only the top N publications (stats always reflect the full dataset):

```astro
<ResearchPublications limit={10} />
```

The component includes year and source filters and a download link for all publications in BibTeX format. Filtering uses a small client-side script; the full list, statistics, and BibTeX link remain available without JavaScript. With `limit`, filters apply to the displayed subset, while the BibTeX download contains the full dataset.

You can also generate BibTeX yourself:

```ts
import { toBibTeX } from 'astro-research-publications';
import data from 'virtual:scholar-data';

const bibtex = toBibTeX(data.publications);
```

---

## Multi-source

Use the `sources` array to pull from multiple platforms. Results are merged by normalised title: citation counts, DOIs, abstracts, and author lists are combined across sources.

```js
// astro.config.mjs
researchPublications({
  sources: [
    { type: 'google-scholar',    profileId: 'YOUR_SCHOLAR_ID' },
    { type: 'semantic-scholar',  authorId:  'YOUR_S2_AUTHOR_ID' },
    { type: 'open-alex',         authorId:  'YOUR_OPENALEX_ID' },
    { type: 'orcid',             orcidId:   '0000-0000-0000-0000' },
  ],
})
```

You can use any combination - a single source, two sources, or all four.

Each configured profile has its own cache entry. If one source is unavailable, the integration keeps its stale entry when available and continues with the other sources. If a source has no cached data, that source is omitted with a warning; the build fails only when none of the configured sources has usable data. Changing a source ID cannot reuse data from the old profile. Existing caches from versions before this format are refreshed on the next build.

### Finding your IDs

| Source | Where to find your ID |
|---|---|
| **Google Scholar** | `user=` param in your Scholar profile URL |
| **Semantic Scholar** | Visit `semanticscholar.org/author/YOUR-NAME` - the number in the URL |
| **OpenAlex** | Visit `openalex.org/authors?search=YOUR-NAME` - the `A…` ID |
| **ORCID** | Your 16-digit ORCID iD, e.g. `0000-0002-1825-0097` |

### Merge behaviour

| Field | Strategy |
|---|---|
| Citations | Take the highest count across sources |
| DOI | Fill from any source that has it |
| Abstract | Fill from any source that has it |
| Authors | Fill from any source that has a non-empty list |
| Citation stats (h-index, etc.) | Google Scholar first, then other sources, then computed from merged papers |
| Citations per year | Google Scholar only |
| `pub.sources[]` | Lists every source that contributed the entry |

---

## Real-world example - gkanev.com

This is how the publications page at [gkanev.com/research-publications/](https://gkanev.com/research-publications/) uses the plugin.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import researchPublications from 'astro-research-publications';

export default defineConfig({
  integrations: [
    researchPublications({
      sources: [
        { type: 'google-scholar',   profileId: 'GkxQpQoAAAAJ' },
        { type: 'semantic-scholar', authorId:  '2109234683'    },
        { type: 'open-alex',        authorId:  'A5012823189'   },
      ],
      cacheMaxAgeMs: 12 * 60 * 60 * 1000, // rebuild cache every 12 h
    }),
  ],
});
```

```astro
---
// src/pages/publications.astro
import BaseLayout from '../layouts/BaseLayout.astro';
import ResearchPublications from 'astro-research-publications/components';
---

<BaseLayout title="Publications" description="Academic publications by Gabriel Kanev">
  <ResearchPublications />
</BaseLayout>
```

---

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `scholarId` | `string` | - | Google Scholar profile ID. Shorthand for `sources: [{ type: 'google-scholar', profileId }]`. Ignored when `sources` is set. |
| `sources` | `SourceConfig[]` | - | One or more data sources (see above). Takes precedence over `scholarId`. |
| `cacheMaxAgeMs` | `number` | `86400000` (24 h) | How long cached data is considered fresh. |
| `cachePath` | `string` | `.astro/scholar-cache.json` | Path to the per-source cache file, relative to the project root. |
| `dedupeByDoi` | `boolean` | `false` | Merge matching DOIs even when titles differ; keep conflicting DOIs separate. |
| `overrides` | `PublicationOverride[]` | `[]` | Correct or hide selected publications after merging. |
| `openAccessLinks` | `boolean` | `false` | Show open-access and PDF links provided by an OpenAlex source. |
| `citationTools` | `boolean` | `false` | Enable per-publication BibTeX copying and DOI citation lookup. |
| `dataExports` | `{ json?: boolean; cslJson?: boolean }` | - | Generate static JSON and/or CSL-JSON endpoints. |

### Optional extras

```js
researchPublications({
  sources: [{ type: 'open-alex', authorId: 'A5012823189' }],
  dedupeByDoi: true,
  openAccessLinks: true,
  citationTools: true,
  dataExports: { json: true, cslJson: true },
  overrides: [
    { match: { doi: '10.1234/example' }, title: 'Corrected title', year: 2024 },
    { match: { id: 'publication-id' }, hide: true },
  ],
})
```

Overrides match by `id`, `doi`, or original `title`. You may combine match fields to narrow the selection. Prefer DOI matches when possible: enabling `dedupeByDoi` gives DOI records DOI-based stable IDs. A hidden publication is removed from the list and exports; source-provided citation statistics remain unchanged. Unmatched overrides produce a build warning. Corrections are applied after deduplication, and the per-source cache remains untouched.

Open-access links come from OpenAlex's best available location. They appear only when an OpenAlex source supplies a link and `openAccessLinks` is enabled. The citation tool requests a publisher-provided BibTeX record through DOI content negotiation for publications with a DOI and caches successful responses. Failed lookups fall back to the plugin's generic BibTeX entry; first builds may take longer when an author has many DOI records. Manually corrected publications use a locally generated citation so the corrections are preserved. The copy button needs JavaScript; the full BibTeX download does not.

`dataExports.json` writes `/research-publications.json` with the merged `ScholarData`. `dataExports.cslJson` writes `/research-publications.csl.json` as a CSL-JSON array. Both are generated at build time, include manual corrections, and are available only when enabled. You can also call `toCslJson(data.publications)` from the package API.

---

## CSS Theming

The component uses CSS custom properties for all colours:

```css
:root {
  --rp-text:           #1a1a1a;  /* Primary text */
  --rp-text-secondary: #888;     /* Muted text (venue, year, sync timestamp) */
  --rp-border:         #e5e5e5;  /* Dividers and card borders */
  --rp-accent:         #d8613c;  /* Links on hover, highlighted values */
  --rp-chart-bar:      #d8613c;  /* Citations-per-year bar fill */
}
```

All properties have sensible fallback values - only override what you need.

---

## Auto-sync

To keep publications up to date without manual deploys, create a deploy hook in your hosting provider and save its URL as the `DEPLOY_HOOK_URL` repository secret. Then add a scheduled GitHub Actions workflow that calls the hook. For example:

```yaml
# .github/workflows/scholar-sync.yml
name: Sync publications

on:
  schedule:
    - cron: '0 6 * * *'   # every day at 06:00 UTC
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger deploy
        env:
          DEPLOY_HOOK_URL: ${{ secrets.DEPLOY_HOOK_URL }}
        run: curl --fail --silent --show-error --request POST "$DEPLOY_HOOK_URL"
```

This repository includes a [ready-to-copy workflow](.github/workflows/scholar-sync.yml) with a weekly schedule. The deploy hook triggers a new build, where the integration refreshes its cached data.

---

## TypeScript

Add a reference to the virtual module declaration in `src/env.d.ts` for full type support:

```ts
/// <reference types="astro/client" />
/// <reference path="../node_modules/astro-research-publications/src/virtual.d.ts" />
```

After this, `import data from 'virtual:scholar-data'` is fully typed as `ScholarData`.

Import types directly:

```ts
import type { ScholarData, Publication, CitationStats, CoAuthor, SourceConfig } from 'astro-research-publications';
```

---

## Source comparison

| | Google Scholar | Semantic Scholar | OpenAlex | ORCID |
|---|---|---|---|---|
| API type | Scraping | REST API | REST API | REST API |
| Auth required | No | No (optional key for higher rate limits) | No | No |
| Citation counts | ✓ | ✓ | ✓ | - |
| h-index / i10 | ✓ | ✓ (h-index) | ✓ | - |
| Citations per year | ✓ | - | - | - |
| DOI | - | ✓ | ✓ | ✓ |
| Abstracts | - | ✓ | ✓ | - |
| Co-authors | ✓ | - | - | - |
| CAPTCHA risk | Yes | No | No | No |

For maximum data richness and reliability, combining Google Scholar with Semantic Scholar or OpenAlex is recommended.

---

## Releasing

Update the `version` in `package.json` and commit it before creating a release tag. The tag must match that version exactly (for example, `0.4.1` for version `0.4.1`). npm does not allow a published version to be reused. The publish workflow checks both the tag and the npm registry before running the build and publish steps.
