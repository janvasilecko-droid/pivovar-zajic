// @vitest-environment node
// AI sládek — klient appky: čtení odpovědi po řádcích, převod dat, chyby.
// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
import { beforeEach, describe, expect, it, vi } from 'vitest';

let odpovedApi: unknown = { ok: true, data: {} };
const volaniApi: Record<string, unknown>[] = [];
vi.mock('./bibleKlient', () => ({
  BIBLE_URL: 'https://cegrelgvkygcatupqwrx.supabase.co',
  chybaBible: (kod: string, zprava: string, status = 0) => ({ ok: false, chyba: { kod, zprava, status } }),
  tokenPrihlaseni: async () => ({ token: 'tok' }),
  volejBibli: async (_f: string, telo: Record<string, unknown>) => { volaniApi.push(telo); return odpovedApi; },
}));

import {
  nactiKonverzaci, nactiStavChatu, udalostZRadku, usdText, zdrojZDat, zeptejSe, type UdalostChatu,
} from './bibleChatApi';

const ID = '11111111-2222-3333-4444-555555555555';
const KID = '99999999-8888-7777-6666-555555555555';

function proud(kusy: string[], hlavicky: Record<string, string> = { 'Content-Type': 'application/x-ndjson; charset=utf-8' }, status = 200) {
  const enc = new TextEncoder();
  const telo = new ReadableStream<Uint8Array>({
    start(c) { for (const k of kusy) c.enqueue(enc.encode(k)); c.close(); },
  });
  return new Response(telo, { status, headers: hlavicky });
}

beforeEach(() => { volaniApi.length = 0; vi.unstubAllGlobals(); });

describe('události odpovědi', () => {
  it('rozpozná řádky, vadné a neznámé zahodí', () => {
    expect(udalostZRadku(JSON.stringify({ typ: 'start', konverzace_id: KID }))).toEqual({ typ: 'start', konverzaceId: KID });
    expect(udalostZRadku('{"typ":"krok","popis":"Hledám v knihách"}')).toEqual({ typ: 'krok', popis: 'Hledám v knihách' });
    expect(udalostZRadku('{"typ":"mezikrok"}')).toEqual({ typ: 'mezikrok' });
    expect(udalostZRadku('{"typ":"start","konverzace_id":"x"}')).toBeNull();
    expect(udalostZRadku('{"typ":"neco"}')).toBeNull();
    expect(udalostZRadku('nejson')).toBeNull();
    expect(udalostZRadku(JSON.stringify({ typ: 'chyba' }))).toEqual({ typ: 'chyba', kod: 'chyba', zprava: 'Něco se pokazilo. Zkus to znovu.', konverzaceId: null });
  });

  it('hotová odpověď: citace jen platné (kniha s id a listem, web jen http/https)', () => {
    const u = udalostZRadku(JSON.stringify({
      typ: 'hotovo', konverzace_id: KID, zprava_id: ID, text: 'Odpověď[1][2]', neuplna: false, model: 'claude-opus-5-5',
      cena_usd: '0.12', utraceno_usd: 1.5, strop_usd: 20,
      kroky: [{ nastroj: 'hledej_v_knihach', popis: 'Hledám', chyba: true }, { nic: 1 }],
      citace: [
        { n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Kniha', tistena: '10', zdroj: 'preklad', citat: 'c' },
        { n: 2, zdroj: 'web', url: 'https://example.org', nazev: 'Web' },
        { n: 3, zdroj: 'web', url: 'javascript:alert(1)' },
        { n: 4, dokumentId: 'zle', pdfIndex: 1 },
      ],
    })) as Extract<UdalostChatu, { typ: 'hotovo' }>;
    expect(u.citace.map((c) => c.n)).toEqual([1, 2]);
    expect(u.citace[0]).toEqual({ n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Kniha', tistena: '10', kapitola: null, zdroj: 'preklad', url: null, citat: 'c' });
    expect(u.kroky).toEqual([{ nastroj: 'hledej_v_knihach', popis: 'Hledám', chyba: true }]);
    expect(u).toMatchObject({ cenaUsd: 0.12, utracenoUsd: 1.5, stropUsd: 20, zpravaId: ID });
    expect(zdrojZDat({ n: 0, dokumentId: ID, pdfIndex: 1 })).toBeNull();
  });
});

describe('otázka pro AI sládka', () => {
  it('pošle otázku s tokenem a čte řádky i rozdělené mezi kusy', async () => {
    const fetchMock = vi.fn(async () => proud([
      `{"typ":"start","konverzace_id":"${KID}"}\n{"typ":"krok","po`,
      'pis":"Hledám v knihách: „pěna“"}\n{"typ":"text","text":"Pě"}\n',
      `{"typ":"hotovo","konverzace_id":"${KID}","text":"Pěna[1]","citace":[]}`,
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const udalosti: UdalostChatu[] = [];
    const r = await zeptejSe({ otazka: 'Proč málo pění?', problemId: ID, web: true }, (u) => udalosti.push(u));
    expect(r).toEqual({ ok: true });
    expect(udalosti.map((u) => u.typ)).toEqual(['start', 'krok', 'text', 'hotovo']);
    expect((udalosti[1] as { popis: string }).popis).toBe('Hledám v knihách: „pěna“');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cegrelgvkygcatupqwrx.supabase.co/functions/v1/bible-chat');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({ otazka: 'Proč málo pění?', konverzace_id: null, problem_id: ID, web: true });
  });

  it('chyba před odpovědí (strop) přijde jako JSON s českou zprávou', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, kod: 'strop', zprava: 'Strop je vyčerpaný.' }), { status: 429, headers: { 'Content-Type': 'application/json' } })));
    expect(await zeptejSe({ otazka: 'x y' }, () => {})).toEqual({ ok: false, chyba: { kod: 'strop', zprava: 'Strop je vyčerpaný.', status: 429 } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nic', { status: 404 })));
    expect(await zeptejSe({ otazka: 'x y' }, () => {})).toMatchObject({ ok: false, chyba: { kod: 'nenasazeno' } });
  });

  it('proud skončí bez hotové odpovědi = přerušeno (odpověď se dopočítá do historie)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => proud([`{"typ":"start","konverzace_id":"${KID}"}\n{"typ":"text","text":"A"}\n`])));
    const r = await zeptejSe({ otazka: 'x y' }, () => {});
    expect(r).toMatchObject({ ok: false, chyba: { kod: 'preruseno' } });
  });

  it('síť spadne před odpovědí', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await zeptejSe({ otazka: 'x y' }, () => {})).toMatchObject({ ok: false, chyba: { kod: 'nedostupna' } });
  });
});

