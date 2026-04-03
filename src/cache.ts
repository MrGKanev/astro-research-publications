import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScholarData } from './types.js';

export function resolveCachePath(projectRoot: URL, relativePath: string): string {
  return resolve(fileURLToPath(projectRoot), relativePath);
}

export function readCache(cachePath: string): ScholarData | null {
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as ScholarData;
  } catch {
    return null;
  }
}

export function writeCache(cachePath: string, data: ScholarData): void {
  writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function isCacheFresh(data: ScholarData, maxAgeMs: number): boolean {
  return Date.now() - new Date(data.lastSynced).getTime() < maxAgeMs;
}
