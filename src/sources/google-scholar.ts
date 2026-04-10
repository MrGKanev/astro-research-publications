import * as cheerio from 'cheerio';
import type { Publication, CoAuthor, CitationStats, SourceResult } from '../types.js';
import { generateId } from '../merger.js';

const BASE_URL = 'https://scholar.google.com';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} - ${url}`);
  return res.text();
}

function parsePublications($: cheerio.CheerioAPI): Publication[] {
  const publications: Publication[] = [];
  $('#gsc_a_b .gsc_a_tr').each((_, row) => {
    const $row = $(row);
    const titleEl = $row.find('.gsc_a_at');
    const title = titleEl.text().trim();
    if (!title) return;

    const relHref = titleEl.attr('href') ?? '';
    const scholarUrl = relHref ? `${BASE_URL}${relHref}` : '';

    const grayEls = $row.find('.gs_gray');
    const authorsRaw = $(grayEls[0]).text().trim();
    const authors = authorsRaw.split(',').map((a) => a.trim()).filter(Boolean);
    const venue = $(grayEls[1]).text().trim();

    const yearText = $row.find('.gsc_a_y span').text().trim();
    const year = yearText ? parseInt(yearText, 10) : null;

    const citEl = $row.find('.gsc_a_c a');
    const citText = citEl.text().trim();
    const citations = citText && citText !== '*' ? parseInt(citText, 10) : 0;
    const citHref = citEl.attr('href');
    const citationsUrl = citHref ? `${BASE_URL}${citHref}` : null;

    publications.push({ id: generateId(title), title, authors, venue, year, citations, scholarUrl, citationsUrl, sources: ['google-scholar'] });
  });
  return publications;
}

function parseStats($: cheerio.CheerioAPI): CitationStats {
  const sinceHeader = $('#gsc_rsb_st thead th').eq(2).text().trim();
  const sinceMatch = sinceHeader.match(/\d{4}/);
  const sinceYear = sinceMatch ? parseInt(sinceMatch[0], 10) : new Date().getFullYear() - 5;

  const rows = $('#gsc_rsb_st tbody tr');
  function val(rowIdx: number, colIdx: number): number {
    return parseInt($(rows[rowIdx]).find('td').eq(colIdx).text().trim(), 10) || 0;
  }

  return {
    totalCitations: val(0, 1),
    totalCitationsSince: val(0, 2),
    hIndex: val(1, 1),
    hIndexSince: val(1, 2),
    i10Index: val(2, 1),
    i10IndexSince: val(2, 2),
    sinceYear,
  };
}

function parseCitationsByYear($: cheerio.CheerioAPI): Record<string, number> {
  const result: Record<string, number> = {};
  const years: string[] = [];
  $('.gsc_g_t').each((_, el) => { years.push($(el).text().trim()); });
  const counts: number[] = [];
  $('.gsc_g_a').each((_, el) => {
    const countText = $(el).find('.gsc_g_al').text().trim();
    counts.push(parseInt(countText, 10) || 0);
  });
  years.forEach((year, i) => {
    if (year && counts[i] !== undefined) result[year] = counts[i];
  });
  return result;
}

function parseCoAuthors($: cheerio.CheerioAPI): CoAuthor[] {
  const coAuthors: CoAuthor[] = [];
  $('.gsc_rsb_a_desc').each((_, el) => {
    const $el = $(el);
    const anchor = $el.find('a').first();
    const name = anchor.text().trim();
    if (!name) return;

    const href = anchor.attr('href') ?? '';
    const scholarUrl = href.startsWith('http') ? href : href ? `${BASE_URL}${href}` : '';

    const rawAffiliation = $el.find('.gsc_rsb_a_ext').text().trim();
    const affiliation = rawAffiliation
      ? rawAffiliation.replace(/\s*Verified email at\s+\S+/i, '').trim() || null
      : null;

    coAuthors.push({ name, scholarUrl, affiliation });
  });
  return coAuthors;
}

export async function fetchGoogleScholar(profileId: string): Promise<SourceResult> {
  const url = `${BASE_URL}/citations?user=${profileId}&hl=en&pagesize=100&sortby=pubdate`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  if ($('#gs_captcha_f').length || html.includes('detected unusual traffic')) {
    throw new Error('Google Scholar returned a CAPTCHA / bot-detection page.');
  }

  const profileName = $('#gsc_prf_in').text().trim() || profileId;
  let publications = parsePublications($);

  const hasMore = $('#gsc_bpf_more').length > 0 && !$('#gsc_bpf_more').prop('disabled');
  if (hasMore) {
    const BATCH = 5;
    let cstart = 100;
    let keepFetching = true;
    while (keepFetching) {
      const offsets = Array.from({ length: BATCH }, (_, i) => cstart + i * 100);
      const pages = await Promise.all(
        offsets.map(async (offset) => {
          const h = await fetchPage(`${BASE_URL}/citations?user=${profileId}&hl=en&pagesize=100&sortby=pubdate&cstart=${offset}`);
          const $p = cheerio.load(h);
          return { pubs: parsePublications($p), hasMore: $p('#gsc_bpf_more').length > 0 && !$p('#gsc_bpf_more').prop('disabled') };
        }),
      );
      let lastNonEmpty = -1;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].pubs.length > 0) {
          publications = publications.concat(pages[i].pubs);
          lastNonEmpty = i;
        }
      }
      if (lastNonEmpty === -1 || !pages[lastNonEmpty].hasMore) {
        keepFetching = false;
      } else {
        cstart += BATCH * 100;
      }
    }
  }

  return {
    sourceName: 'google-scholar',
    profileName,
    publications,
    stats: parseStats($),
    citationsByYear: parseCitationsByYear($),
    coAuthors: parseCoAuthors($),
  };
}
