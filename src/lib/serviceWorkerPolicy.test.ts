import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('service worker update policy', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const installHandler = source.slice(
    source.indexOf("self.addEventListener('install'"),
    source.indexOf("self.addEventListener('activate'"),
  );

  // Cache.addAll je atomicke: kdyz jediny fetch z PRECACHE selze (napr.
  // docasny sitovy zaskuk pri castych nasazenich), CELY install tise selze
  // a offline shell se nikdy neulozi. Zivym testem na produkci overeno, ze
  // se to skutecne delo. Zamerne proto misto atomickeho addAll cachujeme
  // kazdy soubor zvlast (viz ensurePrecached v sw.js) - selhani jednoho
  // souboru uz nezablokuje ulozeni ostatnich.
  it('cachuje precache soubory jednotlive (ne atomickym addAll) a neskippuje waiting', () => {
    expect(installHandler).toContain('ensurePrecached(c)');
    expect(installHandler).not.toContain('await c.addAll(PRECACHE)');
    expect(installHandler).not.toContain('skipWaiting');
  });

  it('limits cache cleanup to the application prefix', () => {
    expect(source).toContain('key.startsWith(CACHE_PREFIX)');
    expect(source).not.toContain('keys.filter((k) => k !== CACHE)');
  });
});
