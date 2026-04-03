# astro-research-publications

An Astro integration that fetches your Google Scholar profile at build time and renders a fully-styled publications page — complete with a citation stats sidebar, citations-per-year bar chart, and co-author list.

Data is cached locally so repeat builds are fast, and a stale cache is used automatically if Scholar is unreachable.

---

## Features

- Fetches publications, citation counts, h-index, i10-index, and co-authors directly from Google Scholar
- Renders a ready-to-use `<ResearchPublications />` component with a responsive two-column layout
- Local JSON cache with a configurable max-age (default: 24 hours) — no unnecessary requests on every build
- Falls back to stale cache if the live fetch fails, so your site never breaks
- CSS custom properties for easy theming — no stylesheet overrides required
- Full TypeScript types exported for `ScholarData`, `Publication`, `CitationStats`, and more
- Works with Astro 4 and 5

---

## Installation

```bash
npm install astro-research-publications
```

---

## Quick Start

**1. Add the integration to `astro.config.mjs`:**

```js
import { defineConfig } from 'astro/config';
import researchPublications from 'astro-research-publications';

export default defineConfig({
  integrations: [
    researchPublications({
      scholarId: 'YOUR_SCHOLAR_ID', // the `user=` param from your Scholar profile URL
    }),
  ],
});
```

Your Scholar ID is the value of the `user=` query parameter in your Google Scholar profile URL, e.g. `https://scholar.google.com/citations?user=XXXXXXXX`.

**2. Drop the component into any page:**

```astro
---
import ResearchPublications from 'astro-research-publications/components';
---

<ResearchPublications />
```

That's it. The component fetches data at build time and renders everything inline — no client-side JavaScript required.

---

## Configuration

All options are passed to the integration in `astro.config.mjs`.

| Option | Type | Default | Description |
|---|---|---|---|
| `scholarId` | `string` | — | **Required.** Your Google Scholar profile ID. |
| `cacheMaxAgeMs` | `number` | `86400000` (24 h) | How long cached data is considered fresh before a new fetch is attempted. |
| `cachePath` | `string` | `.scholar-cache.json` | Path to the cache file, relative to the project root. |

```js
researchPublications({
  scholarId: 'YOUR_SCHOLAR_ID',
  cacheMaxAgeMs: 12 * 60 * 60 * 1000, // 12 hours
  cachePath: '.cache/scholar.json',
})
```

---

## CSS Theming

The component uses CSS custom properties for all colours. Override them anywhere in your stylesheet to match your site's design:

```css
:root {
  --rp-text: #1a1a1a;             /* Primary text */
  --rp-text-secondary: #888;      /* Muted text (venue, year, sync timestamp) */
  --rp-border: #e5e5e5;           /* Dividers and card borders */
  --rp-accent: #d8613c;           /* Links on hover, highlighted values */
  --rp-chart-bar: #d8613c;        /* Citations-per-year bar fill */
}
```

All properties have sensible fallback values, so you only need to set the ones you want to change.

---

## Auto-sync

To keep publications up to date without manual deploys, add a scheduled GitHub Actions workflow that triggers a rebuild on your hosting platform (Netlify, Vercel, Cloudflare Pages, etc.) on a regular cadence — daily is usually enough. Because the integration writes a cache file to the repo, you can also commit the cache and only rebuild when it changes.

A minimal example that runs every day at 06:00 UTC:

```yaml
# .github/workflows/sync-scholar.yml
name: Sync Scholar data

on:
  schedule:
    - cron: '0 6 * * *'
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

The integration exposes data through the `virtual:scholar-data` module. To get full type support in `.astro` and `.ts` files, add a reference to the package's virtual module declaration in your project's `src/env.d.ts`:

```ts
/// <reference types="astro/client" />
/// <reference path="../node_modules/astro-research-publications/src/virtual.d.ts" />
```

After this, `import data from 'virtual:scholar-data'` will be fully typed as `ScholarData`.

You can also import the types directly from the package:

```ts
import type { ScholarData, Publication, CitationStats, CoAuthor } from 'astro-research-publications';
```
