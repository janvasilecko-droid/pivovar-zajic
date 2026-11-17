// @vitest-environment node
// Celý běh funkce whatsapp-auto-parse nad napodobenou databází a napodobenou
// čtecí funkcí — hlídá, že se zpráva po dočasné chybě čtení zkusí znovu
// (17. 11. 2026: fotka skončila „Parse API error: 546" a zůstala nepřečtená),
// že se přetížená AI nezkouší pořád dokola, že běh nepřeleze čas serveru
// a že žádná zpráva nezůstane viset „ve zpracování".
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POZNAMKA_CEKA, UPOZORNENI_ZALOZNI_CTENI, poznamkaCeka, znackaCteSe } from './opakovani-cteni';

type Radek = Record<string, any>;
const db: Record<string, Radek[]> = {};

/** Napodobený dotaz supabase-js nad polem v paměti (jen to, co funkce používá). */
function dotaz(tabulka: string) {
  const podminky: ((r: Radek) => boolean)[] = [];
  let zapis: Radek | null = null;
  let vracet = false;
  let razeni: { sloupec: string; vzestupne: boolean } | null = null;
  let limit = Infinity;
  const porovnej = (a: any, b: any) => (a === b ? 0 : a > b ? 1 : -1);
  const q: Record<string, any> = {
    select: () => { vracet = true; return q; },
    update: (patch: Radek) => { zapis = patch; vracet = false; return q; },
    eq: (s: string, v: any) => { podminky.push((r) => r[s] === v); return q; },
    in: (s: string, v: any[]) => { podminky.push((r) => v.includes(r[s])); return q; },
    lt: (s: string, v: any) => { podminky.push((r) => r[s] != null && porovnej(r[s], v) < 0); return q; },
    gte: (s: string, v: any) => { podminky.push((r) => r[s] != null && porovnej(r[s], v) >= 0); return q; },
    like: (s: string, vzor: string) => { podminky.push((r) => typeof r[s] === 'string' && r[s].startsWith(vzor.replace(/%$/, ''))); return q; },
    not: (s: string, _op: string, v: any) => { podminky.push((r) => r[s] !== v && !(v === null && r[s] == null)); return q; },
    ilike: () => q,
    or: () => q,
    order: (sloupec: string, o?: { ascending?: boolean }) => { razeni = { sloupec, vzestupne: o?.ascending !== false }; return q; },
    limit: (n: number) => { limit = n; return q; },
    maybeSingle: () => Promise.resolve({ data: vyhodnot()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: vyhodnot()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, chyba?: (e: unknown) => unknown) =>
      Promise.resolve().then(() => {
        const radky = vyhodnot(); // zápis se provede vždy, vrací se jen po .select()
        return { data: zapis && !vracet ? null : radky, error: null };
      }).then(ok, chyba),
  };
  function vyhodnot(): Radek[] {
    let radky = (db[tabulka] ?? []).filter((r) => podminky.every((p) => p(r)));
    if (zapis) for (const r of radky) Object.assign(r, zapis);
    if (razeni) radky = [...radky].sort((a, b) => porovnej(a[razeni!.sloupec], b[razeni!.sloupec]) * (razeni!.vzestupne ? 1 : -1));
    return radky.slice(0, limit).map((r) => ({ ...r }));
  }
  return q;
}

vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: () => ({ from: (t: string) => dotaz(t), rpc: () => Promise.resolve({ data: true, error: null }) }),
}));

const URL_PROJEKTU = 'https://projekt.supabase.co';
const TAJNE = 'tajny-cron';
const FOTKA_URL = `${URL_PROJEKTU}/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg`;
const T0 = Date.parse('2026-11-17T09:32:41.000Z');

let obsluha: (req: Request) => Promise<Response>;
const napodobDeno = () => vi.stubGlobal('Deno', {
  env: { get: (k: string) => (k === 'SUPABASE_URL' ? URL_PROJEKTU : 'klic') },
  serve: (h: (req: Request) => Promise<Response>) => { obsluha = h; },
});
beforeAll(async () => {
  napodobDeno();
  await import('../whatsapp-auto-parse/index.ts');
});

type Cteni = { ms?: number; status?: number; json?: Radek; visi?: boolean };
const PRECTENO = (navic: Radek = {}): Radek => ({
  items: [{ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '2x 30l 12° sv', place_name: 'Sklad', date: null }],
  place_name: 'Sklad', raw_text: 'SKLAD\n2x 30l 12° sv', otazky: [], _provider: 'ocr+gemini', _zalozni: false, ...navic,
});

