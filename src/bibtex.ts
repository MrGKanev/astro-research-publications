import type { Publication } from './types.js';

function escapeValue(value: string): string {
  return value.replace(/[\\{}]/g, (character) => character === '\\' ? '\\textbackslash{}' : `\\${character}`)
    .replace(/[\r\n]+/g, ' ').trim();
}

/** Export publications as stable, generic BibTeX entries. */
export function toBibTeX(publications: Publication[]): string {
  return publications.map((publication) => {
    const fields: [string, string | number | null | undefined][] = [
      ['title', publication.title],
      ['author', publication.authors.join(' and ')],
      ['year', publication.year],
      ['howpublished', publication.venue],
      ['doi', publication.doi],
      ['url', publication.doi ? `https://doi.org/${publication.doi}` : publication.scholarUrl],
    ];
    const lines = fields
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([name, value]) => `  ${name} = {${escapeValue(String(value))}}`);
    return `@misc{rp-${publication.id},\n${lines.join(',\n')}\n}`;
  }).join('\n\n') + (publications.length ? '\n' : '');
}
