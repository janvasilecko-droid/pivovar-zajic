// Nasetuje testovací objednávky z WhatsApp exportu do aplikace, abys je viděl
// v UI (Objednávky → 🤖 Automatické zpracování WhatsApp) a zkontroloval,
// jestli se správně propisují do objednávek.
//
// Do tabulky whatsapp_incoming se vloží FINÁLNÍ sloučené objednávky (přesně ty,
// které podle scripts/test-month.mjs "propisují se") se statusem 'pending'.
// Odesílatelé se přidají do whitelistu (whatsapp_senders), aby je aplikace
// automaticky rozparsovala. Do textu zprávy se přidá marker
// "[TEST z month-exportu — smazat po kontrole]" → objednávky z testu jdou pak
// hromadně smazat příkazem --clear-orders.
//
// Použití:
//   node scripts/seed-whatsapp-inbox.mjs                          # seed 17 objednávek (přímý vklad do DB)
//   node scripts/seed-whatsapp-inbox.mjs cesta\k\exportu.txt      # jiný export
//   node scripts/seed-whatsapp-inbox.mjs --webhook                # poslat přes whatsapp-webhook edge funkci
//                                                                #   (stejná cesta jako Make/Tasker → zprávy
//                                                                #   v aplikaci "přijdou" jako nové WhatsApp)
//   node scripts/seed-whatsapp-inbox.mjs --clear                  # smazat test zprávy
//   node scripts/seed-whatsapp-inbox.mjs --clear-orders           # + smazat test objednávky
//   node scripts/seed-whatsapp-inbox.mjs --reparse                # znovu rozparsovat seed zprávy
//   node scripts/seed-whatsapp-inbox.mjs --prefill                # doplnit parsed data z AI keše
//                                                                #   (když serverové AI nejede, např. došel kredit)
//   node scripts/seed-whatsapp-inbox.mjs --no-parse               # nespouštět serverové AI
//   node scripts/seed-whatsapp-inbox.mjs --no-marker              # bez markeru v textu
//   node scripts/seed-whatsapp-inbox.mjs --no-whitelist           # neměnit whitelist
//
// Po seedu skript automaticky zkusí serverové AI parsování a to, co nestihne
// (např. došel kredit Anthropic), doplní z ověřené AI keše pipeline — zprávy
// pak jsou 'parsed' a rovnou se dají v aplikaci zkontrolovat a importovat.
//
// Po seedu:
//   1) otevři aplikaci → záložka Objednávky
//   2) klikni "🤖 Automatické zpracování WhatsApp" → "Zpracovat automaticky"
//      (nebo počkej, až se zprávy rozparsují samy — serverové AI)
//   3) u každé zprávy zkontroluj rozparsované položky a potvrdí ✓ (import)
//   4) objednávky se objeví v Objednávkách — porovnej s očekávaným reportem
//      (scripts/test-month-output.txt) a s tabulkou, kterou skript vypíše
//   5) po kontrole: node scripts/seed-whatsapp-inbox.mjs --clear-orders
import { runMonthPipeline, padTime, normLite } from './month-order-pipeline.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 1) .env ──────────────────────────────────────────────────────────────────
const envTxt = readFileSync(resolve('.env'), 'utf8');
const get = (k) =>
  envTxt.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const ANK = get('VITE_SUPABASE_ANON_KEY');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
if (!SU || !SRK) {
  console.error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

// ── 2) Argumenty ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const exportPath = resolve(args.find((a) => !a.startsWith('--')) || 'scripts/input/month-export.txt');

const doClear = flag('--clear');
const doClearOrders = flag('--clear-orders');
const doReparse = flag('--reparse');
const doPrefill = flag('--prefill');
const doSeed = flag('--seed') || (!doClear && !doClearOrders && !doReparse && !doPrefill);
const viaWebhook = flag('--webhook');
const useMarker = !flag('--no-marker');
const useWhitelist = !flag('--no-whitelist');
const doServerParse = !flag('--no-parse') && doSeed;

// Marker na konci textu zprávy → AI ho dá do poznámky objednávky → jde hromadně
// smazat přes --clear-orders. Jasně také označí testovací objednávky v aplikaci.
const MARKER = '\n\n[TEST z month-exportu — smazat po kontrole]';
const WID_PREFIX = 'seed-month-';

const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };

