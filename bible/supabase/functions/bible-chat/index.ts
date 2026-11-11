import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { chyba, corsHlavicky, nactiJson, overUzivatele, sluzebniKlic, tokenZHlavicky, uroven } from '../_shared/brana.ts';
import { NASTROJE } from '../_shared/mcp.ts';
import { zavolejNastrojChat } from '../_shared/nastroje.ts';
import {
  BETA_FALLBACK, CAS_KONEC_MS, dnesPraha, historieProApi, kontextDotazu, MAX_TOKENU, nastrojeChatu, nazevKonverzace,
  pozadavekChatu, SYSTEM_PROMPT, VYCHOZI_MODEL, type Cenik, type PozadavekChatu, type UlozenaZprava,
} from '../_shared/chat.ts';
import { smyckaChatu, type RozpoznejChybu, type Udalost, type VolaniClauda, type VysledekSmycky } from '../_shared/chat-smycka.ts';
import { ChybaVstupu } from '../_shared/vstupy.ts';

/**
 * 💬 bible-chat — AI sládek v appce (etapa 5, R28).
 *
 * Majitel 11. 11. 2026: „má to být chatbot, který mi bude vyhledávat problémy".
 * Appka pošle { otazka, konverzace_id?, problem_id?, web? } s tokenem hlavního
 * projektu; brána ho ověří (stejně jako bible-api) a odpověď jde zpátky jako
 * NDJSON — po řádcích: start, krok (co Claude hledá), text (průběžný text),
 * mezikrok (průběžný text byl jen úvod před hledáním), hotovo / chyba.
 *
 * Claude (model z bible_nastaveni.model_odpovedi, API klíč ANTHROPIC_API_KEY
 * — nasazení ho přenese z app_secrets hlavní appky) má stejné nástroje jako
 * konektor (_shared/nastroje.ts); stránky knih dostává jako search_result
 * s citacemi, takže každá citace v odpovědi ukazuje na stránku, kterou četl.
 * Hlídá se čas (limit platformy 150 s), počet kol a měsíční strop útraty
 * (strop_mesic_usd); každá odpověď se zapíše do konverzace i do ai_naklady.
 *
 * Zapisuje se JEN přes SQL funkce (bible_konverzace_zaloz, bible_zprava_uloz,
 * bible_naklad_zapis) — žádný přímý insert/update/delete (hlídá test). Do logu
 * nikdy otázka, odpověď ani text knih — jen druh chyby.
 */

const MAX_TELO = 16 * 1024;
const ANTHROPIC_URL = 'https://api.anthropic.com';
const NASAZENI = 'https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/deploy.yml';

type Db = SupabaseClient;

const zaokrouhli = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;
const cislo = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN);

