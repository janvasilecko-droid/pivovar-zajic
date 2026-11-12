// @vitest-environment node
// AI sládek (etapa 5): čisté funkce chatbota. Jen vymyšlené krátké věty —
// žádný text skutečných knih (repo je veřejné).
import { describe, expect, it } from 'vitest';
import {
  CENA_HLEDANI_USD, cenaVolani, chybaApi, historieProApi, JEN_KONEKTOR, kontextDotazu, knihaZOdkazu, MAX_OTAZKA, nastrojeChatu, nastrojeKProvedeni,
  nazevKonverzace, obsahKOdeslani, popisKroku, pozadavekChatu, sectiCeny, SYSTEM_PROMPT, textSCitacemi, type ZdrojKnihy,
} from './chat';
import { NASTROJE, odkazNaList } from './mcp';
import { ChybaVstupu } from './vstupy';

const ID = '11111111-2222-3333-4444-555555555555';
const CENIK = {
  'claude-opus-5-5': { vstup: 4, vystup: 20, cache_cteni: 0.2, cache_zapis: 5 },
  'claude-haiku-5-5': { vstup: 0.1, vystup: 0.5 },
};

describe('vstup chatu', () => {
  it('otázka, konverzace, problém a web', () => {
    expect(pozadavekChatu({ otazka: '  Proč pivo málo pění? ', konverzace_id: ID.toUpperCase(), web: true }))
      .toEqual({ otazka: 'Proč pivo málo pění?', konverzaceId: ID, problemId: null, web: true });
    expect(pozadavekChatu({ otazka: 'pH rmutu', problem_id: ID, web: 'ano' })).toEqual({ otazka: 'pH rmutu', konverzaceId: null, problemId: ID, web: false });
  });
  it('krátká, dlouhá a vadné id se odmítnou česky', () => {
    expect(() => pozadavekChatu({ otazka: 'x' })).toThrow(ChybaVstupu);
    expect(() => pozadavekChatu({ otazka: 'x'.repeat(MAX_OTAZKA + 1) })).toThrow(/moc dlouhá/);
    expect(() => pozadavekChatu({ otazka: 'pěna', konverzace_id: '1; drop' })).toThrow(/konverzace/);
    expect(() => pozadavekChatu({ otazka: 'pěna', problem_id: 5 })).toThrow(/problému/);
  });
});

describe('cena volání podle ceníku', () => {
  it('vstup, výstup, cache a webové hledání', () => {
    const c = cenaVolani({
      input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 2000,
      server_tool_use: { web_search_requests: 2 },
    }, 'claude-opus-5-5', 'claude-opus-5-5', CENIK);
    expect(c.cena).toBeCloseTo((1000 * 4 + 500 * 20 + 10_000 * 0.2 + 2000 * 5) / 1e6 + 2 * CENA_HLEDANI_USD, 9);
    expect(c).toMatchObject({ vstup: 1000, vystup: 500, cacheCteni: 10_000, cacheZapis: 2000, hledani: 2, odhad: false });
  });
  it('bez ceny cache = 0,1× a 1,25× vstupu; prázdné usage = nula', () => {
    expect(cenaVolani({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }, 'claude-haiku-5-5', 'claude-haiku-5-5', CENIK).cena)
      .toBeCloseTo(0.1 * 0.1 + 0.1 * 1.25, 9);
    expect(cenaVolani(null, 'claude-opus-5-5', 'claude-opus-5-5', CENIK).cena).toBe(0);
  });
  it('záložní model: každý pokus zvlášť, model bez ceníku odhadem cenou Opus 5', () => {
    const c = cenaVolani({
      input_tokens: 100, output_tokens: 100,
      iterations: [
        { type: 'message', input_tokens: 1000, output_tokens: 0 },
        { type: 'fallback_message', model: 'claude-opus-5', input_tokens: 1000, output_tokens: 100 },
      ],
    }, 'claude-opus-5', 'claude-opus-5-5', CENIK);
    expect(c.cena).toBeCloseTo((1000 * 4) / 1e6 + (1000 * 5 + 100 * 25) / 1e6, 9);
    expect(c.odhad).toBe(true);
    expect(c.vstup).toBe(2000);
  });
  it('součet kol', () => {
    const a = cenaVolani({ input_tokens: 1e6, output_tokens: 0 }, 'claude-opus-5-5', 'claude-opus-5-5', CENIK);
    expect(sectiCeny(a, a)).toMatchObject({ cena: 8, vstup: 2e6, odhad: false });
  });
});

