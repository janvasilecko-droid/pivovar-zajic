// 🔎 Porovnání Exportu do Excelu s daty v appce — nad ostrými daty, JEN ČTE.
// ---------------------------------------------------------------------------
// Z provozu 1. 10. 2026: „porovnej export Excel a data v appce, že jsou 100%
// shodné". Načte stejné tabulky stejnými dotazy jako ExportExcelScreen.tsx,
// sestaví listy stejně jako export (bez záporných řádků = výchozí přepínač)
// a porovná je po pivu × obalu se skladovou knihou appky (Sklad, Pohyby,
// Inventura) za stejný měsíc. Vypíše každý rozdíl a jeho důvod.
//
//   npm run -s porovnej-export -- --mesic 2026-09
import { createClient } from '@supabase/supabase-js';
import { buildMovements, konecMesice, stockForMonth, stockKey } from '../src/lib/stockLedger';
import { SLOUPCE } from '../src/lib/sdilenaData';

const URL_DB = process.env.PIVOVAR_SUPABASE_URL || 'https://sasqexjadvlqyticxwja.supabase.co';
const APPKA = process.env.PIVOVAR_APP_URL || 'https://zajic-pivovar.pages.dev';
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function anonKlic(): Promise<string> {
  if (process.env.PIVOVAR_ANON_KEY) return process.env.PIVOVAR_ANON_KEY;
  const html = await (await fetch(`${APPKA}/`)).text();
  for (const s of [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])) {
    const js = await (await fetch(`${APPKA}${s}`)).text();
    for (const m of js.matchAll(/eyJhbGciOi[\w-]+\.([\w-]+)\.[\w-]+/g)) {
      try {
        const p = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        if (p.role === 'anon' && URL_DB.includes(p.ref)) return m[0];
      } catch { /* jiný token */ }
    }
  }
  throw new Error('Veřejný klíč appky nenalezen — nastav PIVOVAR_ANON_KEY.');
}

