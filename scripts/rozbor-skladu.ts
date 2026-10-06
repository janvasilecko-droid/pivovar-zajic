// 🔎 Rozbor skladu nad ostrými daty — JEN ČTE.
// ---------------------------------------------------------------------------
// Z provozu 1. 10. 2026: „nesedí mi data v inventuře… musíš k nim mít
// přístup, ať to neděláš naslepo." Přihlásí se jako běžný uživatel appky
// (PIVOVAR_EMAIL, PIVOVAR_HESLO z nastavení cloudového prostředí — nikdy
// z chatu ani z gitu), načte stejné tabulky jako Sklad a vypíše:
//   • pohyby vybraného piva a obalu za měsíc se stavem po každém pohybu,
//   • očekávaný stav pro měsíční inventuru vs. napočítaná inventura,
//   • podezřelé zápisy (lib/kontrolaPohybu.ts),
//   • objednávky podle jména (např. Maneo, Mutěnice): položky, odpočty,
//     vrácení.
//
// Spuštění (v cloudovém prostředí musí síť povolit sasqexjadvlqyticxwja.supabase.co
// a zajic-pivovar.pages.dev; NODE_USE_ENV_PROXY pustí Node přes proxy prostředí):
//   npm run -s rozbor-skladu -- --mesic 2026-09 --pivo "12° Světlá" --obal "50"
//   npm run -s rozbor-skladu -- --mesic 2026-09 --objednavky "Maneo,Mutěnice"
//
// Veřejný (anon) klíč je v každé stránce appky — skript si ho vezme
// z PIVOVAR_ANON_KEY, jinak ho přečte z nasazené appky.
import { createClient } from '@supabase/supabase-js';
import { buildMovements, expectedForMonth, konecMesice, stockAsOf, stockForMonth, stockKey, type Movement } from '../src/lib/stockLedger';
import { najdiChybejiciZdrojSudu, najdiPodezrele } from '../src/lib/kontrolaPohybu';
// Ne z sdilenaData.ts — ta při načtení zakládá klienta appky z VITE_* proměnných
// a skript na tom padal dřív, než se vůbec přihlásil.
import { SLOUPCE } from '../src/lib/sdilenaDataSloupce';

const URL_DB = process.env.PIVOVAR_SUPABASE_URL || 'https://sasqexjadvlqyticxwja.supabase.co';
const APPKA = process.env.PIVOVAR_APP_URL || 'https://zajic-pivovar.pages.dev';

