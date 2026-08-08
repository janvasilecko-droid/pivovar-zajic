// Sdílená pipeline pro testy WhatsApp objednávek.
//
// Jediný zdroj pravdy pro to, jak se export zpráv promítne do objednávek:
//   1) bundluje src/lib/whatsappParser.ts (stejný kód, jaký běží v aplikaci)
//   2) načte katalog (piva, obaly, odběratele, aliasy) z Supabase
//   3) rozdělí export na zprávy (parseWhatsAppExport)
//   4) LOKÁLNÍ třídění bez AI: ne-objednávky pryč, doplnění sloučit,
//      revize přepsat, duplicity napříč odesílateli označit
//   5) každá sloučená objednávka projde AI parse-order-text (cesta jako aplikace);
//      AI odpovědi se kešují do scripts/input/.month-ai-cache.json
//
// Používají ji:
//   - scripts/test-month.mjs            (report / verdikt)
//   - scripts/seed-whatsapp-inbox.mjs   (nasetuje objednávky do aplikace)
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

// Očištění diakritiky pro robustní porovnávání (zprávy často píšou "patek" bez háčků)
export const normLite = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Čas z WhatsApp exportu může být "8:41" (jednociferná hodina) → vycpeme na
// "08:41", aby vznikl validní ISO timestamp "2026-08-04T08:41:00".
// (Node.js by "2026-08-04T8:41:00" považoval za Invalid Date.)
export const padTime = (t) => {
  if (!t) return '00:00';
  const [h, m] = t.split(':');
  return `${String(h || '0').padStart(2, '0')}:${m || '00'}`;
};

/**
 * Spustí celou pipeline (katalog + rozdělení + třídění + AI parsing).
 * @param {string} inputPath Cesta k exportu zpráv (např. scripts/input/month-export.txt)
 * @param {{ quiet?: boolean }} [opts] quiet = bez konzolového výpisu (používá seed skript)
 * @returns {Promise<{
 *   messages, orders, filtered, mergedLog,
 *   results, onlyReal, likelyNon, errors,
 *   beers, packages, places, aliasMap, placeAliases,
 *   matchPlace, parseWhatsAppOrderMessageWithAI,
 *   SU, ANK, SRK
 * }>}
 */