async function main() {
  const { PIVOVAR_EMAIL: email, PIVOVAR_HESLO: heslo } = process.env;
  if (!email || !heslo) { console.error('Chybí PIVOVAR_EMAIL / PIVOVAR_HESLO.'); process.exit(2); }
  const db = createClient(URL_DB, await anonKlic(), { auth: { persistSession: false } });
  const { error: e } = await db.auth.signInWithPassword({ email, password: heslo });
  if (e) throw new Error('Přihlášení selhalo: ' + e.message);
  const vse = async (t: string, s: string): Promise<any[]> => {
    const out: any[] = [];
    for (let od = 0; ; od += 1000) {
      const { data, error } = await db.from(t).select(s).range(od, od + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  };

  const mesic = arg('mesic') || new Date().toISOString().slice(0, 7);
  const od = `${mesic}-01`;
  const doDne = konecMesice(mesic);

  // Stejné dotazy jako ExportExcelScreen.tsx
  const [obaly, piva, fasovani, prodejna, odpisy, bottling, kegging, inventura, odpocty, akce, prefuk, dorovnani] = await Promise.all([
    vse('packages', 'id,label,kind,volume_l'),
    vse('beers', 'id,name,is_active'),
    vse('fasovani', 'entry_date,beer_id,beer_name,package_id,quantity,who,note'),
    vse('fasovani_private', 'entry_date,beer_id,beer_name,package_id,quantity,who,note'),
    vse('writeoffs', 'entry_date,beer_id,beer_name,package_id,quantity,who,reason'),
    vse('bottling', 'entry_date,beer_id,beer_name,package_id,quantity,note,kegs_used,kegs_used_package_id,source_volume_l,created_at'),
    vse('kegging', 'entry_date,beer_id,beer_name,package_id,quantity,note,cellar_tank_id,created_at'),
    vse('inventory', SLOUPCE.inventory),
    vse('zavoz_deductions', SLOUPCE.zavoz_deductions),
    vse('akce', SLOUPCE.akce),
    vse('keg_prefuk', SLOUPCE.keg_prefuk),
    vse('inventory_adjustments', SLOUPCE.inventory_adjustments),
  ]);
  const jmenoPiva = new Map(piva.map((b: any) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((p: any) => [p.id, p.label]));
  const nazev = (k: string) => { const [b, p] = k.split('__'); return `${jmenoPiva.get(b) ?? '?'} · ${jmenoObalu.get(p) ?? '?'}`; };
  const vMesici = (r: any) => r.entry_date >= od && r.entry_date <= doDne;

  // ── Appka: skladová kniha za měsíc (Sklad / Pohyby) ──
  const pohyby = buildMovements({
    inventoryRows: inventura, bottlingRows: bottling, keggingRows: kegging, fasovaniRows: fasovani,
    prodejnaRows: prodejna, writeoffsRows: odpisy, zavozDeductionRows: odpocty, akceRows: akce,
    prefukRows: prefuk, adjustmentRows: dorovnani, packages: obaly,
  });
  const kniha = stockForMonth(pohyby, mesic);
  const zKnihy = (druh: string) => {
    const m = new Map<string, number>();
    kniha.forEach((l, k) => { const v = Math.abs(l.byKind[druh as keyof typeof l.byKind] ?? 0); if (v) m.set(k, v); });
    return m;
  };

  // ── Export: listy stejně jako ExportExcelScreen.tsx (bez záporných) ──
  const seen = new Set<string>();
  const lahveRadky: any[] = [];
  const sudyNaLahve: any[] = [];
  for (const r of bottling) {
    lahveRadky.push(r);
    if (Number(r.kegs_used) > 0 && r.kegs_used_package_id) {
      const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}|${r.created_at || r.note || ''}`;
      if (!seen.has(key)) { seen.add(key); sudyNaLahve.push({ ...r, package_id: r.kegs_used_package_id, quantity: r.kegs_used }); }
    }
  }
  // sOpravami = jako řádek „Celkem" v exportu (připočítává i záporné opravy).
  const souctyExportu = (radky: any[], sOpravami = false) => {
    const m = new Map<string, number>();
    for (const r of radky) {
      if (!vMesici(r) || !r.beer_id || !r.package_id) continue;
      if (!sOpravami && !(Number(r.quantity) > 0)) continue;
      const k = stockKey(r.beer_id, r.package_id);
      m.set(k, (m.get(k) ?? 0) + Number(r.quantity));
    }
    if (sOpravami) m.forEach((v, k) => m.set(k, Math.abs(v)));
    return m;
  };

  let rozdilu = 0;
  const porovnej = (list: string, exportM: Map<string, number>, appM: Map<string, number>, zdroj: any[]) => {
    const klice = new Set([...exportM.keys(), ...appM.keys()]);
    const radky: string[] = [];
    for (const k of [...klice].sort((a, b) => nazev(a).localeCompare(nazev(b), 'cs'))) {
      const ex = exportM.get(k) ?? 0;
      const ap = appM.get(k) ?? 0;
      if (ex === ap) continue;
      const [b, p] = k.split('__');
      const zaporne = zdroj.filter((r) => vMesici(r) && r.beer_id === b && r.package_id === p && Number(r.quantity) < 0)
        .reduce((n, r) => n + Number(r.quantity), 0);
      const duvod = zaporne ? `záporné opravy ${zaporne} (export je vynechává, appka počítá)` : '';
      radky.push(`  ${nazev(k)}: export ${ex}, appka ${ap} (rozdíl ${ex - ap})${duvod ? ' — ' + duvod : ''}`);
      rozdilu++;
    }
    console.log(`\n${list}: ${radky.length ? `${radky.length} rozdílů` : 'shodné ✓'}`);
    radky.forEach((r) => console.log(r));
  };

  console.log(`Měsíc ${mesic} (${od} – ${doDne}). Porovnání po pivu × obalu (podle id, ne podle textu).`);
  porovnej('Stáčení KEG', souctyExportu(kegging), zKnihy('kegovani'), kegging);
  porovnej('Stáčení lahve — lahve', souctyExportu(lahveRadky), zKnihy('staceni'), bottling);
  porovnej('Stáčení lahve — sudy spotřebované', souctyExportu(sudyNaLahve), zKnihy('sud_na_lahve'), []);
  porovnej('Odběr personál', souctyExportu(fasovani), zKnihy('fasovani'), fasovani);
  porovnej('Fasování prodejna', souctyExportu(prodejna), zKnihy('prodejna'), prodejna);
  porovnej('Vzorky promo a PR', souctyExportu(odpisy), zKnihy('odpis'), odpisy);

  console.log('\n── Řádek „Celkem" v exportu (počítá i záporné opravy) proti appce ──');
  porovnej('Celkem Stáčení KEG', souctyExportu(kegging, true), zKnihy('kegovani'), []);
  porovnej('Celkem Stáčení lahve', souctyExportu(lahveRadky, true), zKnihy('staceni'), []);
  porovnej('Celkem Odběr personál', souctyExportu(fasovani, true), zKnihy('fasovani'), []);
  porovnej('Celkem Fasování prodejna', souctyExportu(prodejna, true), zKnihy('prodejna'), []);
  porovnej('Celkem Vzorky promo a PR', souctyExportu(odpisy, true), zKnihy('odpis'), []);

  // Export píše pivo podle uloženého TEXTU beer_name — když se pivo
  // přejmenovalo nebo se zapsalo s překlepem, v sešitu je pod jiným jménem.
  const jineJmeno = [...kegging, ...bottling, ...fasovani, ...prodejna, ...odpisy]
    .filter((r) => vMesici(r) && r.beer_id && jmenoPiva.get(r.beer_id) && (r.beer_name ?? '').trim() !== jmenoPiva.get(r.beer_id));
  console.log(`\nZápisy s jiným jménem piva než v appce: ${jineJmeno.length ? jineJmeno.length : 'žádné ✓'}`);
  const pocty = new Map<string, number>();
  jineJmeno.forEach((r) => { const k = `„${r.beer_name}" → ${jmenoPiva.get(r.beer_id)}`; pocty.set(k, (pocty.get(k) ?? 0) + 1); });
  pocty.forEach((n, k) => console.log(`  ${k} (${n}×)`));
  const bezId = [...kegging, ...bottling, ...fasovani, ...prodejna, ...odpisy].filter((r) => vMesici(r) && (!r.beer_id || !r.package_id));
  if (bezId.length) console.log(`Zápisy bez piva/obalu (appka je nepočítá, export ano): ${bezId.length}`);

  // Inventura: napočítaný stav v exportu = uložená Fyzická/Schválená inventura.
  const napoc = inventura.filter((r: any) => String(r.entry_date).slice(0, 7) === mesic && /fyzick|schválen|schvalen/i.test(r.note ?? ''));
  console.log(`\nInventura: v exportu ${napoc.length} napočítaných položek (stejné řádky jako uložená inventura v appce).`);
  console.log(`\nCelkem rozdílů: ${rozdilu}`);
  await db.auth.signOut();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
