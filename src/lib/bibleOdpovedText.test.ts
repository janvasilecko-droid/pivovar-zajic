import { describe, expect, it } from 'vitest';
import type { ZdrojOdpovedi } from './bibleChatApi';
import { odkazNaStranuKnihy, textOdpovedi } from './bibleOdpovedText';

const ZAKLAD = 'https://zajic-pivovar.pages.dev/';
const KNIHA = 'eeeeeeee-0000-4000-8000-000000000001';
const zdroj = (n: number, navic: Partial<ZdrojOdpovedi> = {}): ZdrojOdpovedi => ({
  n, dokumentId: KNIHA, pdfIndex: 12, nazev: 'Technologie piva', tistena: '118', kapitola: null, zdroj: 'original', url: null, citat: 'Věta z knihy.', ...navic,
});

describe('text odpovědi ke zkopírování a sdílení', () => {
  it('otázka, odpověď bez značek Markdownu, zdroje seřazené podle čísla a podpis', () => {
    const t = textOdpovedi({
      text: '## Krátká odpověď\n\n**Pěnu** kazí tuky [1].\n\n\n- Zkontroluj sklo [2].',
      citace: [
        zdroj(2, { dokumentId: null, pdfIndex: null, nazev: 'Pivní fórum', zdroj: 'web', url: 'https://example.com/pena' }),
        zdroj(1, { kapitola: 'Pěna' }),
      ],
    }, '  Proč málo pění?  ', ZAKLAD);
    expect(t).toBe([
      'Otázka: Proč málo pění?',
      'Krátká odpověď\n\nPěnu kazí tuky [1].\n\n- Zkontroluj sklo [2].',
      `Zdroje:\n[1] Technologie piva, s. 118 · Pěna — ${ZAKLAD}?page=bible&sub=kniha:${KNIHA}:12\n`
        + '[2] Pivní fórum (web, neověřený zdroj) — https://example.com/pena',
      '— AI sládek, Pivovar Zajíc',
    ].join('\n\n'));
  });

  it('citovaná věta z knihy do textu nejde (jen název, strana a odkaz); překlad je označený; bez tištěné strany list', () => {
    const t = textOdpovedi({ text: 'Odpověď [1].', citace: [zdroj(1, { tistena: null, zdroj: 'preklad' })] }, null, ZAKLAD);
    expect(t).not.toContain('Věta z knihy');
    expect(t).toContain(`[1] Technologie piva, list 12 (český překlad) — ${ZAKLAD}?page=bible&sub=kniha:${KNIHA}:12`);
    expect(t.startsWith('Odpověď [1].')).toBe(true);
  });

  it('bez zdrojů a bez otázky: jen odpověď a podpis', () => {
    expect(textOdpovedi({ text: 'Jen text.', citace: [] }, '', ZAKLAD)).toBe('Jen text.\n\n— AI sládek, Pivovar Zajíc');
  });

  it('odkaz na stránku knihy vede do čtečky appky', () => {
    expect(odkazNaStranuKnihy(KNIHA, 7, ZAKLAD)).toBe(`${ZAKLAD}?page=bible&sub=kniha:${KNIHA}:7`);
  });
});