function arg(nazev: string): string | undefined {
  const i = process.argv.indexOf(`--${nazev}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function anonKlic(): Promise<string> {
  if (process.env.PIVOVAR_ANON_KEY) return process.env.PIVOVAR_ANON_KEY;
  const html = await (await fetch(`${APPKA}/`)).text();
  const skripty = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of skripty) {
    const js = await (await fetch(`${APPKA}${s}`)).text();
    for (const m of js.matchAll(/eyJhbGciOi[\w-]+\.([\w-]+)\.[\w-]+/g)) {
      try {
        const p = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        if (p.role === 'anon' && URL_DB.includes(p.ref)) return m[0];
      } catch { /* jiný token */ }
    }
  }
  throw new Error('Veřejný klíč appky se nepodařilo najít — nastav PIVOVAR_ANON_KEY.');
}

async function main() {
  const email = process.env.PIVOVAR_EMAIL;
  const heslo = process.env.PIVOVAR_HESLO;
  if (!email || !heslo) {
    console.error('Chybí PIVOVAR_EMAIL / PIVOVAR_HESLO v prostředí (nastavení cloudového prostředí → Environment variables).');
    process.exit(2);
  }
  // Zástupný text („…") místo skutečných údajů dopadne na serveru jako
  // „Invalid login credentials" a vypadá to jako špatné heslo.
  if (!email.includes('@')) {
    console.error('PIVOVAR_EMAIL není e-mail (je v něm jen zástupný text?) — v nastavení cloudového prostředí musí být skutečné přihlašovací údaje do appky.');
    process.exit(2);
  }
  const db = createClient(URL_DB, await anonKlic(), { auth: { persistSession: false } });
  const { error: chybaPrihlaseni } = await db.auth.signInWithPassword({ email, password: heslo });
  if (chybaPrihlaseni) throw new Error('Přihlášení selhalo: ' + chybaPrihlaseni.message);

  async function vse(tabulka: string, sloupce: string): Promise<any[]> {
    const out: any[] = [];
    for (let od = 0; ; od += 1000) {
      const { data, error } = await db.from(tabulka).select(sloupce).range(od, od + 999);
      if (error) throw new Error(`${tabulka}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  }

  const [piva, obaly, bottling, kegging, fasovani, prodejna, odpisy, inventura, dorovnani, odpocty, akce, prefuk, objednavky, polozky] = await Promise.all([
    vse('beers', 'id,name'),
    vse('packages', 'id,label,kind,volume_l'),
    vse('bottling', SLOUPCE.bottling),
    vse('kegging', SLOUPCE.kegging),
    vse('fasovani', SLOUPCE.fasovani),
    // + created_at: zápis z Fasování (Prodejna) jde jinak v --zapsano-od přehlédnout.
    vse('fasovani_private', `${SLOUPCE.fasovani_private},created_at`),
    vse('writeoffs', SLOUPCE.writeoffs),
    vse('inventory', SLOUPCE.inventory),
    vse('inventory_adjustments', SLOUPCE.inventory_adjustments),
    vse('zavoz_deductions', SLOUPCE.zavoz_deductions),
    vse('akce', SLOUPCE.akce),
    vse('keg_prefuk', SLOUPCE.keg_prefuk),
    vse('orders', 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered,note,created_at'),
    vse('order_items', 'id,order_id,beer_id,package_id,quantity'),
  ]);
  const pohyby = buildMovements({
    inventoryRows: inventura, bottlingRows: bottling, keggingRows: kegging, fasovaniRows: fasovani,
    prodejnaRows: prodejna, writeoffsRows: odpisy, zavozDeductionRows: odpocty, akceRows: akce,
    prefukRows: prefuk, adjustmentRows: dorovnani, packages: obaly,
  });
  const jmenoPiva = new Map(piva.map((b: any) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((p: any) => [p.id, p.label]));
  const objPodleId = new Map(objednavky.map((o: any) => [o.id, o]));
  const mesic = arg('mesic') || new Date().toISOString().slice(0, 7);
  const od = `${mesic}-01`;
  const doDne = konecMesice(mesic);
  console.log(`Načteno: ${pohyby.length} pohybů, ${objednavky.length} objednávek. Měsíc ${mesic}.`);

  // ── Pohyby jednoho piva × obalu se stavem po každém pohybu ──
  const pivoArg = arg('pivo');
  const obalArg = arg('obal');
  if (pivoArg) {
    // VŠECHNA piva, která jménu odpovídají — ne jen první. Dvě piva se
    // stejným jménem (5. 10. 2026: „10ka je tam zase 2× všechno") mají
    // každé svoje zápisy a s prvním nalezeným by druhá půlka ve výpisu chyběla.
    const nalezenaPiva = piva.filter((b: any) => b.name.toLowerCase().includes(pivoArg.toLowerCase()));
    // „--obal KEG" (sudy) — v názvu obalu slovo KEG není („50l", „30l"),
    // sud se pozná podle druhu obalu.
    const jenSudy = !!obalArg && /^(keg|kegy|sud|sudy)$/i.test(obalArg.trim());
    const kandidati = obaly.filter((p: any) => !obalArg
      || (jenSudy ? p.kind === 'keg' : String(p.label).toLowerCase().includes(obalArg.toLowerCase())));
    if (!nalezenaPiva.length) throw new Error(`Pivo „${pivoArg}" nenalezeno.`);
    if (nalezenaPiva.length > 1) {
      console.log(`Pozor: „${pivoArg}" odpovídá ${nalezenaPiva.length} pivům: ${nalezenaPiva.map((b: any) => `${b.name} [${b.id.slice(0, 8)}]`).join(', ')}`);
    }
    for (const pivo of nalezenaPiva) for (const obal of kandidati) {
      const k = stockKey(pivo.id, obal.id);
      const mojePohyby = pohyby.filter((m) => stockKey(m.beer_id, m.package_id) === k);
      if (!mojePohyby.some((m) => m.date >= od && m.date <= doDne)) continue;
      console.log(`\n══ ${pivo.name}${nalezenaPiva.length > 1 ? ` [${pivo.id.slice(0, 8)}]` : ''} · ${obal.label} ══`);
      const predtim = new Date(od + 'T00:00:00Z'); predtim.setUTCDate(predtim.getUTCDate() - 1);
      let stav = stockAsOf(pohyby, predtim.toISOString().slice(0, 10)).get(k)?.qty ?? 0;
      console.log(`stav ${predtim.toISOString().slice(0, 10)} večer: ${stav}`);
      // V rámci dne: počáteční stav je RÁNO (první), napočítaná inventura
      // ZÁVĚR dne (poslední) — stejně jako ve stockLedger.ts. Jinak by se
      // pohyby posledního dne přičetly až k napočítanému číslu.
      const poradiVeDni = (m: Movement) => (m.kind !== 'inventura' ? 1 : /fyzick|schválen|schvalen/i.test(m.note ?? '') ? 2 : 0);
      const vMesici = mojePohyby.filter((m) => m.date >= od && m.date <= doDne)
        .sort((a, b) => a.date.localeCompare(b.date) || poradiVeDni(a) - poradiVeDni(b));
      for (const m of vMesici) {
        if (poradiVeDni(m) === 2) console.log(`            podle pohybů před inventurou: ${stav}, napočítáno ${m.qty} → rozdíl ${m.qty - stav > 0 ? '+' : ''}${m.qty - stav}`);
        stav = m.kind === 'inventura' ? m.qty : stav + m.qty;
        const komu = m.orderId ? (objPodleId.get(m.orderId)?.place_name ?? `objednávka ${m.orderId.slice(0, 8)} (NEEXISTUJE)`) : '';
        const stavObj = m.orderId && objPodleId.get(m.orderId)?.status === 'storno' ? ' [STORNO]' : '';
        console.log(`${m.date}  ${m.kind.padEnd(13)} ${(m.kind === 'inventura' ? '= ' : m.qty > 0 ? '+' : '') + m.qty}`.padEnd(40)
          + ` → ${stav}   ${komu}${stavObj} ${m.note ? `| ${m.note}` : ''}`);
      }
      const ocek = expectedForMonth(pohyby, mesic).get(k);
      const napocitano = inventura.filter((r: any) => r.beer_id === pivo.id && r.package_id === obal.id && String(r.entry_date).slice(0, 7) === mesic && /Fyzick|Schválen/.test(r.note ?? ''));
      console.log(`Očekáváno pro inventuru: ${ocek?.qty ?? '—'} (základ ${ocek?.baselineQty ?? '—'} ${ocek?.baselineNote ?? ''})`);
      console.log(`  po druzích: ${JSON.stringify(ocek?.byKind ?? {})}`);
      console.log(`Napočítaná inventura: ${napocitano.map((r: any) => `${r.entry_date}: ${r.quantity} (${r.note})`).join(', ') || '—'}`);
      const nalezy = najdiPodezrele({ pohyby, objednavky, polozky, od, doDne, beerId: pivo.id, packageId: obal.id });
      console.log(nalezy.length ? 'Podezřelé:' : 'Podezřelé: nic');
      nalezy.forEach((n) => console.log(`  [${n.vaha}] ${n.datum} ${n.text}${n.dopad ? ` (sklad ${n.dopad > 0 ? '+' : ''}${n.dopad})` : ''}`));
    }
  }

  // ── Audit: Inventura vs. Sklad za měsíc, položku po položce ──
  // 5. 10. 2026: „mám rozdílná data, audit vs sklad, musí být stejný" a
  // „v inventuře očekávání musí být stejná data jako ve skladu". Inventura
  // počítá od zapsaného Počátečního stavu, Sklad od stavu dopočítaného
  // z historie; rozdíl je vždycky v počátku (chybí nebo nesedí zápis).
  if (process.argv.includes('--audit')) {
    const inv = expectedForMonth(pohyby, mesic, true);
    const sklad = stockForMonth(pohyby, mesic);
    const klice = [...new Set([...inv.keys(), ...sklad.keys()])];
    const rozdily = klice.map((k) => ({ k, i: inv.get(k), s: sklad.get(k) }))
      .filter(({ i, s }) => (i?.qty ?? 0) !== (s?.qty ?? 0));
    console.log(`\n══ Audit ${mesic}: Inventura (zapsaný počátek) ≠ Sklad (dopočítaný počátek) — ${rozdily.length} položek ══`);
    rozdily.forEach(({ k, i, s }) => {
      const [b, p] = k.split('__');
      console.log(`  ${jmenoPiva.get(b)} · ${jmenoObalu.get(p)}: inventura ${i?.qty ?? 0} (počátek ${i?.baselineQty ?? 0} ${i?.baselineNote ?? ''}) · sklad ${s?.qty ?? 0} (počátek ${s?.baselineQty ?? 0})`);
    });
  }

  // ── Stáčení lahví bez zdrojového sudu (sud se ve skladu neodečetl) ──
  // 5. 10. 2026: „v rozboru ti chybí sudy ze stáčení lahví u 12sv". Stejná
  // kontrola jako tlačítko „Najít možné chyby" v Pohybech.
  if (pivoArg) {
    for (const pivo of piva.filter((b: any) => b.name.toLowerCase().includes(pivoArg.toLowerCase()))) {
      const bezSudu = najdiChybejiciZdrojSudu(bottling, { od, doDne, beerId: pivo.id });
      console.log(`\n══ ${pivo.name}: stáčení lahví bez zdrojového sudu v ${mesic} (${bezSudu.length}) ══`);
      // Nález je na dávku; vypíše se každý den jednou se všemi jeho řádky.
      [...new Set(bezSudu.map((n) => n.datum))].forEach((datum) => {
        const radky = bottling.filter((r: any) => r.beer_id === pivo.id && String(r.entry_date).slice(0, 10) === datum
          && Number(r.quantity) > 0 && !(Number(r.kegs_used || 0) > 0 && r.kegs_used_package_id));
        const litru = radky.reduce((a: number, r: any) => a + Number(r.quantity) * (Number(obaly.find((p: any) => p.id === r.package_id)?.volume_l) || 0), 0);
        console.log(`  ${datum}: ${radky.map((r: any) => `${r.quantity}× ${jmenoObalu.get(r.package_id)}${r.note ? ` (${String(r.note).split('\n')[0].slice(0, 50)})` : ''}`).join(', ')} — ${Math.round(litru)} l bez odečteného sudu`);
      });
    }
  }

  // ── Objednávky podle jména ──
  const objArg = arg('objednavky');
  if (objArg) {
    for (const jmeno of objArg.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const nalezene = objednavky
        .filter((o: any) => (o.place_name ?? '').toLowerCase().includes(jmeno))
        .filter((o: any) => (o.delivery_date || o.order_date || '').slice(0, 7) >= mesic.slice(0, 7) || o.status === 'storno')
        .sort((a: any, b: any) => String(a.delivery_date || a.order_date).localeCompare(String(b.delivery_date || b.order_date)));
      console.log(`\n══ Objednávky „${jmeno}" (od ${mesic}) ══`);
      for (const o of nalezene) {
        console.log(`\n${o.place_name} · závoz ${o.delivery_date ?? '?'} (${o.delivery_day ?? ''}) · objednáno ${o.order_date} · stav ${o.status}${o.is_delivered ? ' · zavezeno' : ''}`);
        if (o.note) console.log(`  pozn.: ${String(o.note).replace(/\n/g, ' / ')}`);
        polozky.filter((p: any) => p.order_id === o.id).forEach((p: any) =>
          console.log(`  položka: ${p.quantity}× ${jmenoObalu.get(p.package_id)} ${jmenoPiva.get(p.beer_id)}`));
        odpocty.filter((d: any) => d.order_id === o.id).forEach((d: any) =>
          console.log(`  ODPOČET ${d.deduct_date}: −${d.quantity}× ${jmenoObalu.get(d.package_id)} ${jmenoPiva.get(d.beer_id)}`));
        dorovnani.filter((a: any) => a.order_id === o.id).forEach((a: any) =>
          console.log(`  VRÁCENO ${a.entry_date}: +${a.quantity}× ${jmenoObalu.get(a.package_id)} ${jmenoPiva.get(a.beer_id)} | ${a.reason ?? ''}`));
        // Zrušená objednávka má mít u každého piva × obalu vráceno tolik,
        // kolik se odepsalo — jinak kusy ve skladu chybí (nebo přebývají).
        if (o.status === 'storno') {
          const bilance = new Map<string, number>();
          odpocty.filter((d: any) => d.order_id === o.id).forEach((d: any) => bilance.set(stockKey(d.beer_id, d.package_id), (bilance.get(stockKey(d.beer_id, d.package_id)) ?? 0) - Number(d.quantity || 0)));
          dorovnani.filter((a: any) => a.order_id === o.id && a.beer_id).forEach((a: any) => bilance.set(stockKey(a.beer_id, a.package_id), (bilance.get(stockKey(a.beer_id, a.package_id)) ?? 0) + Number(a.quantity || 0)));
          bilance.forEach((v, k) => {
            const [b, p] = k.split('__');
            console.log(v === 0
              ? `  ✓ ${jmenoObalu.get(p)} ${jmenoPiva.get(b)}: odepsáno i vráceno stejně`
              : `  ⚠️ ${jmenoObalu.get(p)} ${jmenoPiva.get(b)}: ${v < 0 ? `vráceno o ${-v} míň, než se odepsalo — sklad je o ${-v} níž` : `vráceno o ${v} víc, než se odepsalo — sklad je o ${v} výš`}`);
          });
        }
      }
    }
  }

  // ── Co se zapsalo od zadaného dne (i se zpětným datem) ──
  // 5. 10. 2026: „o víkendu odešly sudy… zadával jsem dnes se zpětným
  // datem" — podle data pohybu se takový zápis hledá špatně, podle času
  // zápisu (created_at) je vidět hned, kam a s jakým datem dopadl.
  const zapsanoOd = arg('zapsano-od');
  if (zapsanoOd) {
    const zdroje: [string, any[], string][] = [
      ['stáčení lahví', bottling, 'entry_date'], ['stáčení sudů', kegging, 'entry_date'],
      ['fasování', fasovani, 'entry_date'], ['prodejna', prodejna, 'entry_date'], ['odpis', odpisy, 'entry_date'],
      ['inventura', inventura, 'entry_date'], ['dorovnání', dorovnani, 'entry_date'],
      ['závoz', odpocty, 'deduct_date'],
    ];
    const zapsane = zdroje.flatMap(([co, radky, sloupecData]) => radky
      .filter((r: any) => String(r.created_at ?? '') >= zapsanoOd)
      .map((r: any) => ({ co, r, datum: String(r[sloupecData] ?? '?').slice(0, 10) })))
      .sort((a, b) => String(a.r.created_at).localeCompare(String(b.r.created_at)));
    console.log(`\n══ Zapsáno od ${zapsanoOd} (${zapsane.length}) ══`);
    zapsane.forEach(({ co, r, datum }) => {
      const sudy = Number(r.kegs_used || 0)
        ? ` · sudů na to ${r.kegs_used}× ${r.kegs_used_package_id ? jmenoObalu.get(r.kegs_used_package_id) : 'BEZ OBALU SUDU'}` : '';
      console.log(`  zapsáno ${String(r.created_at).slice(0, 16)} · ${co.padEnd(13)} · k datu ${datum} · ${r.quantity}× ${jmenoObalu.get(r.package_id) ?? '?'} ${jmenoPiva.get(r.beer_id) ?? '?'} [${String(r.beer_id ?? '').slice(0, 8)}]${sudy}${r.note ? ` | ${String(r.note).replace(/\n/g, ' / ').slice(0, 80)}` : ''}`);
    });

    // Objednávky zapsané od toho dne a jestli se jejich položky odečetly ze
    // skladu. Den závozu stejně jako computeDeliveryDateISO v appce
    // (ucinny_den_zavozu v databázi; zavozDeduction.ts jde importovat jen
    // s klientem appky, proto opsáno).
    const ucinnyDen = (o: any): string => {
      if (o.delivery_date) return String(o.delivery_date).slice(0, 10);
      const den = String(o.delivery_day || 'pa').split('/')[0].trim();
      const posun = ({ po: 0, ut: 1, st: 2, ct: 3, pa: 4, so: 5, ne: 6 } as Record<string, number>)[den] ?? 4;
      const objednano = String(o.order_date).slice(0, 10);
      const d = new Date(objednano + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + posun);
      // Jako ucinny_den_zavozu: den, který už byl před objednáním = příští týden.
      if (d.toISOString().slice(0, 10) < objednano) d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    };
    const odectenePolozky = new Set(odpocty.map((d: any) => d.order_item_id).filter(Boolean));
    const noveObj = objednavky.filter((o: any) => String(o.created_at ?? '') >= zapsanoOd)
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    console.log(`\n══ Objednávky zapsané od ${zapsanoOd} (${noveObj.length}) ══`);
    for (const o of noveObj) {
      console.log(`  zapsáno ${String(o.created_at).slice(0, 16)} · ${o.place_name} · závoz ${ucinnyDen(o)} · stav ${o.status}`);
      polozky.filter((p: any) => p.order_id === o.id).forEach((p: any) =>
        console.log(`    ${p.quantity}× ${jmenoObalu.get(p.package_id)} ${jmenoPiva.get(p.beer_id)} — ${odectenePolozky.has(p.id) ? 'odečteno' : 'NEODEČTENO'}`));
    }
    // Každá položka se závozem do dneška (bez storna) má mít odpočet.
    const dnes = new Date().toISOString().slice(0, 10);
    const chybi = polozky.filter((p: any) => {
      const o = objPodleId.get(p.order_id);
      return o && o.status !== 'storno' && Number(p.quantity) > 0 && ucinnyDen(o) <= dnes && !odectenePolozky.has(p.id);
    });
    console.log(`\n══ Položky se závozem do dneška BEZ odpočtu ze skladu (${chybi.length}) ══`);
    chybi.forEach((p: any) => {
      const o = objPodleId.get(p.order_id);
      console.log(`  závoz ${ucinnyDen(o)} · ${o.place_name} · ${p.quantity}× ${jmenoObalu.get(p.package_id)} ${jmenoPiva.get(p.beer_id)} · objednávka zapsána ${String(o.created_at ?? '?').slice(0, 16)}`);
    });
  }

  // ── Ztráty / dorovnání bez objednávky v měsíci (co inventura bere jako ztráty) ──
  const bezObj = dorovnani.filter((a: any) => String(a.entry_date).slice(0, 7) === mesic && !a.order_id);
  if (bezObj.length && (pivoArg || objArg)) {
    console.log(`\n══ Dorovnání bez objednávky v ${mesic} (${bezObj.length}) ══`);
    // Zapsáno kdy: řádky se stejným časem zápisu k poslednímu dni měsíce
    // vznikly jedním uložením inventury — stará verze appky tak přepsala
    // vrácení i týdenní dorovnání na „ztráty" bez objednávky a důvodu.
    bezObj.forEach((a: any) => console.log(`  ${a.entry_date} ${a.quantity > 0 ? '+' : ''}${a.quantity}× ${jmenoObalu.get(a.package_id)} ${jmenoPiva.get(a.beer_id)} | ${a.reason ?? '(bez důvodu = ztráta)'} | zapsáno ${String(a.created_at ?? '?').slice(0, 16)}`));
  }
  await db.auth.signOut();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

// Typ jen kvůli importu (pohyby se skládají v buildMovements).
export type { Movement };
