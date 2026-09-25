import data from 'virtual:scholar-data';
import { toCslJson } from '../csl.js';

export const prerender = true;

export function GET(): Response {
  return new Response(JSON.stringify(toCslJson(data.publications), null, 2), {
    headers: { 'Content-Type': 'application/vnd.citationstyles.csl+json; charset=utf-8' },
  });
}
