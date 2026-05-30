import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScholarData } from './types.js';

export function resolveCachePath(projectRoot: URL, relativePath: string): string {
  const root = fileURLToPath(projectRoot);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const resolved = resolve(root, relativePath);
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error('[astro-research-publications] cachePath must be inside the project root.');
  }
  return resolved;
}

export async function readCache(cachePath: string): Promise<ScholarData | null> {
  try {
    return JSON.parse(await readFile(cachePath, 'utf-8')) as ScholarData;
  } catch {
    return null;
  }
}

export async function writeCache(cachePath: string, data: ScholarData): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function isCacheFresh(data: ScholarData, maxAgeMs: number): boolean {
  try {
    return Date.now() - new Date(data.lastSynced).getTime() < maxAgeMs;
  } catch {
    return false;
  }
}