describe('stav, konverzace a strop přes bible-api', () => {
  it('stav chatu; stará bible-api (neznámá akce) = nasazuje se', async () => {
    odpovedApi = { ok: true, data: { migrace: true, klic: true, utraceno_usd: '1.25', chat_usd: 1, chat_dotazu: 3, strop_usd: 20, model: 'claude-opus-5-5' } };
    expect(await nactiStavChatu()).toEqual({ stav: 'ok', data: { migrace: true, klic: true, utracenoUsd: 1.25, chatUsd: 1, chatDotazu: 3, stropUsd: 20, model: 'claude-opus-5-5' } });
    expect(volaniApi[0]).toEqual({ akce: 'chat_stav' });
    odpovedApi = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiStavChatu()).toMatchObject({ stav: 'chyba', kod: 'nenasazeno' });
  });

  it('konverzace: zprávy v pořadí, vadné vynechá', async () => {
    odpovedApi = { ok: true, data: { konverzace: { id: KID, nazev: 'Pěna', problem_id: null }, zpravy: [
      { id: ID, role: 'uzivatel', text: 'Otázka', created_at: '2026-11-11T10:00:00Z' },
      { id: 'zle', role: 'asistent', text: 'x' },
      { id: KID, role: 'asistent', text: 'Odpověď', citace: [], kroky: [], cena_usd: 0.1, neuplna: true, model: 'm' },
    ] } };
    const r = await nactiKonverzaci(KID);
    expect(volaniApi[0]).toEqual({ akce: 'konverzace_detail', id: KID });
    expect(r.stav === 'ok' && r.data.zpravy.map((z) => [z.role, z.text, z.neuplna])).toEqual([['uzivatel', 'Otázka', false], ['asistent', 'Odpověď', true]]);
  });

  it('cena česky', () => {
    expect(usdText(0.1234)).toBe('0,123 USD');
    expect(usdText(12.5)).toBe('12,50 USD');
  });
});
