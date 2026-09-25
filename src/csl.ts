import type { Publication } from './types.js';

export interface CslItem {
  id: string;
  type: 'article';
  title: string;
  author?: { literal: string }[];
  issued?: { 'date-parts': [number[]] };
  'container-title'?: string;
  DOI?: string;
  URL?: string;
}

export function toCslJson(publications: Publication[]): CslItem[] {
  return publications.map((publication) => ({
    id: publication.id,
    type: 'article',
    title: publication.title,
    ...(publication.authors.length ? { author: publication.authors.map((literal) => ({ literal })) } : {}),
    ...(publication.year !== null ? { issued: { 'date-parts': [[publication.year]] as [number[]] } } : {}),
    ...(publication.venue ? { 'container-title': publication.venue } : {}),
    ...(publication.doi ? { DOI: publication.doi } : {}),
    ...(publication.doi || publication.scholarUrl ? { URL: publication.doi ? `https://doi.org/${publication.doi}` : publication.scholarUrl! } : {}),
  }));
}