export async function runMonthPipeline(inputPath, opts = {}) {
  const quiet = !!opts.quiet;
  const log = (...a) => { if (!quiet) console.log(...a); };

  // ── 1) .env ────────────────────────────────────────────────────────────────
  const envTxt = readFileSync(resolve('.env'), 'utf8');
  const get = (k) =>
    envTxt.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
  const SU = get('VITE_SUPABASE_URL');
  const ANK = get('VITE_SUPABASE_ANON_KEY');
  const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
  if (!SU || !SRK) {
    throw new Error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY v .env');
  }

  // ── 2) Bundle whatsappParser.ts (stejný kód, jaký běží v aplikaci) ─────────
  const esbuild = require('esbuild');
  const bundle = esbuild.buildSync({
    entryPoints: [resolve('src/lib/whatsappParser.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SU),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(ANK),
    },
  });
  const code = bundle.outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  const { parseWhatsAppExport, parseWhatsAppOrderMessageWithAI } = mod.exports;

  // ── 3) Skutečná data z DB (klasifikace i AI potřebují odběratele) ──────────
  const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };
  async function loadData() {
    const [beers, packages, places, aliases, placeAliasRows] = await Promise.all([
      fetch(`${SU}/rest/v1/beers?select=id,name,degree,short_name&order=name`, { headers: H }).then((r) => r.json()),
      fetch(`${SU}/rest/v1/packages?select=id,label,volume_l&order=label`, { headers: H }).then((r) => r.json()),
      fetch(`${SU}/rest/v1/places?select=id,name&order=name`, { headers: H }).then((r) => r.json()),
      fetch(`${SU}/rest/v1/parser_aliases?select=alias_text,beer_id,package_id&order=hit_count.desc`, { headers: H }).then((r) => r.json()),
      fetch(`${SU}/rest/v1/place_aliases?select=wrong_name,place_id,correct_name&order=hit_count.desc`, { headers: H }).then((r) => r.json()),
    ]);
    const aliasMap = { beer: new Map(), package: new Map() };
    for (const a of aliases || []) {
      if (a.beer_id) aliasMap.beer.set(a.alias_text, a.beer_id);
      if (a.package_id) aliasMap.package.set(a.alias_text, a.package_id);
    }
    // Aliasy odběratelů (špatný název → správný) z tabulky place_aliases —
    // naučené z oprav uživatelů. Předáváme je AI i lokálnímu parseru.
    const placeAliasMap = new Map();
    for (const a of placeAliasRows || []) {
      if (a.place_id) placeAliasMap.set(a.wrong_name, a.place_id);
    }
    const placeAliases = (placeAliasRows || [])
      .map((a) => ({
        wrong_name: a.wrong_name,
        correct_name: places.find((p) => p.id === a.place_id)?.name ?? a.correct_name ?? a.wrong_name,
      }))
      .filter((a) => a.wrong_name && a.correct_name);
    return { beers, packages, places, aliasMap, placeAliasMap, placeAliases };
  }
  const { beers, packages, places, aliasMap, placeAliasMap, placeAliases } = await loadData();

  // ── 4) Vstup ─────────────────────────────────────────────────────────────────
  if (!existsSync(inputPath)) {
    throw new Error(
      `❌ Soubor neexistuje: ${inputPath}\n   Vlož export zpráv do scripts/input/month-export.txt (nebo předej cestu jako argument).`
    );
  }
  const raw = readFileSync(inputPath, 'utf8');

  const messages = parseWhatsAppExport(raw);
  if (messages.length === 0) {
    throw new Error(
      '❌ Nepodařilo se rozdělit žádnou zprávu.\n   (Rozpoznává se formát "DD.MM.YYYY, HH:MM - Odesílatel: text" a "[HH:MM, DD.MM.YYYY] Odesílatel: text".)'
    );
  }
  log(`📚 Data: ${beers.length} piv, ${packages.length} obalů, ${places.length} odběratelů, ${aliasMap.beer.size + aliasMap.package.size} aliasů piv/obalů.\n`);

  // ── 5) Třídění zpráv: ne-objednávky ven, odpovědi/revize sloučit do původní ──
  // Heuristika BEZ AI — AI se volá až pro finální sloučenou objednávku.
  const ORDER_RE = [
    /\b\d+(?:[.,]\d+)?\s*(l|litr|litru|litry|litru|petek|petky|lahve|lahvi|ks)\b/i,
    /\b(sud|sudy|soudk|keg|kegy|kegh|tank|kontejner|pet)\b/i,
    /\b\d+\s*°/,
    /\b(desitk|dvanact|svetl|tmav|jantar|lezak|psen|kvasnic|special|vycep|polotmav|citron|grep|vise|vosma|chmeloun|sluhy|summer|kiwi|limo)\w*/i,
    /\b\d+\s*[×x*]\s*\d+/,
  ];
  const MERGE_RE = /\b(misto|navic|jeste|pridej|pridat|pridam|odeber|odebrat|zrus|zmen|oprav|dopln|doplnim|nove|chtel bych|chtela bych|prosim o|a pak|a jeste|a dal|jinak)\b/i;
  const FOLLOWUP_PREFIX_RE = /^(tak|ty|my|jeste|misto|taky|a |jinak|prosim|prid|dopl|zrus|zmen|odeber|oprav|novy|vlastne|\d)/i;
  const CHITCHAT_RE = /\b(dobry den|dobry rano|ahoj|zdravi|cau|dekuj|diky|dik|prosim|dekujeme|mockrat|predem|nashle|na shledanou|ano|neni)\b/i;
  const DAY_RE = /\bna\s+(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli)\b|\b(v|ve)\s+(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli)\b|\b(zitra|pozitri|dnes|dneska)\b|\b\d{1,2}[./]\s?\d{1,2}\b/i;
  const NEW_ORDER_PREFIX_RE = /^(objednavk|pro\s+|na\s+adresu|pro\s+me|muzete\s+|muzes\s+|dnes\s+na\s+restaurac)/i;

  const looksLikeOrder = (text) => ORDER_RE.some((re) => re.test(normLite(text)));
  const hasDayMarker = (text) => DAY_RE.test(normLite(text));
  const looksLikeMerge = (text) => MERGE_RE.test(normLite(text));

  // Zpráva začíná názvem známého odběratele → to je NOVÁ objednávka, ne doplnění
  const startsWithPlace = (text) => {
    const n = normLite(text.trim());
    if (!n) return false;
    return places.some((p) => {
      const np = normLite(p.name);
      return np.length >= 4 && n.startsWith(np);
    });
  };
  const startsNewOrder = (text) => startsWithPlace(text) || NEW_ORDER_PREFIX_RE.test(normLite(text.trim()));

  // Krátká zpráva bez čísel a objemu = řeči; krátký dotaz = upřesnění
  const isChitChat = (text) => {
    const t = (text || '').trim();
    if (!t) return true;
    const words = t.split(/\s+/).length;
    if (words <= 8 && t.includes('?') && !/\b(l|keg|sud|pet)\b/i.test(t)) return true;
    return words <= 8 && !/\d/.test(t) && CHITCHAT_RE.test(normLite(t));
  };

  // Interní odesílatelé (poslové) — jen pro přehled
  const INTERNAL = ['bednar', 'pojmi', 'gabina', 'ucetni', 'vasil', 'alena', 'prodejna', 'petr', 'sladek', 'bendat'];
  const isInternal = (sender) => INTERNAL.some((s) => normLite(sender).includes(s));

  // Zprávy zpracováváme v GLOBÁLNÍM chronologickém pořadí (jako v reálném chatu),
  // každý odesílatel má vlastní "otevřenou" objednávku.
  const sortedMessages = [...messages].sort((a, b) =>
    `${a.date || '0000-00-00'} ${a.time || '00:00'}`.localeCompare(`${b.date || '0000-00-00'} ${b.time || '00:00'}`));

  const orders = [];    // { sender, date, time, parts:[{date,time,text}], text, lastTs, internal, dupOf }
  const filtered = [];  // { m, reason }
  const mergedLog = []; // { order, m, kind }

  const MERGE_WINDOW_MS = 12 * 60 * 60 * 1000; // odpověď do 12 h = doplnění objednávky
  const seenOrders = new Map(); // normLite(text) → order (pro odhalení duplicit napříč odesílateli)

  const senderState = new Map(); // normLite(sender) → { open, myOrders }
  let lastGlobalSender = null;   // normLite odesílatele POSLEDNÍ zprávy v chatu
  for (const m of sortedMessages) {
    const key = normLite(m.sender || '(bez odesílatele)').trim();
    // Prokládaná zpráva od JINÉHO odesílatele → tahle zpráva odpovídá spíš na ten
    // dotaz než na vlastní objednávku (viz krok 1c).
    const interleaved = lastGlobalSender != null && lastGlobalSender !== key;
    lastGlobalSender = key;
    let st = senderState.get(key);
    if (!st) {
      st = { open: null, myOrders: [] };
      senderState.set(key, st);
    }
    let open = st.open;
    const myOrders = st.myOrders;

    const orderLike = looksLikeOrder(m.text);
    const dayMark = hasDayMarker(m.text);
    const mergeLike = looksLikeMerge(m.text);
    const ts = `${m.date || '0000-00-00'} ${m.time || '00:00'}`;

    // 0) Krátký dotaz / upřesnění (i s objemem) → vyfiltrovat
    if (!dayMark && m.text.trim().length <= 60 && m.text.split('\n').some((l) => l.trim().endsWith('?'))) {
      m._tag = 'filtered';
      filtered.push({ m, reason: 'dotaz / upřesnění' });
      continue;
    }

    // 1) Vůbec to nevypadá na objednávku → vyfiltrovat
    if (!orderLike && !mergeLike) {
      m._tag = 'filtered';
      filtered.push({ m, reason: isChitChat(m.text) ? 'běžná řeč / pozdrav / dotaz' : 'bez obsahu objednávky' });
      continue;
    }

    // 1c) Krátká odpověď na prokládanou zprávu JINÉHO odesílatele (jiné téma) —
    //     zbytek cizí konverzace, ne doplnění objednávky ani nová objednávka.
    //     Typicky "Ty máme 3x / Tak 1x15 + 1x20l" po dotazu "Tak 20l?" od jiného
    //     odesílatele — NESMÍ se sloučit do předchozí objednávky.
    const shortChatReply =
      interleaved &&
      m.text.trim().split(/\s+/).length <= 8 &&
      m.text.trim().length <= 50 &&
      FOLLOWUP_PREFIX_RE.test(normLite(m.text.trim()));
    if (shortChatReply) {
      m._tag = 'filtered';
      filtered.push({ m, reason: 'odpověď na zprávu jiného odesílatele (mimo objednávku)' });
      continue;
    }

    // 1b) Jen "navíc/ještě..." bez konkrétních položek → sloučit do otevřené objednávky
    if (!orderLike) {
      if (open) {
        const gap = new Date(ts) - new Date(open.lastTs);
        if (gap >= 0 && gap <= MERGE_WINDOW_MS) {
          m._tag = 'merged';
          mergedLog.push({ order: open, m, kind: 'doplnění (bez položek)' });
          open.parts.push({ date: m.date, time: m.time, text: m.text });
          open.text += '\n' + m.text;
          open.lastTs = ts;
          seenOrders.set(normLite(open.text), open);
          continue;
        }
      }
      m._tag = 'filtered';
      filtered.push({ m, reason: 'pouze doplnění bez otevřené objednávky v okně' });
      continue;
    }


    // 2) Revize: nová zpráva obsahuje CELÝ text otevřené objednávky + doplnění
    const newNorm = normLite(m.text);
    const applyRevision = (target, prevNorm) => {
      mergedLog.push({ order: target, m, kind: 'revize — původní zpráva přepsána doplněním' });
      target.parts[target.parts.length - 1] = { date: m.date, time: m.time, text: m.text };
      target.text = m.text;
      target.lastTs = ts;
      seenOrders.delete(prevNorm);
      seenOrders.set(newNorm, target);
    };
    let revised = false;
    if (open) {
      const prevNorm = normLite(open.text);
      const gap = new Date(ts) - new Date(open.lastTs);
      if (prevNorm.length >= 25 && newNorm.startsWith(prevNorm) && gap >= 0 && gap <= MERGE_WINDOW_MS) {
        m._tag = 'merged';
        applyRevision(open, prevNorm);
        revised = true;
      }
    }
    // 2b) Revize STARŠÍ objednávky stejného odesílatele (např. Kiosek po Vojtovi)
    if (!revised) {
      for (let k = myOrders.length - 1; k >= 0; k--) {
        const cand = myOrders[k];
        if (cand === open) continue;
        const prevNorm = normLite(cand.text);
        const gap = new Date(ts) - new Date(cand.lastTs);
        if (prevNorm.length >= 25 && newNorm.startsWith(prevNorm) && gap >= 0 && gap <= MERGE_WINDOW_MS) {
          m._tag = 'merged';
          applyRevision(cand, prevNorm);
          open = cand;
          revised = true;
          break;
        }
      }
    }
    if (revised) {
      st.open = open;
      continue;
    }

    // 3) Navazující doplnění: otevřená objednávka + bez nového dne + ne nová objednávka
    //    (follow-up začíná "ještě/místo/ty máme/...", nebo je krátké doplnění s "navíc/ještě")
    if (open) {
      const gap = new Date(ts) - new Date(open.lastTs);
      const followUp = FOLLOWUP_PREFIX_RE.test(normLite(m.text.trim()));
      const short = m.text.trim().split(/\s+/).length <= 8 && m.text.trim().length <= 50;
      if (!dayMark && gap >= 0 && gap <= MERGE_WINDOW_MS && !startsNewOrder(m.text) && (followUp || (mergeLike && short))) {
        m._tag = 'merged';
        mergedLog.push({ order: open, m, kind: 'doplnění objednávky' });
        open.parts.push({ date: m.date, time: m.time, text: m.text });
        open.text += '\n' + m.text;
        open.lastTs = ts;
        seenOrders.set(normLite(open.text), open);
        continue;
      }
    }

    // 4) Duplicita napříč odesílateli (přeposlaná stejná objednávka) — nejdelší shoda
    let dupOf = null;
    let bestLen = 0;
    for (const [seenNorm, seenOrder] of seenOrders) {
      if (seenNorm.length < 30) continue;
      const ok = newNorm === seenNorm || newNorm.startsWith(seenNorm) || seenNorm.startsWith(newNorm);
      if (ok && seenNorm.length > bestLen) {
        bestLen = seenNorm.length;
        dupOf = seenOrder;
      }
    }

    // 5) Nová objednávka
    open = {
      sender: m.sender,
      date: m.date,
      time: m.time,
      parts: [{ date: m.date, time: m.time, text: m.text }],
      text: m.text,
      lastTs: ts,
      internal: isInternal(m.sender),
      dupOf,
      orderIndex: orders.length,
    };
    m._tag = dupOf ? 'dup' : 'order';
    orders.push(open);
    myOrders.push(open);
    if (!dupOf) seenOrders.set(newNorm, open);
    st.open = open;
  }

  const orderCount = orders.filter((o) => !o.dupOf).length;
  const dupCount = orders.filter((o) => o.dupOf).length;
  log(`📩 Z exportu rozděleno ${messages.length} zpráv.`);
  log(`   🚫 vyfiltrováno (ne-objednávky): ${filtered.length}`);
  log(`   🔀 sloučeno do původních objednávek: ${mergedLog.length}`);
  log(`   🔁 duplicity (přeposlané objednávky): ${dupCount}`);
  log(`   📦 objednávek k AI: ${orderCount}\n`);

  // Náhled třídění — abychom viděli, co heuristika dělá s každou zprávou
  log('── Třídění zpráv ─────────────────────────────────────────────────────');
  const TAG_ICON = { order: '📦 OBJEDNÁVKA', merged: '🔀 SLOUČENO', filtered: '🚫 VYFILTROVÁNO', dup: '🔁 DUPLICITA' };
  for (const m of messages) {
    const tag = TAG_ICON[m._tag] || '❓';
    log(`   ${tag}  [${m.date || '?'} ${m.time || ''}] ${m.sender || '?'}: ${m.text.replace(/\s+/g, ' ').slice(0, 80)}`);
  }


  // ── 6) Hlavní běh — PŘESNĚ cesta aplikace ────────────────────────────────────
  // Voláme parseWhatsAppOrderMessageWithAI (z bundlu whatsappParser.ts) = stejná
  // funkce, kterou používá aplikace: AI + parseGeminiItems + ukotvení odběratele.
  // Volání edge funkce se kešuje do scripts/input/.month-ai-cache.json.
  const AI_CACHE = resolve('scripts/input/.month-ai-cache.json');
  const cache = existsSync(AI_CACHE) ? JSON.parse(readFileSync(AI_CACHE, 'utf8')) : {};
  const saveCache = () => writeFileSync(AI_CACHE, JSON.stringify(cache, null, 2));
  mkdirSync(resolve('scripts/input'), { recursive: true });

  // Přesměruj fetch uvnitř bundlu na lokální keš (abychom znovu neplatili AI)
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = typeof url === 'string' ? url : (url?.url || '');
    if (u.includes('/parse-order-text')) {
      const body = JSON.parse(opts?.body || '{}');
      const key = body.rawText;
      if (key && cache[key]) {
        return { ok: true, status: 200, text: async () => JSON.stringify(cache[key]), json: async () => cache[key] };
      }
      const res = await origFetch(url, opts);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* raw text */ }
      if (res.ok && key && data && !data.error) { cache[key] = data; saveCache(); }
      return { ok: res.ok, status: res.status, text: async () => text, json: async () => data };
    }
    return origFetch(url, opts);
  };
  try {
    // Jméno odběratele → záznam z DB (přesné / přibližné / žádné)
    const matchPlace = (name) => {
      const n = normLite(name);
      if (!n) return null;
      const exact = places.find((pl) => normLite(pl.name) === n);
      if (exact) return { place: exact, fuzzy: false };
      const contains = places.find((pl) => {
        const np = normLite(pl.name);
        return np.length >= 4 && (n.includes(np) || np.includes(n));
      });
      if (contains) return { place: contains, fuzzy: true };
      return null;
    };

    const results = []; // { order, app, matched, issues, items, totalL, ... }
    const realOrders = orders.filter((o) => !o.dupOf);
    for (let i = 0; i < realOrders.length; i++) {
      const order = realOrders[i];
      const label = `#${order.orderIndex + 1}`;
      log(`   → ${label} [${order.date} ${order.time}] ${order.sender}: ${order.text.replace(/\s+/g, ' ').slice(0, 60)}...`);

      let app;
      try {
        app = await parseWhatsAppOrderMessageWithAI(
          order.text,
          beers,
          packages,
          places,
          order.sender,
          order.date ? `${order.date}T${padTime(order.time)}:00` : null,
          aliasMap,
          placeAliasMap // naučené aliasy odběratelů (opravy uživatelů)
        );
      } catch (e) {
        log(`     ⚠️ ${e.message}`);
        results.push({ order, app: null, error: e.message });
        continue;
      }

      const issues = [];
      const items = (app.items || []).filter((it) => !it._removed && it.quantity != null);
      const placeName = app.placeName || null;
      let matched = app.placeId
        ? { place: places.find((p) => p.id === app.placeId) ?? null, fuzzy: false }
        : null;
      if (!matched) matched = matchPlace(placeName);

      if (items.length === 0) issues.push('žádné položky — pravděpodobně ne-objednávka');
      if (!placeName) issues.push('AI nenašla odběratele (ukotvení v textu selhalo)');

      const totalL = items.reduce((sum, it) => {
        const pkg = packages.find((p) => p.id === it.package_id);
        return sum + (pkg?.volume_l || 0) * (Number(it.quantity) || 1);
      }, 0);

      results.push({ order, app, matched, issues, items, totalL, placeName });
    }
    log('');

    const onlyReal = results.filter((r) => (r.items || []).length > 0); // skutečné objednávky
    const likelyNon = results.filter((r) => !r.error && !(r.items || []).length); // ne-objednávky dle AI
    const errors = results.filter((r) => r.error);

    return {
      messages, orders, filtered, mergedLog,
      results, onlyReal, likelyNon, errors,
      beers, packages, places, aliasMap, placeAliasMap, placeAliases,
      matchPlace, parseWhatsAppOrderMessageWithAI, padTime, normLite,
      SU, ANK, SRK,
    };
  } finally {
    globalThis.fetch = origFetch;
  }
}