describe('nástroje chatbota', () => {
  it('jen čtení ve stejném pořadí jako konektor; zápis zjištění jen v analýze problému; web na přání', () => {
    const jmena = (t: ReturnType<typeof nastrojeChatu>) => t.map((x) => x.name);
    const zakladni = jmena(nastrojeChatu(NASTROJE, { zapis: false, web: false }));
    expect(zakladni).not.toContain('uloz_web_zdroj');
    expect(zakladni).not.toContain('zaloz_problem');
    expect(zakladni).not.toContain('zapis_zjisteni');
    for (const n of ['zapis_varku', 'dopln_varku', 'zapis_zkusenost']) expect(zakladni).not.toContain(n);
    expect(zakladni).toEqual(NASTROJE.map((n) => n.name).filter((n) => !JEN_KONEKTOR.has(n) && n !== 'zapis_zjisteni'));
    expect(zakladni).toContain('hledej_zkusenosti');
    expect(jmena(nastrojeChatu(NASTROJE, { zapis: true, web: false }))).toContain('zapis_zjisteni');
    const sWebem = nastrojeChatu(NASTROJE, { zapis: false, web: true });
    expect(sWebem[sWebem.length - 1]).toEqual({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
    const hledani = nastrojeChatu(NASTROJE, { zapis: false, web: false })[0] as { input_schema: { required: string[] } };
    expect(hledani.input_schema.required).toEqual(['dotaz']);
  });
  it('popis kroku bez textu knih, zkrácený', () => {
    expect(popisKroku('hledej_v_knihach', { dotaz: 'chmelovar  odpar' })).toBe('Hledám v knihách: „chmelovar odpar"');
    expect(popisKroku('precti_stranu', { kniha_id: ID, list: 12 })).toBe('Čtu stránky knihy (list 12)');
    expect(popisKroku('vypocet', { id: 'alkohol' })).toBe('Počítám: alkohol');
    expect(popisKroku('hledej_v_knihach', { dotaz: 'x'.repeat(200) }).length).toBeLessThan(110);
    expect(popisKroku('neznamy', {})).toBe('neznamy');
  });
});

describe('prompt', () => {
  it('pevná struktura odpovědi, citace jen z výsledků, nic nenašel', () => {
    for (const nadpis of ['## Krátká odpověď', '## Co říká literatura', '## Zkušenosti z praxe', '## Výpočet', '## Doporučení', '## Rozpory a co chybí']) {
      expect(SYSTEM_PROMPT).toContain(nadpis);
    }
    expect(SYSTEM_PROMPT).toContain('V knihovně jsem k tomu nic nenašel');
    expect(SYSTEM_PROMPT).toMatch(/Nepiš vlastní čísla citací/);
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/); // žádné datum — prompt cache
  });
  it('kontext: datum, kdo se ptá, web a analýza problému podle práva zápisu', () => {
    const s = kontextDotazu({ dnes: 'středa 11. 11. 2026', jmeno: 'Jan', zapis: true, problem: { id: ID, nazev: 'Málo pěny' }, web: false });
    expect(s).toContain('Dnes je středa 11. 11. 2026. Ptá se Jan.');
    expect(s).toContain('vypnuté');
    expect(s).toContain(`problem_id ${ID}`);
    expect(s).toContain('zapis_zjisteni');
    expect(kontextDotazu({ dnes: 'd', jmeno: null, zapis: false, problem: { id: ID, nazev: 'X' }, web: true })).toContain('nezapisuj');
  });
});

describe('historie konverzace', () => {
  it('posledních 12 zpráv, střídání rolí, začíná uživatelem, zdroje u odpovědi', () => {
    const zpravy = [
      { role: 'asistent', text: 'osiřelá odpověď' },
      ...Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'asistent' : 'uzivatel', text: `zpráva ${i}` })),
    ];
    const h = historieProApi(zpravy);
    expect(h[0].role).toBe('user');
    expect(h.length).toBeLessThanOrEqual(12);
    expect(h.every((z, i) => i === 0 || z.role !== h[i - 1].role)).toBe(true);
    const sCitaci = historieProApi([
      { role: 'uzivatel', text: 'Otázka' },
      { role: 'uzivatel', text: 'Doplnění' },
      { role: 'asistent', text: 'Odpověď [1].', citace: [{ n: 1, dokumentId: ID, pdfIndex: 7, nazev: 'Kniha', tistena: '5', kapitola: null, zdroj: 'original', url: null, citat: 'c' }] },
    ]);
    expect(sCitaci).toEqual([
      { role: 'user', content: 'Otázka\n\nDoplnění' },
      { role: 'assistant', content: `Odpověď [1].\n\nZdroje:\n[1] Kniha, s. 5 (kniha_id=${ID} list=7)` },
    ]);
  });
});

