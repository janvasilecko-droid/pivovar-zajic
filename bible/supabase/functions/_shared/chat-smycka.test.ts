// @vitest-environment node
// AI sládek: smyčka Claude ↔ nástroje s falešným Claudem (bez sítě). Jen
// vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
import { describe, expect, it, vi } from 'vitest';
import { CAS_NA_NASTROJE_MS, MAX_KOL } from './chat';
import { POZNAMKY, smyckaChatu, type RozpoznejChybu, type Udalost, type VolaniClauda, type ZpravaApi, type ZpravaClauda } from './chat-smycka';
import { ChybaNastroje, odkazNaList } from './mcp';
import type { VysledekChatu } from './nastroje';

const ID = '11111111-2222-3333-4444-555555555555';
const ZDROJ = odkazNaList(ID, 12);
const CENIK = { 'claude-opus-5-5': { vstup: 4, vystup: 20, cache_cteni: 0.2, cache_zapis: 5 } };
const usage = { input_tokens: 1000, output_tokens: 100 };
const CENA_KOLA = (1000 * 4 + 100 * 20) / 1e6;

class ChybaApi extends Error { constructor(public status: number | undefined, public typ: string) { super('api'); } }
class Preruseni extends Error {}
const rozpoznej: RozpoznejChybu = (e) => (e instanceof Preruseni ? { druh: 'preruseni' } : e instanceof ChybaApi ? { druh: 'api', status: e.status, typ: e.typ } : null);

const hledani = (id = 't1', dotaz = 'pěna'): ZpravaClauda => ({
  model: 'claude-opus-5-5', stop_reason: 'tool_use', usage,
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Podívám se do knih.' }, { type: 'tool_use', id, name: 'hledej_v_knihach', input: { dotaz } }],
});
const odpoved = (text = 'Pěnu drží bílkoviny', sCitaci = true): ZpravaClauda => ({
  model: 'claude-opus-5-5', stop_reason: 'end_turn', usage,
  content: [{ type: 'text', text, citations: sCitaci ? [{ type: 'search_result_location', source: ZDROJ, title: 'Kniha', cited_text: 'Bílkoviny drží pěnu.' }] : [] }, { type: 'text', text: '.' }],
});
const knihy: VysledekChatu = {
  bloky: [{ type: 'search_result', source: ZDROJ, title: 'Kniha — s. 10', content: [{ type: 'text', text: 'Bílkoviny drží pěnu.' }], citations: { enabled: true } }],
  zdroje: [{ source: ZDROJ, dokumentId: ID, list: 12, nazev: 'Pivovarství', tistena: '10', kapitola: null, zdroj: 'original' }],
};

function priprav(odpovedi: (ZpravaClauda | Error)[], o: { strop?: number; utraceno?: number; ted?: () => number; zavolej?: () => Promise<VysledekChatu> } = {}) {
  const volani: { zpravy: ZpravaApi[]; posledni: boolean }[] = [];
  const udalosti: Udalost[] = [];
  const volej: VolaniClauda = async (p, u) => {
    volani.push({ zpravy: JSON.parse(JSON.stringify(p.zpravy)), posledni: p.posledni });
    const dalsi = odpovedi.shift();
    if (!dalsi) throw new Error('žádná další odpověď');
    if (dalsi instanceof Error) throw dalsi;
    for (const b of dalsi.content as { type: string; text?: string }[]) if (b.type === 'text' && b.text) u.text(b.text);
    return dalsi;
  };
  const zavolej = vi.fn(o.zavolej ?? (async () => knihy));
  const beh = smyckaChatu({
    zpravy: [{ role: 'user', content: 'Proč pivo málo pění?' }], volej, zavolej, posli: (u) => udalosti.push(u), rozpoznej,
    model: 'claude-opus-5-5', cenik: CENIK, strop: o.strop ?? 20, utraceno: o.utraceno ?? 0, ted: o.ted,
  });
  return { beh, volani, udalosti, zavolej };
}

