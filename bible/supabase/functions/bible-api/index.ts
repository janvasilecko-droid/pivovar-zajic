import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import {
  chyba, corsHlavicky, hotovo, nactiJson, overUzivatele, sluzebniKlic, tokenZHlavicky, uroven, verejnyKlic,
  type Pristup, type Uzivatel,
} from '../_shared/brana.ts';
import {
  AKCE, ChybaVstupu, idDokumentu, jeAkce, PLATNOST_ODKAZU_S, popisDokumentu, prekladChybyDb, SLOUPCE_DOKUMENTU,
  souborKNahrani, stavDokumentu, zacatekObdobi, type Akce, type ChybaDb,
} from '../_shared/vstupy.ts';

/**
 * 📚 bible-api — jediný vstup appky do projektu bible (cegrelgvkygcatupqwrx).
 *
 * Databáze i úložiště bible jsou pro prohlížeč zavřené. Appka posílá sem
 * { akce, … } s tokenem z hlavního projektu; brána (_shared/brana.ts) ho
 * ověří v hlavním projektu i s právy do bible a teprve pak se pracuje
 * service rolí. Zapisuje se JEN přes SQL funkce projektu bible, které práva
 * hlídají znovu (bible_zaloz_nahrani, bible_potvrd_nahrani, …) — žádný
 * přímý insert/update/delete (hlídá test).
 *
 * Nahrání knihy (do 50 MB):
 *   1. zalozit_nahrani — řádek ve stavu „nahrava" + podepsaný odkaz (token)
 *      jen pro cestu <id>/<jméno>, bez přepsání existujícího souboru;
 *   2. prohlížeč nahraje soubor rovnou do úložiště bible;
 *   3. potvrdit_nahrani — soubor tam je a má ohlášenou velikost → fronta.
 *
 * Do logu nikdy token, odkaz ani obsah — jen akce a kód chyby.
 * verify_jwt = false (bible/supabase/config.toml): token hlavního projektu
 * by platforma tady odmítla; ověřuje ho brána.
 */

const BUCKET = 'knihovna';
const MAX_TELO = 32 * 1024;

type Kontext = {
  db: SupabaseClient;
  u: Uzivatel & { pristup: Pristup };
  telo: Record<string, unknown>;
  cors: Record<string, string>;
};

function chybaDb(cors: Record<string, string>, e: ChybaDb, akce: string): Response {
  const p = prekladChybyDb(e);
  if (p.kod === 'chyba') console.error(`bible-api ${akce}: chyba databáze ${e?.code ?? '?'}`);
  return chyba(cors, p.status, p.kod, p.zprava);
}

function chybaUloziste(cors: Record<string, string>, akce: string, co: string): Response {
  console.error(`bible-api ${akce}: úložiště nevydalo ${co}`);
  return chyba(cors, 502, 'uloziste', `Úložiště bible teď nevydalo ${co}. Zkus to znovu.`);
}

/**
 * Soubory, které dorazily ke smazanému dokumentu až po smazání (rozběhnuté
 * nahrání s platným odkazem): po vypršení odkazu je smaže přes Storage API.
 * Jen cesty, které si databáze zapamatovala při smazání (bible_smazane_soubory)
 * — nic hádaného. Chyba úklidu akci nezastaví; zkusí se při další.
 */
async function uklidSmazanych(db: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await db.rpc('bible_smazane_k_uklidu', { p_limit: 100 });
    if (error) return;
    const cesty = ((data ?? []) as { cesta?: unknown }[]).map((r) => r.cesta).filter((c): c is string => typeof c === 'string' && c.length > 0);
    if (cesty.length === 0) return;
    const { error: e2 } = await db.storage.from(BUCKET).remove(cesty);
    if (e2) {
      console.error('bible-api úklid: soubory smazaných dokumentů se nepodařilo smazat');
      return;
    }
    await db.rpc('bible_smazane_uklizeno', { p_cesty: cesty });
  } catch {
    console.error('bible-api úklid: neočekávaná chyba');
  }
}