describe('citace v odpovědi', () => {
  const zdroj: ZdrojKnihy = { source: odkazNaList(ID, 12), dokumentId: ID, list: 12, nazev: 'Pivovarství', tistena: '10', kapitola: 'Rmut', zdroj: 'preklad' };
  const knihy = new Map([[zdroj.source, zdroj]]);
  it('číslo [n] za citovaným úsekem (před mezerou), stejná stránka stejné číslo, zdroje v pořadí', () => {
    const { text, zdroje } = textSCitacemi([
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '## Krátká odpověď\nEnzym pracuje při 62 °C', citations: [{ type: 'search_result_location', source: zdroj.source, title: 't', cited_text: 'Enzym  pracuje\npři 62 °C.', search_result_index: 0, start_block_index: 0, end_block_index: 0 }] },
      { type: 'text', text: ' a déle při nižší teplotě ', citations: [
        { type: 'search_result_location', source: zdroj.source, title: 't', cited_text: 'jiný úsek' },
        { type: 'web_search_result_location', url: 'https://example.org/clanek', title: 'Článek', cited_text: 'web' },
      ] },
      { type: 'text', text: 'a vlastní [3] číslo.' },
    ], knihy);
    expect(text).toBe('## Krátká odpověď\nEnzym pracuje při 62 °C[1] a déle při nižší teplotě[1][2] a vlastní (3) číslo.');
    expect(zdroje).toEqual([
      { n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Pivovarství', tistena: '10', kapitola: 'Rmut', zdroj: 'preklad', url: null, citat: 'Enzym pracuje při 62 °C.' },
      { n: 2, dokumentId: null, pdfIndex: null, nazev: 'Článek', tistena: null, kapitola: null, zdroj: 'web', url: 'https://example.org/clanek', citat: 'web' },
    ]);
  });
  it('neznámý zdroj z odkazu do čtečky; cizí adresa a nebezpečný odkaz se zahodí', () => {
    const jiny = '99999999-8888-7777-6666-555555555555';
    const { text, zdroje } = textSCitacemi([
      { type: 'text', text: 'A', citations: [{ type: 'search_result_location', source: odkazNaList(jiny, 3), title: 'Jiná kniha — s. 1', cited_text: 'x' }] },
      { type: 'text', text: 'B', citations: [{ type: 'search_result_location', source: 'https://jinde.cz', title: 'x', cited_text: 'x' }] },
      { type: 'text', text: 'C', citations: [{ type: 'web_search_result_location', url: 'javascript:alert(1)', title: 'x', cited_text: 'x' }] },
    ], new Map());
    expect(text).toBe('A[1]BC');
    expect(zdroje).toEqual([{ n: 1, dokumentId: jiny, pdfIndex: 3, nazev: 'Jiná kniha — s. 1', tistena: null, kapitola: null, zdroj: 'original', url: null, citat: 'x' }]);
  });
  it('odkaz do čtečky → kniha a list', () => {
    expect(knihaZOdkazu(odkazNaList(ID, 170))).toEqual({ dokumentId: ID, list: 170 });
    expect(knihaZOdkazu('https://zajic-pivovar.pages.dev/?page=bible')).toBeNull();
  });
});

describe('záložní model (server-side fallback)', () => {
  it('bez přepnutí se posílá vše a provedou se všechna volání nástrojů', () => {
    const obsah = [{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'tool_use', id: 't1' }, { type: 'tool_use', id: 't2' }];
    expect(obsahKOdeslani(obsah)).toEqual(obsah);
    expect(nastrojeKProvedeni(obsah).map((b) => (b as { id: string }).id)).toEqual(['t1', 't2']);
  });
  it('před posledním blokem fallback zmizí thinking, tool_use a nespárované hledání; text a spárované hledání zůstanou', () => {
    const obsah = [
      { type: 'thinking' }, { type: 'text', text: 'začátek' }, { type: 'tool_use', id: 'stary' },
      { type: 'server_tool_use', id: 's1' }, { type: 'web_search_tool_result', tool_use_id: 's1' }, { type: 'server_tool_use', id: 's2' },
      { type: 'neznamy_blok' },
      { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
      { type: 'thinking' }, { type: 'tool_use', id: 'novy' },
    ];
    expect(obsahKOdeslani(obsah).map((b) => b.type + ('id' in b ? `:${b.id}` : ''))).toEqual([
      'text', 'server_tool_use:s1', 'web_search_tool_result', 'fallback', 'thinking', 'tool_use:novy',
    ]);
    expect(nastrojeKProvedeni(obsah).map((b) => (b as { id: string }).id)).toEqual(['novy']);
  });
});

describe('chyby Claude API česky s odkazem', () => {
  it('klíč, kredit, limit, přetížení, spojení', () => {
    expect(chybaApi(401, 'authentication_error')).toMatchObject({ kod: 'klic_neplati' });
    expect(chybaApi(401, null).zprava).toContain('https://platform.claude.com/settings/keys');
    expect(chybaApi(402, 'billing_error')).toEqual({ kod: 'kredit', zprava: expect.stringContaining('https://platform.claude.com/settings/billing') });
    expect(chybaApi(429, 'rate_limit_error').kod).toBe('limit');
    expect(chybaApi(529, 'overloaded_error').kod).toBe('pretizeno');
    expect(chybaApi(503, null).kod).toBe('pretizeno');
    expect(chybaApi(undefined, null).kod).toBe('spojeni');
    expect(chybaApi(400, 'invalid_request_error').kod).toBe('chyba_api');
  });
});

describe('název konverzace', () => {
  it('začátek otázky, dlouhá se zkrátí po slovech', () => {
    expect(nazevKonverzace('  Proč   pivo málo pění? ')).toBe('Proč pivo málo pění?');
    const dlouha = nazevKonverzace('slovo '.repeat(40));
    expect(dlouha.length).toBeLessThanOrEqual(80);
    expect(dlouha.endsWith('slovo…')).toBe(true);
  });
});