/** Napodobená čtecí funkce; `cteni(telo)` říká, jak odpoví. Vrací seznam těl, která dostala. */
function ctecka(cteni: (telo: Radek) => Cteni) {
  const tela: Radek[] = [];
  vi.stubGlobal('fetch', (url: string, init: { signal?: AbortSignal; body?: string } = {}) => {
    const u = String(url);
    if (u.includes('/storage/v1/object/')) {
      return Promise.resolve(new Response(new Uint8Array([255, 216, 255, 224]), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '4' } }));
    }
    if (!u.endsWith('/functions/v1/parse-order-text')) return Promise.reject(new Error(`nečekané volání ${u}`));
    const telo = JSON.parse(init.body ?? '{}');
    tela.push(telo);
    const c = cteni(telo);
    return new Promise<Response>((ok, chyba) => {
      const signal = init.signal;
      if (signal?.aborted) return chyba(signal.reason);
      const priZruseni = () => { clearTimeout(casovac); chyba(signal!.reason); };
      const casovac = c.visi ? undefined : setTimeout(() => {
        signal?.removeEventListener('abort', priZruseni);
        ok(new Response(JSON.stringify(c.json ?? (c.status && c.status >= 400 ? { error: 'chyba' } : PRECTENO())), { status: c.status ?? 200 }));
      }, c.ms ?? 5_000);
      signal?.addEventListener('abort', priZruseni, { once: true });
    });
  });
  return tela;
}

const zprava = (id: string, navic: Radek = {}): Radek => ({
  id, created_at: new Date(T0).toISOString(), status: 'pending', error_message: null, message_type: 'text',
  message_text: 'Sklad 2x30 12sv', sender_name: 'Objednávky pivovar', participant_name: 'Radek', chat_id: 'skupina',
  message_timestamp: new Date(T0).toISOString(), media_url: null, from_me: false, quoted_text: null,
  parsed_items: null, parsed_otazky: null, imported_order_id: null, ...navic,
});
const fotka = (id: string, navic: Radek = {}) => zprava(id, { message_type: 'image', message_text: '📷 Fotka objednávky (bez popisu)', media_url: FOTKA_URL, ...navic });
const radek = (id: string) => db.whatsapp_incoming.find((r) => r.id === id)!;