const PROVEDENI: Record<Akce, (k: Kontext) => Promise<Response>> = {
  async dokumenty({ db, cors }) {
    const { data, error } = await db.from('bible_dokumenty').select(SLOUPCE_DOKUMENTU).order('created_at', { ascending: false });
    if (error) return chybaDb(cors, error, 'dokumenty');
    return hotovo(cors, data ?? []);
  },

  async nastaveni({ db, cors }) {
    const { data, error } = await db.from('bible_nastaveni').select('klic,hodnota');
    if (error) return chybaDb(cors, error, 'nastaveni');
    const radky = (data ?? []) as { klic: string; hodnota: unknown }[];
    return hotovo(cors, Object.fromEntries(radky.map((r) => [r.klic, r.hodnota])));
  },

  async odkaz({ db, telo, cors }) {
    const id = idDokumentu(telo);
    const { data, error } = await db.from('bible_dokumenty').select('soubor_cesta,stav').eq('id', id).maybeSingle();
    if (error) return chybaDb(cors, error, 'odkaz');
    const dok = data as { soubor_cesta: string; stav: string } | null;
    if (!dok) return chyba(cors, 404, 'nenalezeno', 'Dokument už v knihovně není.');
    if (dok.stav === 'nahrava') return chyba(cors, 409, 'nahrava', 'Soubor se ještě nahrává.');
    const { data: podepsany, error: e2 } = await db.storage.from(BUCKET).createSignedUrl(dok.soubor_cesta, PLATNOST_ODKAZU_S);
    if (e2 || !podepsany?.signedUrl) return chybaUloziste(cors, 'odkaz', 'odkaz ke stažení');
    return hotovo(cors, { url: podepsany.signedUrl, platnost_s: PLATNOST_ODKAZU_S });
  },

  async zalozit_nahrani({ db, u, telo, cors }) {
    const dokument = { ...popisDokumentu(telo.popis), ...souborKNahrani(telo.soubor) };
    await uklidSmazanych(db);
    const { data, error } = await db.rpc('bible_zaloz_nahrani', {
      p_uzivatel: u.uid,
      p_pristup: u.pristup,
      p_jmeno: u.jmeno ?? '',
      p_dokument: dokument,
    });
    if (error) return chybaDb(cors, error, 'zalozit_nahrani');
    const r = (data ?? {}) as {
      duplicita?: boolean; rozpracovano?: boolean; nazev?: string; nahral_jmeno?: string | null;
      id?: string; cesta?: string; obnoveno?: boolean; soubor_nahran?: boolean;
    };
    if (r.duplicita) return hotovo(cors, { duplicita: true, nazev: r.nazev ?? '' });
    if (r.rozpracovano) return hotovo(cors, { rozpracovano: true, nazev: r.nazev ?? '', nahral_jmeno: r.nahral_jmeno ?? null });
    if (!r.id || !r.cesta) return chyba(cors, 500, 'chyba', 'Databáze bible nevrátila nový dokument.');
    const zaklad = { id: r.id, cesta: r.cesta, obnoveno: r.obnoveno === true };
    if (r.soubor_nahran) return hotovo(cors, { ...zaklad, soubor_nahran: true });
    const { data: nahrani, error: e2 } = await db.storage.from(BUCKET).createSignedUploadUrl(r.cesta);
    if (e2 || !nahrani?.token) return chybaUloziste(cors, 'zalozit_nahrani', 'odkaz pro nahrání');
    const apikey = verejnyKlic((jmeno) => Deno.env.get(jmeno));
    return hotovo(cors, { ...zaklad, soubor_nahran: false, token: nahrani.token, ...(apikey ? { apikey } : {}) });
  },

  async potvrdit_nahrani({ db, u, telo, cors }) {
    const id = idDokumentu(telo);
    const { data, error } = await db.rpc('bible_potvrd_nahrani', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id });
    if (error) return chybaDb(cors, error, 'potvrdit_nahrani');
    const vysledek = (data as { vysledek?: string } | null)?.vysledek;
    if (vysledek === 'nenalezeno') return chyba(cors, 404, 'nenalezeno', 'Nahrávaný dokument už v knihovně není.');
    if (vysledek === 'soubor_chybi') return chyba(cors, 409, 'soubor_chybi', 'Soubor do úložiště nedorazil — nahraj ho znovu.');
    if (vysledek === 'jina_velikost') {
      return chyba(cors, 409, 'jina_velikost', 'Soubor v úložišti není celý (má jinou velikost). Zruš nahrání a nahraj soubor znovu.');
    }
    if (vysledek !== 'ok') return chyba(cors, 500, 'chyba', 'Potvrzení nahrání se nepovedlo.');
    const { data: dok, error: e2 } = await db.from('bible_dokumenty').select(SLOUPCE_DOKUMENTU).eq('id', id).single();
    if (e2) return chybaDb(cors, e2, 'potvrdit_nahrani');
    return hotovo(cors, dok);
  },

  async upravit_popis({ db, u, telo, cors }) {
    const id = idDokumentu(telo);
    const popis = popisDokumentu(telo.popis);
    const { data, error } = await db.rpc('bible_uprav_popis', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id, p_popis: popis });
    if (error) return chybaDb(cors, error, 'upravit_popis');
    if (data !== true) return chyba(cors, 404, 'nenalezeno', 'Dokument už v knihovně není.');
    return hotovo(cors, { upraveno: true });
  },

  async nastavit_stav({ db, u, telo, cors }) {
    const id = idDokumentu(telo);
    const stav = stavDokumentu(telo.stav);
    const { data, error } = await db.rpc('bible_nastav_stav', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id, p_stav: stav });
    if (error) return chybaDb(cors, error, 'nastavit_stav');
    if (data !== true) return chyba(cors, 404, 'nenalezeno', 'Dokument už v knihovně není.');
    return hotovo(cors, { stav });
  },

  async smazat({ db, u, telo, cors }) {
    const id = idDokumentu(telo);
    const { data, error } = await db.rpc('bible_smaz_dokument', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id });
    if (error) return chybaDb(cors, error, 'smazat');
    if (typeof data !== 'string' || !data) return chyba(cors, 404, 'nenalezeno', 'Dokument už v knihovně není.');
    // Soubor přes Storage API (SQL dotazem by v úložišti zůstal osiřelý soubor).
    const { error: e2 } = await db.storage.from(BUCKET).remove([data]);
    if (e2) console.error('bible-api smazat: soubor zůstal v úložišti');
    await uklidSmazanych(db);
    return hotovo(cors, { smazano: true, soubor_zustal: Boolean(e2) });
  },

  async kapacita({ db, cors }) {
    await uklidSmazanych(db);
    const { data, error } = await db.rpc('bible_kapacita');
    if (error) return chybaDb(cors, error, 'kapacita');
    return hotovo(cors, data);
  },

  async naklady({ db, telo, cors }) {
    const od = zacatekObdobi(telo.od);
    const { data, error } = await db.rpc('bible_naklady_od', { p_od: od });
    if (error) return chybaDb(cors, error, 'naklady');
    return hotovo(cors, data ?? []);
  },
};