describe('smyčka chatbota', () => {
  it('kolo hledání a odpověď s citací [1]; úvod před hledáním je jen krok; cena za obě volání', async () => {
    const { beh, volani, udalosti, zavolej } = priprav([hledani(), odpoved()]);
    const v = await beh;
    expect(zavolej).toHaveBeenCalledWith('hledej_v_knihach', { dotaz: 'pěna' });
    expect(v.text).toBe('Pěnu drží bílkoviny[1].');
    expect(v.zdroje).toEqual([expect.objectContaining({ n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Pivovarství', tistena: '10', citat: 'Bílkoviny drží pěnu.' })]);
    expect(v.kroky).toEqual([{ nastroj: 'hledej_v_knihach', popis: 'Hledám v knihách: „pěna"' }]);
    expect(v).toMatchObject({ neuplna: false, duvod: null, dokoncena: true, volani: 2, modelOdpovedi: 'claude-opus-5-5' });
    expect(v.cena.cena).toBeCloseTo(2 * CENA_KOLA, 9);
    // Druhé volání nese odpověď asistenta (i s thinking) a výsledek nástroje jako search_result.
    expect(volani[1].zpravy[1]).toEqual({ role: 'assistant', content: hledani().content });
    expect(volani[1].zpravy[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: knihy.bloky }] });
    expect(volani.map((x) => x.posledni)).toEqual([false, false]);
    expect(udalosti.map((u) => u.typ)).toEqual(['premysli', 'text', 'mezikrok', 'krok', 'premysli', 'text', 'text']);
  });

  it('po časovém limitu už bez nástrojů (tool_choice none) a s výzvou k odpovědi', async () => {
    let cas = 0;
    // Hledání trvalo déle než limit na nástroje.
    const { beh, volani } = priprav([hledani(), odpoved()], { ted: () => cas, zavolej: async () => { cas = CAS_NA_NASTROJE_MS + 1; return knihy; } });
    const v = await beh;
    expect(volani.map((x) => x.posledni)).toEqual([false, true]);
    const vysledky = volani[1].zpravy[2].content as { type: string; text?: string }[];
    expect(vysledky[vysledky.length - 1]).toEqual({ type: 'text', text: '(Čas na hledání vypršel — teď už napiš celou odpověď z toho, co máš.)' });
    expect(v.neuplna).toBe(false);
  });

  it('nástroj chce i poslední kolo — dostane „čas vypršel" bez provedení', async () => {
    const odpovedi = [...Array.from({ length: MAX_KOL }, (_, i) => hledani(`t${i}`))];
    const { beh, zavolej, volani } = priprav(odpovedi);
    const v = await beh;
    expect(volani).toHaveLength(MAX_KOL);
    expect(volani[MAX_KOL - 1].posledni).toBe(true);
    expect(zavolej).toHaveBeenCalledTimes(MAX_KOL - 1);
    expect(v.duvod).toBe('kola');
    // Rozepsaný text posledního kola + poznámka (úvody předchozích kol jsou v krocích).
    expect(v.text).toBe(`Podívám se do knih.\n\n${POZNAMKY.kola}`);
  });

  it('strop: další kolo se nespustí, odpověď řekne proč', async () => {
    const { beh, volani } = priprav([hledani(), odpoved()], { strop: 1, utraceno: 1 - CENA_KOLA / 2 });
    const v = await beh;
    expect(volani).toHaveLength(1);
    expect(v).toMatchObject({ duvod: 'strop', neuplna: true, volani: 1 });
    expect(v.text).toBe(`Podívám se do knih.\n\n${POZNAMKY.strop}`);
  });

  it('chyba Claude API (kredit): česká hláška s odkazem, nic se nevymýšlí', async () => {
    const { beh } = priprav([new ChybaApi(402, 'billing_error')]);
    const v = await beh;
    expect(v).toMatchObject({ duvod: 'api', neuplna: true, dokoncena: false, volani: 0 });
    expect(v.chybaClauda?.kod).toBe('kredit');
    expect(v.text).toContain('https://platform.claude.com/settings/billing');
  });

  it('přerušení (čas platformy): co se stihlo, s poznámkou', async () => {
    const { beh } = priprav([hledani(), new Preruseni()]);
    const v = await beh;
    expect(v).toMatchObject({ duvod: 'cas', neuplna: true });
    expect(v.text).toBe(`Podívám se do knih.\n\n${POZNAMKY.cas}`);
  });

  it('cizí chyba projde ven (neschová se jako odpověď)', async () => {
    const { beh } = priprav([new TypeError('x')]);
    await expect(beh).rejects.toThrow(TypeError);
  });

  it('odmítnutí: jen poznámka, žádné citace z rozepsaného textu', async () => {
    const { beh } = priprav([{ ...odpoved('Začátek'), stop_reason: 'refusal' }]);
    const v = await beh;
    expect(v).toMatchObject({ duvod: 'odmitnuto', text: POZNAMKY.odmitnuto, zdroje: [] });
  });

  it('limit délky: odpověď s poznámkou o zkrácení', async () => {
    const { beh } = priprav([{ ...odpoved('Dlouhá', false), stop_reason: 'max_tokens' }]);
    const v = await beh;
    expect(v.text).toBe(`Dlouhá.\n\n${POZNAMKY.delka}`);
  });

  it('chyba nástroje: Claude ji dostane jako is_error a krok je označený', async () => {
    const { beh, volani } = priprav([hledani(), odpoved('Nic', false)], { zavolej: async () => { throw new ChybaNastroje('Kniha ještě není zpracovaná.'); } });
    const v = await beh;
    expect(v.kroky[0]).toEqual({ nastroj: 'hledej_v_knihach', popis: 'Hledám v knihách: „pěna"', chyba: true });
    expect(volani[1].zpravy[2].content).toEqual([{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Kniha ještě není zpracovaná.' }]);
  });

  it('pause_turn (webové hledání na straně API): pokračuje se stejnou zprávou', async () => {
    const pauza: ZpravaClauda = {
      model: 'claude-opus-5-5', stop_reason: 'pause_turn', usage: { ...usage, server_tool_use: { web_search_requests: 1 } },
      content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'pěna' } }],
    };
    const { beh, volani } = priprav([pauza, odpoved('Hotovo', false)]);
    const v = await beh;
    expect(volani[1].zpravy[1]).toEqual({ role: 'assistant', content: pauza.content });
    expect(v.cena.hledani).toBe(1);
    expect(v.text).toBe('Hotovo.');
  });

  it('záložní model: provedou se jen nástroje za hranicí a cena záložního pokusu se počítá zvlášť', async () => {
    const sPrepnutim: ZpravaClauda = {
      model: 'claude-opus-5', stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 100, iterations: [
        { type: 'message', input_tokens: 500, output_tokens: 0 },
        { type: 'fallback_message', model: 'claude-opus-5', input_tokens: 1000, output_tokens: 100 },
      ] },
      content: [{ type: 'tool_use', id: 'stary', name: 'seznam_knih', input: {} }, { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } },
        { type: 'tool_use', id: 'novy', name: 'hledej_v_knihach', input: { dotaz: 'pěna' } }],
    };
    const { beh, zavolej, volani } = priprav([sPrepnutim, odpoved()]);
    const v = await beh;
    expect(zavolej).toHaveBeenCalledTimes(1);
    expect((volani[1].zpravy[1].content as { type: string }[]).map((b) => b.type)).toEqual(['fallback', 'tool_use']);
    expect(v.cena.odhad).toBe(true);
    expect(v.modelOdpovedi).toBe('claude-opus-5-5');
  });
});