describe('whatsapp-auto-parse: po chybě čtení se zpráva zkusí znovu a běh se vejde do času serveru', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 2_000);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('čas vypršel', 'TimeoutError')), ms);
      return c.signal;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const t of Object.keys(db)) delete db[t];
    db.app_secrets = [{ key: 'WHATSAPP_CRON_SECRET', value: TAJNE }];
    db.beers = [{ id: 'b1', name: '12° Světlá', degree: '12°', short_name: '12sv' }];
    db.packages = [{ id: 'p1', label: '30l', volume_l: 30 }];
    db.places = [{ id: 'm1', name: 'Sklad' }];
    db.whatsapp_incoming = [];
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); napodobDeno(); });

  const spust = async () => {
    const zacatek = Date.now();
    const slib = obsluha(new Request(`${URL_PROJEKTU}/functions/v1/whatsapp-auto-parse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Cron-Secret': TAJNE }, body: '{}',
    }));
    let trvalo = -1;
    void slib.then(() => { trvalo = Date.now() - zacatek; });
    await vi.runAllTimersAsync();
    const odpoved = await slib;
    return { status: odpoved.status, json: await odpoved.json(), trvalo };
  };

  it('17. 11. 2026: server čtení fotky ukončil (546) → fotka čeká na další pokus, nezůstane jako chyba', async () => {
    db.whatsapp_incoming.push(fotka('f1'));
    const tela = ctecka(() => ({ ms: 57_000, status: 546 }));
    const { status, trvalo } = await spust();
    expect(status).toBe(200);
    expect(radek('f1').status).toBe('pending');
    expect(radek('f1').error_message).toBe(poznamkaCeka(T0 + 2_000 + trvalo));
    // Čerstvá fotka: jen nejlepší čtení, první kolo, čas z rozpočtu běhu.
    expect(tela).toHaveLength(1);
    expect(tela[0]).toMatchObject({ cteniFotky: 'nejlepsi', kolo: 0 });
    expect(tela[0].maxMs).toBeGreaterThanOrEqual(45_000);
    expect(tela[0].maxMs).toBeLessThanOrEqual(58_000);
    expect(tela[0].imageBase64).toBeTruthy();
  });

  it('otevřená appka zavolá čtení hned po změně zprávy → čekající fotka se nezkouší znovu dřív než za odstup', async () => {
    db.whatsapp_incoming.push(fotka('f1', { error_message: poznamkaCeka(T0 + 500) }));
    const tela = ctecka(() => ({}));
    const prvni = await spust();
    expect(prvni.json.message).toBe('No pending messages to process');
    expect(tela).toHaveLength(0);
    expect(radek('f1')).toMatchObject({ status: 'pending', error_message: poznamkaCeka(T0 + 500) });

    // Po odstupu (cron za 3 minuty) se zkusí znovu a tentokrát se přečte.
    vi.setSystemTime(T0 + 185_000);
    const druhy = await spust();
    expect(druhy.json.summary).toMatchObject({ parsed: 1, error: 0 });
    expect(tela).toHaveLength(1);
    expect(tela[0]).toMatchObject({ cteniFotky: 'nejlepsi', kolo: 1 });
    expect(radek('f1')).toMatchObject({ status: 'parsed', error_message: null });
    expect(radek('f1').parsed_items).toHaveLength(1);
  });

  it('fotka, kterou Gemini nepřečetl ani po 6 minutách, se čte vším; záložní čtení je v kontrole označené jako první upozornění', async () => {
    db.whatsapp_incoming.push(fotka('f1', { error_message: poznamkaCeka(T0 + 5 * 60_000) }));
    vi.setSystemTime(T0 + 7 * 60_000 + 10_000);
    const tela = ctecka(() => ({ ms: 50_000, json: PRECTENO({ _provider: 'ocr+mistral', _zalozni: true, otazky: ['Není jasné datum.'] }) }));
    await spust();
    expect(tela[0]).toMatchObject({ cteniFotky: 'vse', kolo: 2 });
    expect(radek('f1').status).toBe('parsed');
    expect(radek('f1').parsed_otazky).toEqual([UPOZORNENI_ZALOZNI_CTENI, 'Není jasné datum.']);
  });

  it('fotku přečetl Gemini → žádné upozornění na záložní čtení', async () => {
    db.whatsapp_incoming.push(fotka('f1'));
    ctecka(() => ({ ms: 40_000 }));
    await spust();
    expect(radek('f1')).toMatchObject({ status: 'parsed', error_message: null, parsed_otazky: [] });
  });

  it('texty jdou před fotku a fotka dostane jen čas, který z běhu zbývá', async () => {
    db.whatsapp_incoming.push(
      fotka('f1', { created_at: new Date(T0).toISOString() }),
      zprava('t1', { created_at: new Date(T0 + 9_000).toISOString(), message_text: 'Radek na čtvrtek' }),
    );
    const tela = ctecka((telo) => (telo.imageBase64 ? { ms: 40_000 } : { ms: 6_000 }));
    const { json, trvalo } = await spust();
    expect(tela.map((t) => (t.imageBase64 ? 'fotka' : 'text'))).toEqual(['text', 'fotka']);
    expect(tela[0].cteniFotky).toBeUndefined();
    // Běh 66 s − 6 s text − 7 s režie = 53 s pro fotku.
    expect(tela[1].maxMs).toBe(53_000);
    expect(json.summary).toMatchObject({ parsed: 2 });
    expect(trvalo).toBeLessThan(66_000);
  });

  it('po třech textech už se fotka do běhu nevejde → vrátí se do fronty (i se svou poznámkou) a čtení se pro ni nevolá', async () => {
    const pozn = poznamkaCeka(T0 - 200_000);
    db.whatsapp_incoming.push(
      fotka('f1', { error_message: pozn }),
      ...['t1', 't2', 't3'].map((id, i) => zprava(id, { created_at: new Date(T0 + (i + 1) * 1_000).toISOString() })),
    );
    const tela = ctecka(() => ({ ms: 8_000 }));
    const { json } = await spust();
    expect(tela.filter((t) => t.imageBase64)).toHaveLength(0);
    expect(tela).toHaveLength(3);
    expect(json.summary).toMatchObject({ parsed: 3, skipped: 1 });
    expect(radek('f1')).toMatchObject({ status: 'pending', error_message: pozn });
  });

  it('čtecí funkce neodpoví vůbec → běh na ni nečeká přes svůj čas a zpráva čeká na další pokus', async () => {
    db.whatsapp_incoming.push(fotka('f1'), zprava('t1', { created_at: new Date(T0 + 1_000).toISOString() }));
    ctecka((telo) => (telo.imageBase64 ? { visi: true } : { ms: 3_000 }));
    const { status, trvalo } = await spust();
    expect(status).toBe(200);
    expect(trvalo).toBeLessThanOrEqual(66_500);
    expect(radek('t1').status).toBe('parsed');
    expect(radek('f1').status).toBe('pending');
    expect(radek('f1').error_message.startsWith(POZNAMKA_CEKA)).toBe(true);
  });

  it('čtení selhává i po hodině → chyba s radou; trvalá chyba (400) je chyba hned', async () => {
    db.whatsapp_incoming.push(zprava('stara', { created_at: new Date(T0 - 61 * 60_000).toISOString(), error_message: POZNAMKA_CEKA }));
    db.whatsapp_incoming.push(zprava('spatna', { created_at: new Date(T0 + 1_000).toISOString(), message_text: 'x' }));
    ctecka((telo) => (telo.rawText === 'x' ? { ms: 500, status: 400 } : { ms: 500, status: 502 }));
    await spust();
    expect(radek('stara')).toMatchObject({
      status: 'error',
      error_message: 'AI je přetížená a zprávu se nepodařilo přečíst ani po opakování (kód 502). Zkus později „Znovu parsovat“.',
    });
    expect(radek('spatna')).toMatchObject({ status: 'error', error_message: 'Parse API error: 400' });
  });

  it('zpráva uvízlá „ve zpracování" (běh skončil dřív, než ji dočetl) se po pěti minutách vrátí do fronty a přečte', async () => {
    db.whatsapp_incoming.push(
      zprava('uvizla', { status: 'processing', error_message: znackaCteSe(T0 - 6 * 60_000) }),
      zprava('prave-se-cte', { status: 'processing', error_message: znackaCteSe(T0 - 20_000), created_at: new Date(T0 - 3_600_000).toISOString() }),
      zprava('ze-zari', { status: 'processing', error_message: null, created_at: '2026-09-02T10:50:54.000Z' }),
    );
    const tela = ctecka(() => ({ ms: 4_000 }));
    await spust();
    expect(tela).toHaveLength(1);
    expect(radek('uvizla')).toMatchObject({ status: 'parsed', error_message: null });
    // Zpráva, kterou právě čte jiný běh, a stará zpráva bez značky zůstávají, jak jsou.
    expect(radek('prave-se-cte')).toMatchObject({ status: 'processing', error_message: znackaCteSe(T0 - 20_000) });
    expect(radek('ze-zari')).toMatchObject({ status: 'processing', error_message: null });
  });

  it('během čtení nese zpráva značku s časem převzetí a druhý běh ji nevezme (nečte se dvakrát)', async () => {
    db.whatsapp_incoming.push(zprava('t1'));
    let behemCteni: Radek | null = null;
    const tela = ctecka(() => { behemCteni = { ...radek('t1') }; return { ms: 10_000 }; });
    const prvni = obsluha(new Request(`${URL_PROJEKTU}/functions/v1/whatsapp-auto-parse`, { method: 'POST', headers: { 'X-Internal-Cron-Secret': TAJNE }, body: '{}' }));
    await vi.advanceTimersByTimeAsync(2_000);
    const druhy = await spust();
    await prvni;
    expect(druhy.json.message).toBe('No pending messages to process');
    expect(tela).toHaveLength(1);
    expect(behemCteni).toMatchObject({ status: 'processing', error_message: znackaCteSe(T0 + 2_000) });
    expect(radek('t1')).toMatchObject({ status: 'parsed', error_message: null });
  });

  it('žádný běh nepřeleze čas serveru, ani když je ve frontě deset pomalých zpráv', async () => {
    for (let i = 0; i < 10; i++) db.whatsapp_incoming.push(zprava(`t${i}`, { created_at: new Date(T0 + i * 1_000).toISOString() }));
    const tela = ctecka(() => ({ ms: 9_000 }));
    const { json, trvalo } = await spust();
    expect(trvalo).toBeLessThanOrEqual(66_000);
    expect(json.summary.parsed + json.summary.skipped).toBe(10);
    expect(json.summary.skipped).toBeGreaterThan(0);
    expect(tela.every((t) => t.maxMs >= 12_000 && t.maxMs <= 58_000)).toBe(true);
    // Co se nestihlo, čeká ve frontě — nic nezůstalo „ve zpracování".
    expect(db.whatsapp_incoming.filter((r) => r.status === 'processing')).toEqual([]);
    expect(db.whatsapp_incoming.filter((r) => r.status === 'pending')).toHaveLength(json.summary.skipped);
  });
});