Deno.serve(async (req: Request) => {
  const cors = corsHlavicky(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return chyba(cors, 405, 'metoda', 'bible-api bere jen POST.');

  const token = tokenZHlavicky(req.headers.get('Authorization'));
  if (!token) return chyba(cors, 401, 'neprihlasen', 'Přihlášení je povinné.');

  let telo: Record<string, unknown>;
  try {
    telo = await nactiJson(req, MAX_TELO);
  } catch (e) {
    return chyba(cors, 400, 'neplatny_vstup', e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'Neplatný požadavek.');
  }
  if (!jeAkce(telo.akce)) return chyba(cors, 400, 'neplatny_vstup', 'Neznámá akce.');
  const akce = telo.akce;

  const overeni = await overUzivatele(token, { anonKlic: Deno.env.get('HLAVNI_ANON_KEY') });
  if (!overeni.ok) return chyba(cors, overeni.status, overeni.kod, overeni.zprava);
  const u = overeni.uzivatel;
  if (!u.pristup) {
    return chyba(cors, 403, 'bez_pristupu', 'Nemáš přístup do Pivovarské bible. Povolí ho admin v Uživatelé → Práva → Pivovarská bible.');
  }
  const potreba = AKCE[akce];
  if (uroven(u.pristup) < uroven(potreba)) {
    return chyba(cors, 403, 'zakazano', potreba === 'spravuje'
      ? 'Tohle smí jen správce knihovny.'
      : 'Nemáš právo nahrávat ani upravovat knihovnu. Povolí ho admin v Uživatelé → Práva → Pivovarská bible.');
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const klic = sluzebniKlic((jmeno) => Deno.env.get(jmeno));
  if (!url || !klic) return chyba(cors, 503, 'nenastaveno', 'Projekt bible nemá adresu nebo klíč služby.');
  const db = createClient(url, klic, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  try {
    return await PROVEDENI[akce]({ db, u: { ...u, pristup: u.pristup }, telo, cors });
  } catch (e) {
    if (e instanceof ChybaVstupu) return chyba(cors, 400, 'neplatny_vstup', e.message);
    console.error(`bible-api ${akce}: neočekávaná chyba ${e instanceof Error ? e.name : typeof e}`);
    return chyba(cors, 500, 'chyba', 'Něco se pokazilo. Zkus to znovu.');
  }
});
