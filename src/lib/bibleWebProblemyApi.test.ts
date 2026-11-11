import { describe, it, expect, vi, beforeEach } from 'vitest';

type Volani = { funkce: string; telo: Record<string, unknown> };
const volani: Volani[] = [];
let odpoved: unknown = null;

vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (funkce: string, telo: Record<string, unknown>) => {
    volani.push({ funkce, telo });
    return odpoved;
  }),
}));

import { chybaWebZdroje, nactiWebZdroje, overWebZdroj, smazWebZdroj, ulozWebZdroj } from './bibleWebApi';
import { chybaZjisteni, nactiProblemy, nastavStavZjisteni, ulozProblem, zapisZjisteni } from './bibleProblemyApi';

const W = 'aaaaaaaa-1111-2222-3333-444444444444';
const P = 'bbbbbbbb-1111-2222-3333-444444444444';
beforeEach(() => { volani.length = 0; });

describe('rešerše z internetu přes bible-api', () => {
  it('načte zdroje sdíleným parserem; stará funkce se řekne srozumitelně', async () => {
    odpoved = { ok: true, data: { zdroje: [{ id: W, url: 'https://example.org', titulek: 'T', shrnuti: 'S', zjisteno: '2026-11-11', duvera: 3, stav: 'overeno' }, { id: 'x', url: 'ftp://x' }], migrace: true } };
    const r = await nactiWebZdroje();
    expect(volani[0].telo).toEqual({ akce: 'web_zdroje' });
    expect(r.stav === 'ok' && r.zdroje.map((z) => z.id)).toEqual([W]);
    odpoved = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiWebZdroje()).toEqual({ stav: 'nenasazeno', zprava: 'Rešerše z internetu se právě nasazuje — zkus to za pár minut.' });
  });

  it('kontrola formuláře a oříznuté odeslání; ověření a smazání', async () => {
    const z = { url: ' https://example.org/a ', titulek: ' T ', vydavatel: '', datumPublikace: '', shrnuti: ' S ', oblasti: ['F'], duvera: 3 };
    expect(chybaWebZdroje({ ...z, url: 'example.org' })).toMatch(/http/);
    expect(chybaWebZdroje({ ...z, shrnuti: ' ' })).toMatch(/shrnutí/);
    expect(chybaWebZdroje(z)).toBeNull();
    odpoved = { ok: true, data: { id: W, novy: true, stav: 'neovereno' } };
    expect(await ulozWebZdroj(null, z)).toEqual({ stav: 'ok', data: { novy: true, stav: 'neovereno' } });
    expect(volani[0].telo).toEqual({ akce: 'web_zdroj_ulozit', zdroj: { url: 'https://example.org/a', titulek: 'T', shrnuti: 'S', oblasti: ['F'], duvera: 3 } });
    odpoved = { ok: true, data: { ok: true } };
    await overWebZdroj(W, 'overeno', '  ');
    expect(volani[1].telo).toEqual({ akce: 'web_zdroj_overit', id: W, stav: 'overeno' });
    await smazWebZdroj(W);
    expect(volani[2].telo).toEqual({ akce: 'web_zdroj_smazat', id: W });
  });
});

describe('analýza problémů přes bible-api', () => {
  it('načte problémy; uloží problém a zjištění; zdroj u faktu povinný', async () => {
    odpoved = { ok: true, data: { problemy: [{ id: P, nazev: 'X', stav: 'otevreny', varky: [], zjisteni: [] }], migrace: true } };
    const r = await nactiProblemy();
    expect(r.stav === 'ok' && r.problemy[0].id).toBe(P);
    odpoved = { ok: true, data: { id: P } };
    await ulozProblem(null, { nazev: ' Výtěžek ', popis: '', pivo: ' Ležák ', varky: [], oblasti: ['T'], stav: 'otevreny', reseni: '' });
    expect(volani[1].telo).toEqual({ akce: 'problem_ulozit', problem: { nazev: 'Výtěžek', pivo: 'Ležák', varky: [], oblasti: ['T'], stav: 'otevreny' } });
    expect(chybaZjisteni({ typ: 'fakt', text: 'X', zdroj: ' ' })).toBe('Doložený fakt potřebuje zdroj (kniha a strana, várka, výpočet…).');
    expect(chybaZjisteni({ typ: 'hypoteza', text: 'X', zdroj: '' })).toBeNull();
    await zapisZjisteni(P, { typ: 'hypoteza', text: ' Hrubý šrot ', zdroj: '' });
    expect(volani[2].telo).toEqual({ akce: 'zjisteni_ulozit', zjisteni: { problem_id: P, typ: 'hypoteza', text: 'Hrubý šrot' } });
    odpoved = { ok: false, chyba: { kod: 'zakazano', zprava: 'Stav zjištění smí měnit přispěvatel nebo správce.', status: 403 } };
    expect(await nastavStavZjisteni('z1', 'potvrzeno')).toEqual({ stav: 'chyba', zprava: 'Stav zjištění smí měnit přispěvatel nebo správce.' });
  });
});
