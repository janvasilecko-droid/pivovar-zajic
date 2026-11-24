// Hledání podle významu (R38): co se o stavu vektorů řekne správci. Jen vymyšlená čísla.
import { describe, expect, it } from 'vitest';
import { cekajiVektory, MIGRACE_VEKTORY, ODKAZ_ZPRACOVANI, popisVektoru, type VysledekVektoru } from './bibleVektory';

const stav = (pasazi: number, sVektorem: number, klic = true): VysledekVektoru => ({ stav: { pasazi, sVektorem, klic, model: 'text-embedding-3-large' } });

describe('popis stavu hledání podle významu', () => {
  it('načítání, chyba a chybějící migrace s přesným názvem migrace a cestou v appce', () => {
    expect(popisVektoru(null)).toEqual({ text: 'Načítám stav hledání podle významu…', ok: false });
    expect(popisVektoru({ chyba: 'Bible nejde načíst.', bezMigrace: false })).toEqual({ text: 'Stav hledání podle významu se nenačetl: Bible nejde načíst.', ok: false });
    const bez = popisVektoru({ chyba: 'x', bezMigrace: true });
    expect(bez.ok).toBe(false);
    expect(bez.text).toBe(`Hledání podle významu čeká na migraci ${MIGRACE_VEKTORY} (Systém → Databázové migrace → Databáze bible).`);
    expect(MIGRACE_VEKTORY).toBe('20261124000000_bible_vektory');
  });

  it('prázdná knihovna', () => {
    expect(popisVektoru(stav(0, 0))).toEqual({ text: 'Hledání podle významu: v knihovně zatím nejsou žádné zpracované pasáže.', ok: false });
  });

  it('bez klíče a bez vektorů: vypnuté, hledá se jen podle slov', () => {
    const p = popisVektoru(stav(40000, 0, false));
    expect(p.ok).toBe(false);
    expect(p.text).toBe('Hledání podle významu je vypnuté: chybí klíč OpenAI (řádek OPENAI_API_KEY v app_secrets hlavní appky). Hledá se jen podle slov.');
  });

  it('doplňování: počty s mezerou v tisících a procenta dolů; bez klíče se přidá poznámka', () => {
    expect(popisVektoru(stav(40000, 1200))).toEqual({ text: 'Vektory se doplňují: 1 200 z 40 000 pasáží (3 %).', ok: false });
    expect(popisVektoru(stav(3, 2)).text).toBe('Vektory se doplňují: 2 z 3 pasáží (66 %).');
    expect(popisVektoru(stav(40000, 39999)).text).toContain('(99 %)');
    expect(popisVektoru(stav(1234567, 1000, false)).text).toBe(
      'Vektory se doplňují: 1 000 z 1 234 567 pasáží (0 %). Server zatím nemá klíč OpenAI pro vektor dotazu (řádek OPENAI_API_KEY v app_secrets hlavní appky).');
  });

  it('hotovo: zapnuté jen s klíčem; bez klíče pro dotazy se hledá jen podle slov', () => {
    expect(popisVektoru(stav(40000, 40000))).toEqual({ text: 'Hledání podle významu je zapnuté: všech 40 000 pasáží má vektor.', ok: true });
    expect(popisVektoru(stav(500, 500))).toEqual({ text: 'Hledání podle významu je zapnuté: všech 500 pasáží má vektor.', ok: true });
    const bezKlice = popisVektoru(stav(500, 500, false));
    expect(bezKlice.ok).toBe(false);
    expect(bezKlice.text).toBe('Všech 500 pasáží má vektor, ale server nemá klíč OpenAI pro vektor dotazu (řádek OPENAI_API_KEY v app_secrets hlavní appky) — hledá se jen podle slov.');
  });

  it('ruční spuštění zpracování se nabízí jen, když nějaké pasáže vektor nemají', () => {
    expect(cekajiVektory(stav(10, 4))).toBe(true);
    expect(cekajiVektory(stav(10, 10))).toBe(false);
    expect(cekajiVektory(stav(0, 0))).toBe(false);
    expect(cekajiVektory(null)).toBe(false);
    expect(cekajiVektory({ chyba: 'x', bezMigrace: true })).toBe(false);
    expect(ODKAZ_ZPRACOVANI).toBe('https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml');
  });
});
