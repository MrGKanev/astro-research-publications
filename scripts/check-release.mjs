import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.env.RELEASE_TAG;

if (!tag || tag !== manifest.version) {
  throw new Error(`Release tag ${JSON.stringify(tag)} must exactly match package.json version ${manifest.version}.`);
}

const published = JSON.parse(execFileSync('npm', ['view', manifest.name, 'versions', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
}));
const versions = Array.isArray(published) ? published : [published];
if (versions.includes(manifest.version)) {
  throw new Error(`${manifest.name}@${manifest.version} is already published on npm; choose a new version.`);
}

console.log(`Ready to publish ${manifest.name}@${manifest.version}.`);