Deno.serve(async (req: Request) => {
  const cors = corsHlavicky(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return chyba(cors, 405, 'metoda', 'bible-chat bere jen POST.');

  const token = tokenZHlavicky(req.headers.get('Authorization'));
  if (!token) return chyba(cors, 401, 'neprihlasen', 'Přihlášení je povinné.');

  let pozadavek: PozadavekChatu;
  try {
    pozadavek = pozadavekChatu(await nactiJson(req, MAX_TELO));
  } catch (e) {
    return chyba(cors, 400, 'neplatny_vstup', e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'Neplatný požadavek.');
  }

  const overeni = await overUzivatele(token, { anonKlic: Deno.env.get('HLAVNI_ANON_KEY') });
  if (!overeni.ok) return chyba(cors, overeni.status, overeni.kod, overeni.zprava);
  const u = overeni.uzivatel;
  if (!u.pristup) {
    return chyba(cors, 403, 'bez_pristupu', 'Nemáš přístup do Pivovarské bible. Povolí ho admin v Uživatelé → Práva → Pivovarská bible.');
  }
  const pristup = u.pristup;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const klic = sluzebniKlic((jmeno) => Deno.env.get(jmeno));
  if (!url || !klic) return chyba(cors, 503, 'nenastaveno', 'Projekt bible nemá adresu nebo klíč služby.');
  const db = createClient(url, klic, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const apiKlic = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!apiKlic) {
    return chyba(cors, 503, 'bez_klice', `AI sládek ještě nemá klíč k Claude API. Nasazení ho přenese z app_secrets hlavní appky (řádek ANTHROPIC_API_KEY) — spusť ho: ${NASAZENI} (Run workflow).`);
  }

  try {
    // Nastavení modelu, ceník a útrata tento měsíc (strop).
    const [nastaveni, utrata] = await Promise.all([
      db.from('bible_nastaveni').select('klic,hodnota').in('klic', ['model_odpovedi', 'cenik_usd_za_mtok']),
      db.rpc('bible_ai_utrata_mesic'),
    ]);
    if (utrata.error?.code === 'PGRST202') {
      return chyba(cors, 409, 'migrace', 'AI sládek čeká na migraci databáze bible 20261111030000_bible_chat (Systém → Databázové migrace → Databáze bible).');
    }
    if (nastaveni.error || utrata.error) {
      console.error(`bible-chat: nastavení nejde načíst (${nastaveni.error?.code ?? utrata.error?.code ?? '?'})`);
      return chyba(cors, 500, 'chyba', 'Nepodařilo se načíst nastavení AI. Zkus to znovu.');
    }
    const hodnoty = new Map(((nastaveni.data ?? []) as { klic: string; hodnota: unknown }[]).map((r) => [r.klic, r.hodnota]));
    const model = typeof hodnoty.get('model_odpovedi') === 'string' && hodnoty.get('model_odpovedi') ? String(hodnoty.get('model_odpovedi')) : VYCHOZI_MODEL;
    const cenikHodnota = hodnoty.get('cenik_usd_za_mtok');
    const cenik = (cenikHodnota && typeof cenikHodnota === 'object' ? cenikHodnota : {}) as Cenik;
    const stav = (utrata.data ?? {}) as Record<string, unknown>;
    const strop = cislo(stav.strop_usd);
    const utraceno = cislo(stav.utraceno_usd) || 0;
    if (!(strop > 0)) {
      return chyba(cors, 403, 'ai_vypnuta', 'AI sládek je vypnutý (měsíční strop útraty za AI je 0 USD). Zapne ho správce v Pivovarská bible → Správa znalostí → Útrata za AI.');
    }
    if (utraceno >= strop) {
      return chyba(cors, 429, 'strop', `Měsíční strop útraty za AI (${strop.toFixed(2)} USD) je vyčerpaný — utraceno ${utraceno.toFixed(2)} USD. Zvýšit ho může správce v Pivovarská bible → Správa znalostí → Útrata za AI.`);
    }

    // Konverzace: vlastní existující, nebo nová; k ní případně problém z Analýzy problémů.
    let konverzaceId = pozadavek.konverzaceId;
    let problemId = pozadavek.problemId;
    let historie: UlozenaZprava[] = [];
    if (konverzaceId) {
      const r = await db.rpc('bible_konverzace_zpravy', { p_uzivatel: u.uid, p_konverzace: konverzaceId });
      if (r.error) {
        console.error(`bible-chat: konverzace nejde načíst (${r.error.code ?? '?'})`);
        return chyba(cors, 500, 'chyba', 'Konverzaci se nepodařilo načíst.');
      }
      if (!r.data) return chyba(cors, 404, 'nenalezeno', 'Tahle konverzace neexistuje (nebo není tvoje).');
      const data = r.data as { konverzace?: { problem_id?: unknown }; zpravy?: unknown };
      historie = Array.isArray(data.zpravy) ? (data.zpravy as UlozenaZprava[]) : [];
      if (!problemId && typeof data.konverzace?.problem_id === 'string') problemId = data.konverzace.problem_id;
    }
    let problem: { id: string; nazev: string } | null = null;
    if (problemId) {
      const r = await db.from('bible_problemy').select('id,nazev').eq('id', problemId).maybeSingle();
      if (r.error || !r.data) return chyba(cors, 404, 'nenalezeno', 'Problém z Analýzy problémů neexistuje.');
      problem = r.data as { id: string; nazev: string };
    }
    if (!konverzaceId) {
      const r = await db.rpc('bible_konverzace_zaloz', { p_uzivatel: u.uid, p_nazev: nazevKonverzace(pozadavek.otazka), p_problem: problem?.id ?? null });
      if (r.error || typeof r.data !== 'string') {
        console.error(`bible-chat: konverzaci nejde založit (${r.error?.code ?? '?'})`);
        return chyba(cors, 500, 'chyba', 'Konverzaci se nepodařilo založit.');
      }
      konverzaceId = r.data;
    }
    const ulozenaOtazka = await db.rpc('bible_zprava_uloz', {
      p_uzivatel: u.uid, p_konverzace: konverzaceId, p_role: 'uzivatel', p_text: pozadavek.otazka, p_kroky: [], p_citace: [],
      p_model: null, p_vstup: 0, p_vystup: 0, p_cena: 0, p_neuplna: false,
    });
    if (ulozenaOtazka.error) {
      console.error(`bible-chat: otázku nejde uložit (${ulozenaOtazka.error.code ?? '?'})`);
      return chyba(cors, 500, 'chyba', 'Otázku se nepodařilo uložit.');
    }

    // Odpověď po řádcích (NDJSON). Odpojí-li se appka, odpověď se dopočítá a uloží do historie.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const zapisovac = writable.getWriter();
    const kodovani = new TextEncoder();
    let odpojeno = false;
    const posli = (udalost: Udalost) => {
      if (odpojeno) return;
      zapisovac.write(kodovani.encode(`${JSON.stringify(udalost)}\n`)).catch(() => { odpojeno = true; });
    };
    const prace = odpovez({
      db, apiKlic, model, cenik, strop, utraceno, pozadavek, historie, problem, posli,
      konverzaceId, uzivatel: { uid: u.uid, jmeno: u.jmeno, pristup },
    }).catch((e) => {
      console.error(`bible-chat: neočekávaná chyba ${e instanceof Error ? e.name : typeof e}`);
      posli({ typ: 'chyba', kod: 'chyba', zprava: 'Něco se pokazilo. Zkus to znovu.' });
    }).finally(() => { zapisovac.close().catch(() => {}); });
    (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(prace);

    return new Response(readable, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (e) {
    if (e instanceof ChybaVstupu) return chyba(cors, 400, 'neplatny_vstup', e.message);
    console.error(`bible-chat: neočekávaná chyba ${e instanceof Error ? e.name : typeof e}`);
    return chyba(cors, 500, 'chyba', 'Něco se pokazilo. Zkus to znovu.');
  }
});

async function odpovez(k: {
  db: Db; apiKlic: string; model: string; cenik: Cenik; strop: number; utraceno: number;
  pozadavek: PozadavekChatu; historie: UlozenaZprava[]; problem: { id: string; nazev: string } | null;
  konverzaceId: string; uzivatel: { uid: string; jmeno: string | null; pristup: string };
  posli: (u: Udalost) => void;
}): Promise<void> {
  const { db, model, posli } = k;
  posli({ typ: 'start', konverzace_id: k.konverzaceId });

  const preruseni = new AbortController();
  const casovac = setTimeout(() => preruseni.abort(), CAS_KONEC_MS);
  const claude = new Anthropic({ apiKey: k.apiKlic, baseURL: ANTHROPIC_URL, maxRetries: 2, timeout: CAS_KONEC_MS });

  const zapis = !!k.problem && uroven(k.uzivatel.pristup) >= 2;
  const nastroje = nastrojeChatu(NASTROJE, { zapis, web: k.pozadavek.web }) as unknown as Anthropic.Beta.BetaToolUnion[];
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT },
    { type: 'text', text: kontextDotazu({ dnes: dnesPraha(), jmeno: k.uzivatel.jmeno, zapis, problem: k.problem, web: k.pozadavek.web }) },
  ];

  // Jedno volání Claude (stream): průběžný text do appky, záložní model při odmítnutí.
  const zavolejClauda = async (p: Parameters<VolaniClauda>[0], udalosti: Parameters<VolaniClauda>[1], sFallbackem: boolean) => {
    const proud = claude.beta.messages.stream({
      model, max_tokens: MAX_TOKENU, system, messages: p.zpravy as Anthropic.Beta.BetaMessageParam[], tools: nastroje,
      ...(p.posledni ? { tool_choice: { type: 'none' as const } } : {}),
      cache_control: { type: 'ephemeral' },
      ...(sFallbackem ? { betas: [BETA_FALLBACK], fallbacks: 'default' as const } : {}),
    }, { signal: preruseni.signal });
    proud.on('text', (kus) => udalosti.text(kus));
    proud.on('streamEvent', (u) => {
      if (u.type === 'content_block_start' && u.content_block.type === 'server_tool_use') udalosti.hledaniNaWebu();
    });
    return await proud.finalMessage();
  };
  let sFallbackem = true;
  const volej: VolaniClauda = async (p, udalosti) => {
    try {
      return await zavolejClauda(p, udalosti, sFallbackem);
    } catch (e) {
      // Beta záložního modelu nemusí být pro účet API dostupná — 400 se neplatí,
      // zkusí se to jednou bez ní (a dál už bez ní).
      if (!sFallbackem || preruseni.signal.aborted || !(e instanceof Anthropic.BadRequestError)) throw e;
      sFallbackem = false;
      console.error('bible-chat: Claude API 400 se záložním modelem — zkouším bez něj');
      return await zavolejClauda(p, udalosti, false);
    }
  };
  const rozpoznej: RozpoznejChybu = (e) => {
    if (preruseni.signal.aborted || e instanceof Anthropic.APIUserAbortError) return { druh: 'preruseni' };
    if (e instanceof Anthropic.APIError) {
      console.error(`bible-chat: Claude API ${e.status ?? 'bez spojení'} ${e.type ?? ''}`.trim());
      return { druh: 'api', status: e.status, typ: e.type };
    }
    return null;
  };

  let v: VysledekSmycky;
  try {
    v = await smyckaChatu({
      zpravy: [...historieProApi(k.historie), { role: 'user', content: k.pozadavek.otazka }],
      volej, rozpoznej, posli, model, cenik: k.cenik, strop: k.strop, utraceno: k.utraceno,
      zavolej: zavolejNastrojChat(db, { uzivatel: k.uzivatel.uid, jmeno: k.uzivatel.jmeno, pristup: k.uzivatel.pristup }),
      logChyby: (nastroj, druh) => console.error(`bible-chat nástroj ${nastroj}: ${druh}`),
    });
  } finally {
    clearTimeout(casovac);
  }
  if (v.chybaClauda?.kod === 'chyba_api' && k.pozadavek.web) {
    const rada = ' Zkus otázku bez „Hledat i na internetu" — hledání na webu nemusí být pro účet Claude API povolené.';
    v = { ...v, chybaClauda: { ...v.chybaClauda, zprava: v.chybaClauda.zprava + rada }, text: `${v.text}${rada}` };
  }

  const ulozena = await db.rpc('bible_zprava_uloz', {
    p_uzivatel: k.uzivatel.uid, p_konverzace: k.konverzaceId, p_role: 'asistent', p_text: v.text.slice(0, 60_000),
    p_kroky: v.kroky, p_citace: v.zdroje, p_model: v.modelOdpovedi,
    p_vstup: v.cena.vstup + v.cena.cacheCteni + v.cena.cacheZapis, p_vystup: v.cena.vystup, p_cena: zaokrouhli(v.cena.cena), p_neuplna: v.neuplna,
  });
  if (ulozena.error) console.error(`bible-chat: odpověď nejde uložit (${ulozena.error.code ?? '?'})`);
  if (v.volani > 0) {
    const naklad = await db.rpc('bible_naklad_zapis', {
      p_ucel: 'chat', p_model: v.modelOdpovedi, p_volani: v.volani, p_vstup: v.cena.vstup, p_vystup: v.cena.vystup,
      p_cache_cteni: v.cena.cacheCteni, p_cache_zapis: v.cena.cacheZapis, p_cena: zaokrouhli(v.cena.cena), p_uzivatel: k.uzivatel.uid,
      p_poznamka: `konverzace ${k.konverzaceId}${v.cena.hledani ? `, web ${v.cena.hledani}×` : ''}${v.cena.odhad ? ', cena odhadem (model bez ceníku)' : ''}`,
    });
    if (naklad.error) console.error(`bible-chat: náklad nejde zapsat (${naklad.error.code ?? '?'})`);
  }

  if (v.chybaClauda && !v.dokoncena && !v.text.replace(v.chybaClauda.zprava, '').trim()) {
    posli({ typ: 'chyba', kod: v.chybaClauda.kod, zprava: v.chybaClauda.zprava, konverzace_id: k.konverzaceId });
    return;
  }
  posli({
    typ: 'hotovo', konverzace_id: k.konverzaceId, zprava_id: typeof ulozena.data === 'string' ? ulozena.data : null,
    text: v.text, citace: v.zdroje, kroky: v.kroky, neuplna: v.neuplna, model: v.modelOdpovedi, cena_usd: zaokrouhli(v.cena.cena),
    utraceno_usd: zaokrouhli(k.utraceno + v.cena.cena), strop_usd: k.strop,
  });
}
