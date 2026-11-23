import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = 'drawnine';
export const REPOSITORY_URL = 'https://github.com/inixio-dev/drawnine';
const UNKNOWN_VERSION = '0.0.0';

type ReadFile = (path: string) => string;

/**
 * Walks up from `startDir` looking for DrawNine's own package.json and returns
 * its version. Works from the sources, the compiled `dist/` and an npm install.
 */
export function findPackageVersion(
  startDir: string,
  readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): string {
  let dir = startDir;
  for (;;) {
    const version = versionAt(join(dir, 'package.json'), readFile);
    if (version !== undefined) return version;
    const parent = dirname(dir);
    if (parent === dir) return UNKNOWN_VERSION;
    dir = parent;
  }
}

function versionAt(path: string, readFile: ReadFile): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(path));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { name, version } = parsed as Record<string, unknown>;
  return name === PACKAGE_NAME && typeof version === 'string'
    ? version
    : undefined;
}

let cachedVersion: string | undefined;

/** DrawNine's version, read once from its package.json. */
export function drawnineVersion(): string {
  cachedVersion ??= findPackageVersion(dirname(fileURLToPath(import.meta.url)));
  return cachedVersion;
}

/** Descriptive User-Agent, as Scryfall asks for. */
export function defaultUserAgent(version: string = drawnineVersion()): string {
  return `DrawNine/${version} (+${REPOSITORY_URL})`;
}
