// AI sládek na předplatné: zadání pro aplikaci Claude a odkaz s předvyplněnou otázkou.
import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { KONEKTOR, noveIdDotazu, odkazNaClaude, zadaniProClaude } from './bibleClaude';

describe('předání otázky do aplikace Claude', () => {
  it('zadání: pokyn použít konektor a otázka na konci', () => {
    const z = zadaniProClaude('  Proč mi pivo málo pění?  ');
    expect(z).toContain(`Použij konektor „${KONEKTOR}“`);
    expect(z).toContain('s odkazem na knihu a stranu');
    expect(z.endsWith('Otázka: Proč mi pivo málo pění?')).toBe(true);
  });

  it('analýza problému: jméno problému a zápis zjištění', () => {
    const z = zadaniProClaude('Najdi příčiny', { nazev: 'Málo pěny' });
    expect(z).toContain('analyzuj problém „Málo pěny“ z Analýzy problémů');
    expect(z).toContain('zjištění zapiš k problému');
  });

  it('dlouhá otázka se zkrátí pod limit claude.ai', () => {
    const z = zadaniProClaude('slovo '.repeat(5000));
    expect(z.length).toBeLessThanOrEqual(12_000);
    expect(z.endsWith('…')).toBe(true);
  });

  it('plnohodnotný chatbot (24. 11. 2026): rozhovor o problému a internet se sběrem zdrojů', () => {
    for (const z of [zadaniProClaude('Proč kvašení stojí?'), zadaniProClaude('Najdi příčiny', { nazev: 'Pomalé kvašení' })]) {
      // Rozhovor: příčiny od nejpravděpodobnější, jak je ověřit, doptat se na chybějící údaje.
      expect(z).toContain('příčiny řaď od nejpravděpodobnější');
      expect(z).toContain('jak ji ověřit nebo změřit');
      expect(z).toContain('na zásadní chybějící údaje se zeptej (nejvýš 3–4 otázky)');
      // Internet: jen když knihy nestačí, nález do bible jako neověřený a v odpovědi zvlášť od knih.
      expect(z).toContain('Když knihy téma nepokrývají, hledej i na internetu');
      expect(z).toContain('uloz_web_zdroj');
      expect(z).toContain('ukládají se jako neověřené');
      expect(z).toContain('uveď zvlášť od knih');
    }
  });

  it('otázka zůstává poslední a pokyny jsou před ní; bez dotazu z appky žádné dotaz_id', () => {
    const z = zadaniProClaude('Proč?');
    expect(z.indexOf('hledej i na internetu')).toBeLessThan(z.indexOf('Otázka: Proč?'));
    expect(z.endsWith('Otázka: Proč?')).toBe(true);
    expect(z).not.toContain('dotaz_id');
  });

  it('odkaz otevře nový chat s předvyplněným (zakódovaným) zadáním', () => {
    const z = zadaniProClaude('Pěna & pH? 50 %');
    const odkaz = odkazNaClaude(z);
    expect(odkaz.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(new URL(odkaz).searchParams.get('q')).toBe(z);
  });
});

describe('odpověď zpátky do appky (R33)', () => {
  const DOTAZ = 'dddddddd-0000-4000-8000-000000000001';
  afterEach(() => { vi.unstubAllGlobals(); });

  it('s dotazem: pokyn uložit odpověď nástrojem uloz_odpoved s dotaz_id, před otázkou', () => {
    const z = zadaniProClaude('Proč kvašení stojí?', null, { id: DOTAZ, navazuje: false });
    expect(z).toContain(`Otázka je z appky Pivovar Zajíc (dotaz_id: ${DOTAZ}). Hotovou odpověď celou ulož do appky nástrojem uloz_odpoved`);
    expect(z).not.toContain('dotaz_z_appky');
    expect(z).toContain('Když se tady zeptám dál, ulož i každou další otázku s odpovědí (uloz_odpoved s otazka a tímto dotaz_id).');
    expect(z.indexOf('dotaz_id')).toBeLessThan(z.indexOf('Otázka: Proč kvašení stojí?'));
    expect(z.endsWith('Otázka: Proč kvašení stojí?')).toBe(true);
    expect(zadaniProClaude('Proč?', null)).not.toContain('dotaz_id');
  });

  it('navazující otázka: Claude si načte předchozí konverzaci; dlouhá otázka dotaz_id neusekne', () => {
    expect(zadaniProClaude('A teplota?', null, { id: DOTAZ, navazuje: true })).toContain('nejdřív si ji načti nástrojem dotaz_z_appky');
    const dlouha = zadaniProClaude('slovo '.repeat(5000), { nazev: 'Pomalé kvašení' }, { id: DOTAZ, navazuje: false });
    expect(dlouha.length).toBeLessThanOrEqual(12_000);
    expect(dlouha).toContain(DOTAZ);
  });

  it('id dotazu je UUID v4 (i bez crypto.randomUUID) a pokaždé jiné', () => {
    const tvar = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(noveIdDotazu()).toMatch(tvar);
    expect(noveIdDotazu()).not.toBe(noveIdDotazu());
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => { b.fill(0xff); return b; } });
    expect(noveIdDotazu()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
