// AI sládek na předplatné: zadání pro aplikaci Claude a odkaz s předvyplněnou otázkou.
import { describe, expect, it } from 'vitest';
import { KONEKTOR, odkazNaClaude, zadaniProClaude } from './bibleClaude';

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

  it('odkaz otevře nový chat s předvyplněným (zakódovaným) zadáním', () => {
    const z = zadaniProClaude('Pěna & pH? 50 %');
    const odkaz = odkazNaClaude(z);
    expect(odkaz.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(new URL(odkaz).searchParams.get('q')).toBe(z);
  });
});
