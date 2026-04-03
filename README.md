# astro-research-publications

An Astro integration that fetches your academic publications at build time from one or more sources and renders a fully-styled publications page — complete with citation stats, a citations-per-year bar chart, and co-author list.

Supports **Google Scholar**, **Semantic Scholar**, **OpenAlex**, and **ORCID**. Results from multiple sources are merged and deduplicated automatically.

Data is cached locally so repeat builds are fast, and a stale cache is used if any source is unreachable.

---

## Features

- Fetches publications, citation counts, h-index, i10-index, and co-authors
- **Multi-source** — combine Google Scholar, Semantic Scholar, OpenAlex, and/or ORCID; results are merged and deduplicated by title
- Renders a ready-to-use `<ResearchPublications />` component with a responsive two-column layout
- Local JSON cache with configurable max-age (default: 24 h) — no unnecessary requests on every build
- Falls back to stale cache if a live fetch fails, so your site never breaks
- CSS custom properties for easy theming — no stylesheet overrides required
- Full TypeScript types exported for `ScholarData`, `Publication`, `CitationStats`, `SourceConfig`, and more
- Works with Astro 4, 5 and 6

---

## Installation

```bash
npm install astro-research-publications
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

That's it — no client-side JavaScript required.

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

You can use any combination — a single source, two sources, or all four.

### Finding your IDs

| Source | Where to find your ID |
|---|---|
| **Google Scholar** | `user=` param in your Scholar profile URL |
| **Semantic Scholar** | Visit `semanticscholar.org/author/YOUR-NAME` — the number in the URL |
| **OpenAlex** | Visit `openalex.org/authors?search=YOUR-NAME` — the `A…` ID |
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

## Real-world example — gkanev.com

This is how the publications page at [gkanev.com/publications](https://gkanev.com/publications) uses the plugin.

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
| `scholarId` | `string` | — | Google Scholar profile ID. Shorthand for `sources: [{ type: 'google-scholar', profileId }]`. Ignored when `sources` is set. |
| `sources` | `SourceConfig[]` | — | One or more data sources (see above). Takes precedence over `scholarId`. |
| `cacheMaxAgeMs` | `number` | `86400000` (24 h) | How long cached data is considered fresh. |
| `cachePath` | `string` | `.scholar-cache.json` | Path to the cache file, relative to the project root. |

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

All properties have sensible fallback values — only override what you need.

---

## Auto-sync

To keep publications up to date without manual deploys, add a scheduled GitHub Actions workflow that triggers a rebuild on your hosting platform. A minimal daily workflow:

```yaml
# .github/workflows/sync-scholar.yml
name: Sync publications

on:
  schedule:
    - cron: '0 6 * * *'   # every day at 06:00 UTC
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      # Then trigger a deploy hook or commit the updated cache file
```

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
| Citation counts | ✓ | ✓ | ✓ | — |
| h-index / i10 | ✓ | ✓ (h-index) | ✓ | — |
| Citations per year | ✓ | — | — | — |
| DOI | — | ✓ | ✓ | ✓ |
| Abstracts | — | ✓ | ✓ | — |
| Co-authors | ✓ | — | — | — |
| CAPTCHA risk | Yes | No | No | No |

For maximum data richness and reliability, combining Google Scholar with Semantic Scholar or OpenAlex is recommended.
