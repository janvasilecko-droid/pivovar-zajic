import { describe, it, expect, vi } from 'vitest';
import { cteniTabulky, type VstupCteniTabulky } from './tabulka-cteni';
import { najdiOkno } from './tabulka-staceni';
import { VISION_TABULKA_PUVODNI, VISION_TABULKA_ZVETSENA } from './tabulka-vision.fixture';

const PIVA = [
  { id: 'des', name: '10° Desítka', degree: '10°' },
  { id: 's11', name: '11° Světlá', degree: '11°' },
  { id: 's12', name: '12° Světlá', degree: '12°' },
  { id: 'jan', name: 'Jantar', degree: null },
];

// Řádky 555–558 tak, jak je přečte AI z výřezu.
const AI_555_558 = JSON.stringify({
  radky: [
    { radek: 555, datum: '2026-10-13', pivo: '12 Světlá', sudy: { 50: 1 }, lahve: { 1.5: 11, 0.5: 20, 0.33: 60 } },
    { radek: 556, datum: null, pivo: '11° sv.ležák', sudy: { 30: 1 }, lahve: { 1: 27 } },
    { radek: 557, datum: null, pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1.5: 25, 0.5: 20 } },
    { radek: 558, datum: null, pivo: null, sudy: { 50: 2 }, lahve: { 1: 72, 0.5: 40 } },
  ],
});

function vstup(p: Partial<VstupCteniTabulky> = {}): VstupCteniTabulky {
  return {
    rezim: 'tabulka', piva: PIVA, odData: null, vyrez: true, datumOkna: null,
    vision: async () => VISION_TABULKA_ZVETSENA, ai: async () => AI_555_558, ...p,
  };
}

describe('krok 1: přepis fotky po řádcích (okno)', () => {
  it('Vision vrátí řádky s daty a polohou; z nich appka spočítá výřez od 10. 10. — 4 řádky, datum 13. 10.', async () => {
    const o = await cteniTabulky(vstup({ rezim: 'okno', vision: async () => VISION_TABULKA_PUVODNI }));
    expect(o.status).toBe(200);
    const prepis = (o.telo as any).tabulka.prepis;
    expect(prepis).toMatchObject({ sirka: 699, vyska: 859, maRadkovaCisla: true });
    expect(prepis.radky.filter((r: any) => r.datum).map((r: any) => r.cislo)).toEqual([540, 542, 546, 548, 552, 555]);
    const okno = najdiOkno(prepis, '2026-10-10');
    expect(okno).toMatchObject({ duvod: null, radku: 4, datumOkna: '2026-10-13' });
    expect(okno.okno!.y0).toBeGreaterThan(0.38);
    expect(okno.okno!.y1).toBeLessThan(0.49);
  });

  it('přepis projde JSONem beze změny — výřez vyjde z kopie stejně', async () => {
    const o = await cteniTabulky(vstup({ rezim: 'okno', vision: async () => VISION_TABULKA_PUVODNI }));
    const kopie = JSON.parse(JSON.stringify((o.telo as any).tabulka.prepis));
    expect(najdiOkno(kopie, '2026-10-10')).toEqual(najdiOkno((o.telo as any).tabulka.prepis, '2026-10-10'));
  });

  it('bez Vision (nebo když selže) je přepis null, žádná chyba', async () => {
    const bez = await cteniTabulky(vstup({ rezim: 'okno', vision: null }));
    expect((bez.telo as any).tabulka).toEqual({ prepis: null });
    const selhalo = await cteniTabulky(vstup({ rezim: 'okno', vision: async () => null }));
    expect((selhalo.telo as any).tabulka).toEqual({ prepis: null });
  });

  it('AI se v kroku 1 vůbec nevolá', async () => {
    const ai = vi.fn(async () => '');
    await cteniTabulky(vstup({ rezim: 'okno', vision: async () => VISION_TABULKA_PUVODNI, ai }));
    expect(ai).not.toHaveBeenCalled();
  });
});

