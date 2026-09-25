import data from 'virtual:scholar-data';

export const prerender = true;

export function GET(): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
