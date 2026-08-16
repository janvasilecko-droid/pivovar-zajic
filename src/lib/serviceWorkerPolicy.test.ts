import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('service worker update policy', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const installHandler = source.slice(
    source.indexOf("self.addEventListener('install'"),
    source.indexOf("self.addEventListener('activate'"),
  );

  it('does not skip waiting or swallow precache failures during install', () => {
    expect(installHandler).toContain('await c.addAll(PRECACHE);');
    expect(installHandler).not.toContain('skipWaiting');
    expect(installHandler).not.toMatch(/addAll\(PRECACHE\)\.catch/);
  });

  it('limits cache cleanup to the application prefix', () => {
    expect(source).toContain('key.startsWith(CACHE_PREFIX)');
    expect(source).not.toContain('keys.filter((k) => k !== CACHE)');
  });
});
