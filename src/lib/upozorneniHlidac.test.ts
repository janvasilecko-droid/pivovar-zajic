// 🔔 Pojistka na systémová upozornění.
//
// Na Androidu je `new Notification(...)` ZAKÁZANÉ — Chrome vyhodí
// „Illegal constructor. Use ServiceWorkerRegistration.showNotification()".
// Aplikace ho přesto volala na sedmi místech, takže na telefonu upozornění
// na novou objednávku nikdy nepřišlo a místo něj padala chyba doprostřed
// realtime posluchače (8. 9. 2026 čtyřikrát za dopoledne). Na počítači
// `new Notification` funguje, proto si toho půl roku nikdo nevšiml.
//
// Od té doby vede jediná cesta přes `ukazUpozorneni` v lib/notifications.ts,
// která sáhne na service worker. Test hlídá, že to tak zůstane.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Jediné místo, kde `new Notification` smí být — záloha pro počítač bez service workeru. */
const VYJIMKA = 'src/lib/notifications.ts';

function zdroje(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...zdroje(c)); continue; }
    if (/\.tsx?$/.test(j) && !/\.test\./.test(j)) out.push(c);
  }
  return out;
}

function nazev(p: string): string {
  return p.split(/[\\/]/).join('/').replace(/.*\/src\//, 'src/');
}

describe('systémová upozornění', () => {
  it('nikdo nevolá new Notification napřímo — jde se přes ukazUpozorneni', () => {
    const nalezy: string[] = [];
    for (const p of zdroje('src')) {
      const jmeno = nazev(p);
      if (jmeno === VYJIMKA) continue;
      readFileSync(p, 'utf8').split('\n').forEach((r, i) => {
        // Komentáře, které o tom jen mluví, nejsou volání.
        if (/^\s*(\/\/|\*)/.test(r)) return;
        if (/new Notification\s*\(/.test(r)) nalezy.push(`${jmeno}:${i + 1}`);
      });
    }
    expect(
      nalezy,
      `new Notification je na Androidu zakázané — použij ukazUpozorneni z lib/notifications.ts:\n${nalezy.join('\n')}`,
    ).toEqual([]);
  });

  it('i v notifications.ts je to jen jednou, jako záloha pro počítač', () => {
    const s = readFileSync(VYJIMKA, 'utf8');
    const volani = s.split('\n').filter((r) => !/^\s*(\/\/|\*)/.test(r) && /new Notification\s*\(/.test(r));
    expect(volani).toHaveLength(1);
  });
});