// ── 3) Pomocné funkce ────────────────────────────────────────────────────────
async function rest(path, opts = {}) {
  const res = await fetch(`${SU}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, error: !res.ok };
}

const like = (col, pattern) => `${col}=like.${encodeURIComponent(pattern)}`;

async function findSeededMessages() {
  const { data } = await rest(`whatsapp_incoming?select=id,status,sender_name,message_text,imported_order_id,webhook_id&${like('webhook_id', WID_PREFIX + '%')}`);
  return Array.isArray(data) ? data : [];
}

async function countSeedOrders() {
  const { data } = await rest(`orders?select=id&note=ilike.${encodeURIComponent('*' + 'TEST z month-exportu' + '*')}`);
  return Array.isArray(data) ? data : [];
}

// ── 4) Úklid ──────────────────────────────────────────────────────────────────
async function clearSeeded() {
  const existing = await findSeededMessages();
  if (existing.length === 0) {
    console.log('   (žádné nasetované testovací zprávy nebyly nalezeny)');
    return 0;
  }
  const { status } = await rest(
    `whatsapp_incoming?${like('webhook_id', WID_PREFIX + '%')}`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  console.log(`   🗑️ smazáno testovacích zpráv: ${existing.length} (HTTP ${status})`);
  return existing.length;
}

async function clearSeedOrders() {
  const orders = await countSeedOrders();
  if (orders.length === 0) {
    console.log('   (žádné testovací objednávky s markerem v poznámce nebyly nalezeny)');
    return 0;
  }
  const ids = orders.map((o) => o.id);
  const inFilter = `in.(${ids.join(',')})`;
  // order_items se mažou kaskádově (ON DELETE CASCADE), ale pro jistotu je smažeme taky
  await rest(`order_items?order_id=${inFilter}`, { method: 'DELETE' });
  const { status } = await rest(`orders?id=${inFilter}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  console.log(`   🗑️ smazáno testovacích objednávek: ${orders.length} (HTTP ${status})`);
  return orders.length;
}

// ── 5) Whitelist odesílatelů ─────────────────────────────────────────────────
async function whitelistSenders(senders) {
  const names = [...new Set(senders.filter(Boolean).map((s) => s.trim()))];
  if (names.length === 0) return 0;
  const { data: existing } = await rest('whatsapp_senders?select=sender_name');
  const known = new Set((existing || []).map((s) => normLite(s.sender_name)));
  let added = 0;
  for (const name of names) {
    if (known.has(normLite(name))) continue;
    const { status } = await rest('whatsapp_senders', {
      method: 'POST',
      body: JSON.stringify({ sender_name: name }),
    });
    if (status === 201) { added++; known.add(normLite(name)); }
    else console.log(`   ⚠️ nejde přidat odesílatele "${name}" do whitelistu (HTTP ${status})`);
  }
  return added;
}

// ── 6) Serverové AI parsování (až 10 zpráv na volání) ────────────────────────
async function resetErroredSeeded() {
  // Zprávy, které serverové AI nezpracovalo (status 'error'), vrátíme na
  // 'pending', aby se daly znovu rozparsovat (např. po opravě edge funkce).
  const seeded = await findSeededMessages();
  const errored = seeded.filter((m) => m.status === 'error');
  for (const m of errored) {
    await rest(`whatsapp_incoming?id=eq.${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending', error_message: null }),
    });
  }
  if (errored.length) console.log(`   ♻️ zpráv se statusem 'error' vráceno na 'pending': ${errored.length}`);
  return errored.length;
}

async function triggerServerParse(maxRounds = 5) {
  await resetErroredSeeded();
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${SU}/functions/v1/whatsapp-auto-parse`, {
      method: 'POST',
      headers: { apikey: ANK, Authorization: `Bearer ${ANK}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    let body = {};
    try { body = await res.json(); } catch { /* ignore */ }
    console.log(`   🤖 serverové parsování (kolo ${round + 1}): ${res.status} — zpracováno ${body.processed ?? 0}`);

    const pending = await findSeededMessages();
    const still = pending.filter((m) => m.status === 'pending');
    if (still.length === 0) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const pending = await findSeededMessages();
  const still = pending.filter((m) => m.status === 'pending');
  if (still.length) {
    console.log(`   ⚠️ ${still.length} zpráv zůstalo 'pending' — rozparsuje je aplikace (tlačítko "Zpracovat automaticky").`);
  }
}

// ── 6b) Pre-fill z AI keše pipeline ──────────────────────────────────────────
// Když serverové AI nefunguje (např. vyčerpaný kredit Anthropic API), doplníme
// rozparsovaná data z ověřeného výsledku pipeline (stejný AI parsing jako
// test-month.mjs, kešovaný v scripts/input/.month-ai-cache.json). Zpráva pak
// v aplikaci vypadá jako 'parsed' a jde zkontrolovat/importovat.
async function prefillFromPipeline() {
  const P = await runMonthPipeline(exportPath, { quiet: true });
  const { onlyReal } = P;
  const seeded = await findSeededMessages();
  const byIdx = new Map();
  for (const m of seeded) {
    const idx = (m.webhook_id || '').match(/^seed-month-(\d+)-/)?.[1];
    if (idx) byIdx.set(idx, m);
  }
  let filled = 0;
  for (const r of onlyReal) {
    const idx = String(r.order.orderIndex + 1);
    const msg = byIdx.get(idx);
    if (!msg) continue;
    if (msg.status === 'parsed' || msg.status === 'imported') continue; // už rozparsováno
    const app = r.app || {};
    const items = (r.items || []).map((it) => ({
      beer_id: it.beer_id || null,
      pkg_id: it.package_id || null,
      qty: it.quantity ?? null,
      degree: it.degree || null,
      beer_name: it.beer_name || null,
      package_label: it.package_label || null,
      raw_line: it.raw || null,
    }));
    const marker = 'TEST z month-exportu — smazat po kontrole';
    const note = [app.note, marker].filter(Boolean).join('; ');
    await rest(`whatsapp_incoming?id=eq.${msg.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'parsed',
        parsed_place_id: app.placeId || null,
        parsed_place_name: app.placeName || null,
        parsed_delivery_day: app.deliveryDay || null,
        parsed_delivery_date: app.deliveryDate || null,
        parsed_note: note,
        parsed_items: items,
        error_message: null,
      }),
    });
    filled++;
    console.log(`   💾 #${idx} [${msg.sender_name}] → parsed (z AI keše): ${app.placeName || '—'}, ${items.length} položek`);
  }
  console.log(`   ✅ pre-fill dokončen: ${filled} zpráv doplněno z AI keše`);
  return filled;
}



// ── 7) Hlavní běh ────────────────────────────────────────────────────────────
async function main() {
  if (doClear) {
    console.log('── 🗑️ ÚKLID nasetovaných zpráv ────────────────────────────────────');
    await clearSeeded();
  }
  if (doClearOrders) {
    console.log('── 🗑️ ÚKLID testovacích objednávek ─────────────────────────────────');
    await clearSeedOrders();
  }
  if (!doSeed) {
    if (doReparse) {
      console.log('── ♻️ REPARSE nasetovaných zpráv ──────────────────────────────────');
      await triggerServerParse();
      const seeded = await findSeededMessages();
      const by = {};
      for (const m of seeded) by[m.status] = (by[m.status] || 0) + 1;
      console.log('   stav zpráv:', JSON.stringify(by));
    } else if (doPrefill) {
      console.log('── 💾 PRE-FILL rozparsovaných dat z AI keše ───────────────────────');
      await prefillFromPipeline();
    } else {
      console.log('\nHotovo. (Pro nový seed spusť bez --clear/--clear-orders.)');
    }
    return;
  }

  // 7.1) Pipeline — přesně to, co testuje test-month.mjs
  console.log('── 📦 SEED testovacích objednávek z month-exportu ───────────────────');
  let P;
  try {
    P = await runMonthPipeline(exportPath, { quiet: true });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const { onlyReal, beers, packages } = P;

  if (onlyReal.length === 0) {
    console.error('❌ Pipeline nenašla žádné objednávky k propisování.');
    process.exit(1);
  }

  // 7.2) Whitelist
  if (useWhitelist) {
    const senders = onlyReal.map((r) => r.order.sender);
    const added = await whitelistSenders(senders);
    console.log(`   📋 whitelist odesílatelů: ${added > 0 ? `přidáno ${added}` : 'vše už bylo povoleno'}`);
  } else {
    console.log('   📋 whitelist přeskočen (--no-whitelist) — zprávy se načtou jen pokud je whitelist prázdný');
  }

  // 7.3) Vložení zpráv — buď přímo do DB, nebo přes whatsapp-webhook edge funkci
  const stamp = Date.now().toString(36);
  const inserted = [];
  for (let i = 0; i < onlyReal.length; i++) {
    const r = onlyReal[i];
    const o = r.order;
    const ts = `${o.date}T${padTime(o.time)}:00`; // validní ISO timestamp (padTime = oprava Invalid Date)
    const wid = `${WID_PREFIX}${o.orderIndex + 1}-${stamp}`;
    const text = o.text + (useMarker ? MARKER : '');
    if (viaWebhook) {
      // Stejná cesta jako Make/Tasker → zpráva v aplikaci "přijde" jako nová
      // WhatsApp zpráva (realtime notifikace, dedup přes webhook_id).
      const res = await fetch(`${SU}/functions/v1/whatsapp-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: o.sender,
          message: text,
          timestamp: ts,
          webhookId: wid,
          messageType: 'text',
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.id) {
        inserted.push({ id: body.id });
      } else {
        console.log(`   ❌ webhook #${o.orderIndex + 1} [${o.sender}] (HTTP ${res.status}): ${JSON.stringify(body)}`);
      }
    } else {
      const payload = {
        sender_name: o.sender,
        message_text: text,
        message_timestamp: ts,
        webhook_timestamp: ts,
        message_type: 'text',
        status: 'pending',
        webhook_id: wid,
        created_at: ts,
      };
      const { status, data } = await rest('whatsapp_incoming', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      if (status === 201 && Array.isArray(data) && data[0]?.id) {
        inserted.push(data[0]);
      } else {
        console.log(`   ❌ chyba při vkládání #${o.orderIndex + 1} (HTTP ${status}): ${JSON.stringify(data)}`);
      }
    }
  }
  console.log(
    `   ✅ vloženo zpráv do whatsapp_incoming: ${inserted.length}/${onlyReal.length}` +
    ` (status pending${viaWebhook ? ', přes whatsapp-webhook' : ''})`
  );

  // 7.4) Očekávané výsledky (z AI keše / reportu) — pro kontrolu v aplikaci
  console.log('\n── 📋 OČEKÁVANÉ VÝSLEDKY (porovnej s aplikací) ─────────────────────');
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of onlyReal) {
    const o = r.order;
    const idx = o.orderIndex + 1;
    const placeTag = r.matched
      ? (r.matched.fuzzy ? `~ ${r.matched.place.name}` : r.matched.place.name)
      : (r.placeName ? `⚠️ "${r.placeName}" (není v DB)` : '⚠️ — odběratel nenalezen');
    const items = (r.items || []).map((it) => {
      const beer = beers.find((b) => b.id === it.beer_id);
      const pkg = packages.find((p) => p.id === it.package_id);
      return `${it.quantity}× ${beer ? beer.name : (it.beer_name || '?')}${pkg ? ` ${pkg.label}` : ''}`;
    }).join(', ');
    console.log(`   ${pad('#' + idx, 4)} [${o.date} ${o.time}] ${pad(o.sender, 26)} → odběratel: ${pad(placeTag, 30)} | ${items}`);
  }


  // 7.5) Serverové parsování, aby zprávy byly v aplikaci připravené
  if (doServerParse) {
    console.log('\n── 🤖 Spouštím serverové AI parsování… ─────────────────────────────');
    await triggerServerParse();
  } else {
    console.log('\n   (--no-parse: zprávy zůstávají pending — rozparsuje je aplikace)');
  }

  // 7.5b) Bezpečnostní síť — co serverové AI nestihlo (pending/error, např. došel
  // kredit Anthropic API), doplníme z ověřené AI keše pipeline (stejný AI parsing
  // jako test-month.mjs). Zprávy pak v aplikaci vypadají jako 'parsed' a jdou
  // zkontrolovat a importovat.
  console.log('\n── 💾 Kontroluji stav zpráv a doplňuji z AI keše… ──────────────────');
  await prefillFromPipeline();
  const seededNow = await findSeededMessages();
  const byStatus = {};
  for (const m of seededNow) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
  console.log('   stav zpráv:', JSON.stringify(byStatus));

  // 7.6) Instrukce
  console.log(`
── ✅ HOTOVO — teď zkontroluj v aplikaci ─────────────────────────────
   1) Otevři aplikaci → záložka "Objednávky".
   2) Klikni "🤖 Automatické zpracování WhatsApp".
   3) Pokud je tlačítko "Zpracovat automaticky" aktivní, klikni na něj.
   4) U každé zprávy zkontroluj rozparsovaná data a potvrdí ✓ (import).
      Rozparsované položky i odběratele vidíš po kliknutí na zprávu.
   5) Vzniklé objednávky (zdroj: WhatsApp, poznámka obsahuje marker
      "[TEST z month-exportu…]") zkontroluj proti tabulce nahoře a proti
      souboru scripts/test-month-output.txt.
   6) Po kontrole smaž test:
        node scripts/seed-whatsapp-inbox.mjs --clear-orders
   (objednávky v aplikaci můžeš smazat i ručně — smažou se zprávy i objednávky)`);
}

await main().catch((e) => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});

