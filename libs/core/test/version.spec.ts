import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultUserAgent,
  drawnineVersion,
  findPackageVersion,
  REPOSITORY_URL,
} from '../src/version.js';

function fakeFs(files: Record<string, unknown>) {
  return (path: string): string => {
    if (!(path in files)) throw new Error(`ENOENT: ${path}`);
    const content = files[path];
    return typeof content === 'string' ? content : JSON.stringify(content);
  };
}

describe('findPackageVersion', () => {
  const root = join('/', 'pkg');
  const deep = join(root, 'dist', 'apps', 'cli', 'libs', 'core', 'src');

  it('walks up to the drawnine package.json', () => {
    const readFile = fakeFs({
      [join(root, 'package.json')]: { name: 'drawnine', version: '1.2.3' },
    });
    expect(findPackageVersion(deep, readFile)).toBe('1.2.3');
  });

  it('skips package.json files of other packages and invalid JSON', () => {
    const readFile = fakeFs({
      [join(deep, 'package.json')]: { name: 'other', version: '9.9.9' },
      [join(root, 'dist', 'package.json')]: '{ not json',
      [join(root, 'package.json')]: { name: 'drawnine', version: '0.1.0' },
    });
    expect(findPackageVersion(deep, readFile)).toBe('0.1.0');
  });

  it('falls back to 0.0.0 when nothing is found', () => {
    expect(findPackageVersion(deep, fakeFs({}))).toBe('0.0.0');
  });
});

describe('drawnineVersion', () => {
  it('reads the repository package.json', () => {
    expect(drawnineVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(drawnineVersion()).not.toBe('0.0.0');
  });
});

describe('defaultUserAgent', () => {
  it('includes the version and the repository URL', () => {
    expect(defaultUserAgent('0.1.0')).toBe(
      `DrawNine/0.1.0 (+${REPOSITORY_URL})`,
    );
  });
});
