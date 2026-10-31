import postgres from 'npm:postgres@3.4.9';
import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { chyba, corsHlavicky, hotovo, nactiJson, overUzivatele, sluzebniKlic, tokenZHlavicky } from '../_shared/brana.ts';
import { adresaSeznamuSql, JMENO_MIGRACE, prekazkaTransakce, sqlMigrace } from '../_shared/migrace.ts';

/**
 * 🗄️ bible-migrace — migrace DATABÁZE BIBLE z appky (Systém → Databázové
 * migrace → Databáze bible), stejně jako pust-migraci u hlavní databáze.
 *
 *   { akce: 'seznam' }          → které migrace už v projektu bible běžely
 *   { akce: 'spustit', nazev }  → pustí jednu migraci
 *
 * Kdo smí: administrátor appky (role admin v hlavním projektu, ověří brána,
 * fail-closed). SQL se bere z nasazené appky (/migrace-bible-sql.json),
 * appka posílá jen jméno.
 *
 * Jak: přímé spojení do databáze projektu bible (SUPABASE_DB_URL, které
 * Supabase funkci dává samo) a JEDNA transakce: migrace + zápis do evidence
 * migrace_aplikovane. Spadne-li cokoli, nezapíše se nic. Tak jde pustit
 * i úplně první migrace, která evidenci teprve zakládá.
 */

const MAX_TELO = 2 * 1024;

Deno.serve(async (req: Request) => {
  const cors = corsHlavicky(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return chyba(cors, 405, 'metoda', 'bible-migrace bere jen POST.');

  const token = tokenZHlavicky(req.headers.get('Authorization'));
  if (!token) return chyba(cors, 401, 'neprihlasen', 'Přihlášení je povinné.');

  let telo: Record<string, unknown>;
  try {
    telo = await nactiJson(req, MAX_TELO);
  } catch {
    return chyba(cors, 400, 'neplatny_vstup', 'Neplatný požadavek.');
  }

  const overeni = await overUzivatele(token, { anonKlic: Deno.env.get('HLAVNI_ANON_KEY') });
  if (!overeni.ok) return chyba(cors, overeni.status, overeni.kod, overeni.zprava);
  if (overeni.uzivatel.admin !== true) {
    return chyba(cors, 403, 'zakazano', 'Migrace databáze bible smí spustit jen administrátor.');
  }

  if (telo.akce === 'seznam') {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const klic = sluzebniKlic((jmeno) => Deno.env.get(jmeno));
    if (!url || !klic) return chyba(cors, 503, 'nenastaveno', 'Projekt bible nemá adresu nebo klíč služby.');
    const db = createClient(url, klic, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await db.from('migrace_aplikovane').select('nazev,aplikovano_at').order('nazev');
    if (error) {
      // Úplně nový projekt: evidence ještě není — první migrace ji založí.
      if (error.code === 'PGRST205' || error.code === '42P01') return hotovo(cors, { evidence: false, aplikovane: [] });
      console.error(`bible-migrace seznam: chyba databáze ${error.code ?? '?'}`);
      return chyba(cors, 503, 'chyba', 'Evidenci migrací bible se nepodařilo přečíst.');
    }
    return hotovo(cors, { evidence: true, aplikovane: data ?? [] });
  }

  if (telo.akce !== 'spustit') return chyba(cors, 400, 'neplatny_vstup', 'Neznámá akce.');
  const nazev = typeof telo.nazev === 'string' ? telo.nazev.trim() : '';
  if (!JMENO_MIGRACE.test(nazev)) return chyba(cors, 400, 'neplatny_vstup', 'Neplatný název migrace.');

  let seznam: unknown;
  try {
    const r = await fetch(adresaSeznamuSql(Deno.env.get('APP_URL'), Date.now()), { cache: 'no-store' });
    if (!r.ok) return chyba(cors, 502, 'bez_seznamu', `Seznam SQL migrací bible se nepodařilo stáhnout (HTTP ${r.status}).`);
    seznam = await r.json();
  } catch {
    return chyba(cors, 502, 'bez_seznamu', 'Seznam SQL migrací bible se nepodařilo stáhnout.');
  }
  const sqlText = sqlMigrace(seznam, nazev);
  if (!sqlText) {
    return chyba(cors, 404, 'neni_v_buildu', `Migrace ${nazev} v nasazené appce není — počkej, až se appka nasadí, a zkus to znovu.`);
  }
  const prekazka = prekazkaTransakce(sqlText);
  if (prekazka) return chyba(cors, 400, 'neplatna_migrace', prekazka);

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return chyba(cors, 503, 'nenastaveno', 'Funkce nemá spojení do databáze bible (SUPABASE_DB_URL).');
  const zdroj = `appka: ${overeni.uzivatel.email ?? overeni.uzivatel.uid}`;

  // prepare: false — spojení může jít přes pooler; bez parametrů jde SQL
  // migrace jednoduchým protokolem (víc příkazů najednou).
  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15, onnotice: () => undefined });
  try {
    const vysledek = await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '110s'");
      await tx.unsafe("SET LOCAL lock_timeout = '15s'");
      // Dva admini naráz nepustí dvě migrace přes sebe.
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext('bible-migrace'))");
      const [{ evidence }] = await tx.unsafe("SELECT to_regclass('public.migrace_aplikovane') IS NOT NULL AS evidence");
      if (evidence) {
        const uz = await tx`SELECT aplikovano_at FROM public.migrace_aplikovane WHERE nazev = ${nazev}`;
        if (uz.length > 0) return { jizBylo: true, aplikovanoAt: new Date(uz[0].aplikovano_at as string | Date).toISOString() };
      }
      await tx.unsafe(sqlText);
      await tx`INSERT INTO public.migrace_aplikovane (nazev, zdroj) VALUES (${nazev}, ${zdroj}) ON CONFLICT (nazev) DO NOTHING`;
      return { jizBylo: false };
    });
    return hotovo(cors, { nazev, ...vysledek });
  } catch (e) {
    // Chybu z databáze říct doslova (vidí ji jen admin, ne veřejný log).
    const zprava = e instanceof Error ? e.message : String(e);
    console.error(`bible-migrace ${nazev}: spadla`);
    return chyba(cors, 500, 'migrace_spadla', `Migrace ${nazev} spadla: ${zprava.slice(0, 500)}`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
});
