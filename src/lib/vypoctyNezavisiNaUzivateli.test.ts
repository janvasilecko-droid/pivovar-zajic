import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// Majitel 19. 10. 2026: „ověř, že když zadám data jako jiný uživatel i jako admin,
// správně se propíšou a všechny vzorce fungují správně.“
//
// Audit: (1) všechny obchodní tabulky (objednávky, stáčení, lahve, fasování, sklad,
// inventura, tanky…) čte každý přihlášený stejně — RLS SELECT je `true`; per-uživatel
// jsou jen profil, push odpočty a verze appky. (2) Zapisovat smí podle práv modulu a
// uzavřený měsíc smí upravit jen admin. (3) Tenhle test hlídá to třetí: výpočty ve
// `src/lib` nesmí záviset na tom, kdo je přihlášený.
const POVOLENO = new Set([
  'auth.tsx', 'config.ts', 'profileSync.ts', 'chybyHlaseni.ts', 'pushOdber.ts', 'odpoctyPush.ts',
  'appVersionTracker.ts', 'googlePrihlaseni.ts', 'prepinaniUctu.ts', 'uctyUlozene.ts', 'nahledUzivatele.ts', 'permissions.ts',
]);

describe('výpočty (src/lib) nezávisí na přihlášeném uživateli', () => {
  it('žádný výpočetní modul nečte profil, roli ani id uživatele', () => {
    const porusuje: string[] = [];
    for (const soubor of readdirSync('src/lib')) {
      if (!/\.tsx?$/.test(soubor) || /\.test\.tsx?$/.test(soubor) || POVOLENO.has(soubor)) continue;
      const zdroj = readFileSync(`src/lib/${soubor}`, 'utf8');
      if (/useAuth\s*\(|profile\??\.role|user\??\.id\b/.test(zdroj.replace(/\/\/.*$/gm, ''))) porusuje.push(soubor);
    }
    expect(porusuje, 'tyhle moduly v src/lib závisí na uživateli — výpočet by u admina a u běžného účtu mohl vyjít jinak').toEqual([]);
  });
});