describe('krok 2: přečtení buněk (tabulka)', () => {
  it('čtyři řádky z 13. 10. — sloupce, datum zděděné pro řádky bez data, pivo z katalogu', async () => {
    const o = await cteniTabulky(vstup({ odData: '2026-10-10', datumOkna: '2026-10-13' }));
    expect(o.status).toBe(200);
    const t = (o.telo as any).tabulka;
    expect(t.ocr).toBe(true);
    expect(t.dny).toEqual([{ datum: '2026-10-13', radku: 4 }]);
    expect(t.radky.map((r: any) => [r.cislo, r.datum, r.pivoId])).toEqual([
      [555, '2026-10-13', 's12'], [556, '2026-10-13', 's11'], [557, '2026-10-13', 'jan'], [558, '2026-10-13', null],
    ]);
    expect(t.radky[0].sudy).toEqual([{ objemL: 50, ks: 1 }]);
    expect(t.radky[0].lahve).toEqual([{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }]);
    expect(t.radky.flatMap((r: any) => r.varovani)).toEqual([]);
  });

  it('pokyn pro AI: výřez bez omezení, celá fotka s „od data" s omezením', async () => {
    const ai = vi.fn(async () => AI_555_558);
    await cteniTabulky(vstup({ ai, vyrez: true, odData: '2026-10-10' }));
    await cteniTabulky(vstup({ ai, vyrez: false, odData: '2026-10-10' }));
    const [vyrez, cela] = ai.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(vyrez).toContain('VÝŘEZ ŘÁDKŮ');
    expect(vyrez).not.toContain('ČTI JEN');
    expect(cela).toContain('ČTI JEN řádky od prvního řádku, který má v buňce Datum datum 2026-10-10');
  });

  it('když výřez nevyšel a čte se celá fotka, filtr od data udělá kód', async () => {
    const cela = JSON.stringify({ radky: [
      { radek: 552, datum: '6.10.2026', pivo: '12 Světlá', sudy: { 50: 3 }, lahve: { 1.5: 24, 1: 93, 0.5: 20 } },
      ...JSON.parse(AI_555_558).radky,
    ] });
    const o = await cteniTabulky(vstup({ vyrez: false, odData: '2026-10-10', ai: async () => cela, vision: null }));
    const t = (o.telo as any).tabulka;
    expect(t.ocr).toBe(false);
    expect(t.radky.map((r: any) => r.cislo)).toEqual([555, 556, 557, 558]);
    expect(t.vynechano).toBe(1);
  });

  it('bez Vision se čte dál, jen bez kontroly proti přepisu', async () => {
    const o = await cteniTabulky(vstup({ vision: null }));
    expect((o.telo as any).tabulka).toMatchObject({ ocr: false });
    expect((o.telo as any).tabulka.radky).toHaveLength(4);
  });

  it('číslo, které přepis nevidí, jde do varování řádku', async () => {
    const ai = JSON.stringify({ radky: [{ radek: 557, datum: '2026-10-13', pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1.5: 24, 0.5: 20 } }] });
    const o = await cteniTabulky(vstup({ ai: async () => ai }));
    expect((o.telo as any).tabulka.radky[0].varovani.join(' ')).toContain('Číslo 24 přepis fotky u tohohle řádku nevidí');
  });

  it('AI nic nevrátila → 502 s vysvětlením', async () => {
    const o = await cteniTabulky(vstup({ ai: async () => '' }));
    expect(o.status).toBe(502);
    expect((o.telo as any).error).toContain('AI nepřečetla tabulku');
  });

  it('AI vrátila nesmysl → 502', async () => {
    const o = await cteniTabulky(vstup({ ai: async () => 'Nevím.' }));
    expect(o.status).toBe(502);
  });

  it('prázdné pole řádků není chyba — výsledek je prázdný', async () => {
    const o = await cteniTabulky(vstup({ ai: async () => '{"radky":[]}' }));
    expect(o.status).toBe(200);
    expect((o.telo as any).tabulka.radky).toEqual([]);
  });
});
