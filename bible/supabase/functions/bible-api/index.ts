import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import {
  chyba, corsHlavicky, hotovo, jeUuid, nactiJson, overUzivatele, sluzebniKlic, tokenZHlavicky, uroven, verejnyKlic,
  type Pristup, type Uzivatel,
} from '../_shared/brana.ts';
import {
  AKCE, ChybaVstupu, idDokumentu, jeAkce, PLATNOST_ODKAZU_S, popisDokumentu, predchoziVydani, prekladChybyDb, SLOUPCE_DOKUMENTU,
  souborKNahrani, stavDokumentu, zacatekObdobi, type Akce, type ChybaDb, klicPrehledu,
  dotazZkusenosti, idZkusenosti, zkusenostVstup,
  idZaznamu, pivovarVstup, postupProvozuVstup, prevzetiVstup, vyberPivovaru, zarizeniVstup,
  recepturaVstup, varkaVstup,
  overeniVstup, problemVstup, stavZjisteniVstup, webZdrojVstup, zjisteniVstup,
  stropVstup,
} from '../_shared/vstupy.ts';
import {
  celeCislo, druhObjektu, DRUHY_OBJEKTU, jeCitelny, listyPodStropem, MAX_LISTU_NA_DOTAZ, nahled, OBJEKTU_NA_DOTAZ,
  rejstrikListu, sPrekladem, SLOUPCE_LISTU, SLOUPCE_PREKLADU, vsechnyRadky, ZPRAVA_BEZ_TEXTU, zpravaNezpracovano,
  dotazHledani, slovaDotazu, slovaVolne, uryvek, VYSLEDKU_HLEDANI,
} from '../_shared/cteni.ts';
import { nahodnyToken, platnaChallenge, platnyClient, POVOLENE_NAVRATY, sha256hex } from '../_shared/mcp.ts';

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

/**
 * Dokument ke čtení: existuje a je zpracovaný (hotovo / ke_kontrole). Worker
 * zapisuje kapitoly a pasáže po částech, takže rozpracovaný dokument se číst
 * nesmí — appka dostane 409 'nezpracovano' se stavem.
 */
async function citelnyDokument(
  db: SupabaseClient, id: string, cors: Record<string, string>, akce: string,
): Promise<{ dokument: Record<string, unknown> } | { odpoved: Response }> {
  const { data, error } = await db.from('bible_dokumenty').select(SLOUPCE_DOKUMENTU).eq('id', id).maybeSingle();
  if (error) return { odpoved: chybaDb(cors, error, akce) };
  const dokument = data as Record<string, unknown> | null;
  if (!dokument) return { odpoved: chyba(cors, 404, 'nenalezeno', 'Dokument už v knihovně není.') };
  if (!jeCitelny(dokument.stav)) return { odpoved: chyba(cors, 409, 'nezpracovano', zpravaNezpracovano(dokument.stav)) };
  return { dokument };
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

  // Vazby vydání (etapa 3c): jen dvojice id → předchozí vydání. Bez migrace
  // (sloupec chybí, 42703) appka vydání neukazuje, knihovna funguje dál.
  async vydani({ db, cors }) {
    const { data, error } = await db.from('bible_dokumenty')
      .select('id,predchozi_vydani').not('predchozi_vydani', 'is', null);
    if (error?.code === '42703') return hotovo(cors, { vydani: [], migrace: false });
    if (error) return chybaDb(cors, error, 'vydani');
    return hotovo(cors, { vydani: data ?? [], migrace: true });
  },

  async vydani_nastavit({ db, u, telo, cors }) {
    const id = idDokumentu(telo);
    const predchozi = predchoziVydani(telo);
    const { data, error } = await db.rpc('bible_nastav_vydani', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id, p_predchozi: predchozi });
    if (error) return chybaDb(cors, error, 'vydani_nastavit');
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

  // Obsah knihy: dokument, strom kapitol (rozsah v listech souboru) a rejstřík
  // listů s tištěnými čísly stran — bez textu.
  async kniha({ db, telo, cors }) {
    const id = idDokumentu(telo);
    const c = await citelnyDokument(db, id, cors, 'kniha');
    if ('odpoved' in c) return c.odpoved;
    // S českým názvem kapitoly; bez migrace 20261104020000_bible_kapitoly_preklad (42703) bez něj.
    const nactiKapitoly = (sloupce: string) => vsechnyRadky((od, do_) => db.from('bible_kapitoly')
      .select(sloupce).eq('dokument_id', id).order('poradi').range(od, do_));
    let kapitoly = await nactiKapitoly('id,rodic_id,poradi,uroven,cislo,nazev,nazev_cs,strana_od,strana_do');
    if ((kapitoly.error as ChybaDb | null)?.code === '42703') kapitoly = await nactiKapitoly('id,rodic_id,poradi,uroven,cislo,nazev,strana_od,strana_do');
    if (kapitoly.error) return chybaDb(cors, kapitoly.error as ChybaDb, 'kniha');
    const listy = await vsechnyRadky<{ pdf_index: number; tistena_strana: string | null; zdroj_textu: string; ke_kontrole: boolean }>(
      (od, do_) => db.from('bible_strany')
        .select('pdf_index,tistena_strana,zdroj_textu,ke_kontrole')
        .eq('dokument_id', id).order('pdf_index').range(od, do_));
    if (listy.error) return chybaDb(cors, listy.error as ChybaDb, 'kniha');
    // Hotová kniha bez jediného listu (po obnově ze zálohy): říct, co s tím, ne ukázat prázdnou knihu.
    if (listy.data.length === 0) return chyba(cors, 409, 'nezpracovano', ZPRAVA_BEZ_TEXTU);
    return hotovo(cors, { dokument: c.dokument, kapitoly: kapitoly.data, listy: rejstrikListu(listy.data) });
  },

  // Text listů od zadaného (nejvýš MAX_LISTU_NA_DOTAZ a strop znaků) — žádný export celé knihy.
  async listy({ db, telo, cors }) {
    const id = idDokumentu(telo);
    const od = celeCislo(telo.od, 'Číslo listu', 1, 1_000_000);
    const pocet = celeCislo(telo.pocet, 'Počet listů', 1, MAX_LISTU_NA_DOTAZ, 1);
    const c = await citelnyDokument(db, id, cors, 'listy');
    if ('odpoved' in c) return c.odpoved;
    const dotaz = (sloupce: string) => db.from('bible_strany')
      .select(sloupce).eq('dokument_id', id).gte('pdf_index', od).order('pdf_index').limit(pocet);
    // S českým překladem; databáze bez migrace překladu (sloupec chybí, 42703) → originál jako dřív.
    let { data, error } = await dotaz(`${SLOUPCE_LISTU},${SLOUPCE_PREKLADU}`);
    if (error?.code === '42703') ({ data, error } = await dotaz(SLOUPCE_LISTU));
    if (error) return chybaDb(cors, error, 'listy');
    const listy = ((data ?? []) as { text?: string | null; preklad?: string | null; preklad_kontrola?: string | null; preklad_platny?: boolean | null }[])
      .map(sPrekladem);
    return hotovo(cors, { listy: listyPodStropem(listy) });
  },

  // Hledání v knihách: pasáže originálu i český překlad stran, jen zpracované knihy.
  // Vrací úryvek kolem nálezu a místo (kniha, kapitola, strana) — celý text si appka otevře ve čtečce.
  async hledej({ db, telo, cors }) {
    const dotaz = dotazHledani(telo.dotaz);
    const dokument = telo.id === undefined || telo.id === null ? null : idDokumentu(telo);
    const { data, error } = await db.rpc('bible_hledej', { p_dotaz: dotaz, p_dokument: dokument, p_limit: VYSLEDKU_HLEDANI });
    if (error?.code === 'PGRST202') {
      return chyba(cors, 409, 'nezpracovano', 'Hledání čeká na migraci databáze bible 20261103010000_bible_hledani (Systém → Databázové migrace → Databáze bible).');
    }
    if (error) return chybaDb(cors, error, 'hledej');
    type Radek = {
      dokument_id: string; nazev: string; autor: string | null; rok: number | null; jazyk: string | null;
      zdroj: string; pdf_index: number; tistena_strana: string | null; kapitola: string | null; druh: string; text: string;
      shoda?: number; slov?: number;
    };
    let radky = (data ?? []) as Radek[];
    // Otázka v běžné řeči: všechna slova na jedné stránce nejsou → stránky s nejvíc
    // slovy otázky (bez výplňových slov, s uříznutou koncovkou; migrace 20261111030000).
    const kmeny = slovaVolne(dotaz);
    let volne = false;
    if (radky.length === 0 && kmeny.length > 0) {
      const v = await db.rpc('bible_hledej_volne', { p_dotaz: dotaz, p_dokument: dokument, p_limit: VYSLEDKU_HLEDANI });
      if (v.error && v.error.code !== 'PGRST202') return chybaDb(cors, v.error, 'hledej');
      if (!v.error && Array.isArray(v.data) && v.data.length > 0) { radky = v.data as Radek[]; volne = true; }
    }
    const slova = volne ? kmeny : slovaDotazu(dotaz);
    return hotovo(cors, {
      volne,
      slova,
      vysledky: radky.map((r) => ({
        dokument_id: r.dokument_id, nazev: r.nazev, autor: r.autor, rok: r.rok, jazyk: r.jazyk,
        zdroj: r.zdroj, pdf_index: r.pdf_index, tistena_strana: r.tistena_strana, kapitola: r.kapitola, druh: r.druh,
        uryvek: uryvek(r.text, slova),
        ...(volne ? { shoda: r.shoda ?? null, slov: r.slov ?? null } : {}),
      })),
    });
  },

  // AI sládek (etapa 5): útrata za AI tento měsíc, strop, model a jestli má chatbot klíč
  // (secret ANTHROPIC_API_KEY projektu bible — hodnota se nikdy nevrací).
  async chat_stav({ db, cors }) {
    const klic = Boolean(Deno.env.get('ANTHROPIC_API_KEY'));
    const { data, error } = await db.rpc('bible_ai_utrata_mesic');
    if (error?.code === 'PGRST202') return hotovo(cors, { migrace: false, klic });
    if (error) return chybaDb(cors, error, 'chat_stav');
    return hotovo(cors, { ...((data ?? {}) as Record<string, unknown>), migrace: true, klic });
  },

  // Vlastní konverzace s AI sládkem (nejnovější první) — cizí SQL nevrátí.
  async konverzace({ db, u, cors }) {
    const { data, error } = await db.rpc('bible_konverzace_seznam', { p_uzivatel: u.uid, p_limit: 50 });
    if (error?.code === 'PGRST202') return hotovo(cors, { konverzace: [], migrace: false });
    if (error) return chybaDb(cors, error, 'konverzace');
    return hotovo(cors, { konverzace: data ?? [], migrace: true });
  },

  async konverzace_detail({ db, u, telo, cors }) {
    const id = idZaznamu(telo, 'konverzace');
    const { data, error } = await db.rpc('bible_konverzace_zpravy', { p_uzivatel: u.uid, p_konverzace: id });
    if (error) return chybaDb(cors, error, 'konverzace_detail');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Tahle konverzace neexistuje (nebo není tvoje).');
    return hotovo(cors, data);
  },

  async konverzace_smazat({ db, u, telo, cors }) {
    const id = idZaznamu(telo, 'konverzace');
    const { data, error } = await db.rpc('bible_konverzace_smaz', { p_uzivatel: u.uid, p_konverzace: id });
    if (error) return chybaDb(cors, error, 'konverzace_smazat');
    return hotovo(cors, { smazano: data === true });
  },

  // Měsíční strop útraty za AI — jen správce (hlídá i SQL).
  async strop_nastavit({ db, u, telo, cors }) {
    const usd = stropVstup(telo);
    const { error } = await db.rpc('bible_strop_nastav', { p_uzivatel: u.uid, p_pristup: u.pristup, p_usd: usd });
    if (error) return chybaDb(cors, error, 'strop_nastavit');
    return hotovo(cors, { strop_usd: usd });
  },

  // Přehledy témat: seznam (bez textu). Bez migrace přehledů prázdný seznam s příznakem.
  async prehledy({ db, cors }) {
    const { data, error } = await db.from('bible_prehledy')
      .select('klic,nazev,oblast,poradi,kontrola,vytvoreno').order('poradi');
    if (error?.code === 'PGRST205' || error?.code === '42P01') return hotovo(cors, { prehledy: [], migrace: false });
    if (error) return chybaDb(cors, error, 'prehledy');
    return hotovo(cors, { prehledy: data ?? [], migrace: true });
  },

  // Jeden přehled: text s citacemi [n] a zdroje (kniha, list) — odkazy otevřou čtečku.
  async prehled({ db, telo, cors }) {
    const klic = klicPrehledu(telo.klic);
    const { data, error } = await db.from('bible_prehledy')
      .select('klic,nazev,oblast,text,zdroje,kontrola,vytvoreno').eq('klic', klic).maybeSingle();
    if (error) return chybaDb(cors, error, 'prehled');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Přehled tohoto tématu zatím není.');
    return hotovo(cors, data);
  },

  // Zkušenosti sládků: seznam / hledání (bez diakritiky), vždy s úrovní důvěryhodnosti.
  async zkusenosti({ db, telo, cors }) {
    const f = dotazZkusenosti(telo);
    const { data, error } = await db.rpc('bible_hledej_zkusenosti', {
      p_dotaz: f.dotaz, p_oblast: f.oblast, p_nejhorsi: f.nejhorsi, p_limit: 100,
    });
    if (error?.code === 'PGRST202') return hotovo(cors, { zkusenosti: [], migrace: false });
    if (error) return chybaDb(cors, error, 'zkusenosti');
    return hotovo(cors, { zkusenosti: data ?? [], migrace: true });
  },

  async zkusenost_zapsat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_zapis_zkusenost', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_zkusenost: zkusenostVstup(telo.zkusenost),
    });
    if (error) return chybaDb(cors, error, 'zkusenost_zapsat');
    return hotovo(cors, { id: data });
  },

  async zkusenost_upravit({ db, u, telo, cors }) {
    const id = idZkusenosti(telo);
    const { data, error } = await db.rpc('bible_uprav_zkusenost', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id, p_zkusenost: zkusenostVstup(telo.zkusenost),
    });
    if (error) return chybaDb(cors, error, 'zkusenost_upravit');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zkušenost už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  // Technologie pivovaru (etapa 7): profil, zařízení s parametry a provozní postupy.
  async technologie({ db, telo, cors }) {
    const { data, error } = await db.rpc('bible_technologie', { p_pivovar: vyberPivovaru(telo) });
    if (error?.code === 'PGRST202') return hotovo(cors, { pivovary: [], pivovar_id: null, zarizeni: [], postupy: [], migrace: false });
    if (error) return chybaDb(cors, error, 'technologie');
    return hotovo(cors, { ...(data as Record<string, unknown>), migrace: true });
  },

  async pivovar_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_pivovar_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_pivovar: pivovarVstup(telo.pivovar),
    });
    if (error) return chybaDb(cors, error, 'pivovar_ulozit');
    return hotovo(cors, { id: data });
  },

  async pivovar_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_pivovar_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'pivovaru') });
    if (error) return chybaDb(cors, error, 'pivovar_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Pivovar už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async zarizeni_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_zarizeni_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_zarizeni: zarizeniVstup(telo.zarizeni),
    });
    if (error) return chybaDb(cors, error, 'zarizeni_ulozit');
    return hotovo(cors, { id: data });
  },

  async zarizeni_prevzit({ db, u, telo, cors }) {
    const { pivovar, seznam } = prevzetiVstup(telo);
    const { data, error } = await db.rpc('bible_zarizeni_prevezmi', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_pivovar: pivovar, p_seznam: seznam,
    });
    if (error) return chybaDb(cors, error, 'zarizeni_prevzit');
    return hotovo(cors, { prevzato: data });
  },

  async zarizeni_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_zarizeni_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'zařízení') });
    if (error) return chybaDb(cors, error, 'zarizeni_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zařízení už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async postup_provozu_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_postup_provozu_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_postup: postupProvozuVstup(telo.postup),
    });
    if (error) return chybaDb(cors, error, 'postup_provozu_ulozit');
    return hotovo(cors, { id: data });
  },

  async postup_provozu_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_postup_provozu_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'postupu') });
    if (error) return chybaDb(cors, error, 'postup_provozu_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Postup už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  // Receptury a várky (etapa 8): evidence; porovnání počítá appka i konektor stejným kódem (varky-popisy.ts).
  async varky({ db, cors }) {
    const { data, error } = await db.rpc('bible_varky_prehled', { p_limit: 500 });
    if (error?.code === 'PGRST202') return hotovo(cors, { receptury: [], varky: [], migrace: false });
    if (error) return chybaDb(cors, error, 'varky');
    return hotovo(cors, { ...(data as Record<string, unknown>), migrace: true });
  },

  async receptura_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_receptura_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_receptura: recepturaVstup(telo.receptura),
    });
    if (error) return chybaDb(cors, error, 'receptura_ulozit');
    return hotovo(cors, { id: data });
  },

  async receptura_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_receptura_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'receptury') });
    if (error) return chybaDb(cors, error, 'receptura_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Receptura už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async varka_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_varka_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_varka: varkaVstup(telo.varka),
    });
    if (error) return chybaDb(cors, error, 'varka_ulozit');
    return hotovo(cors, { id: data });
  },

  async varka_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_varka_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'várky') });
    if (error) return chybaDb(cors, error, 'varka_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Várka už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  // Rešerše z internetu (etapa 9): nový zdroj vždy neověřený, ověřuje správce.
  async web_zdroje({ db, cors }) {
    const { data, error } = await db.rpc('bible_web_zdroje_prehled', { p_limit: 500 });
    if (error?.code === 'PGRST202') return hotovo(cors, { zdroje: [], migrace: false });
    if (error) return chybaDb(cors, error, 'web_zdroje');
    return hotovo(cors, { zdroje: data ?? [], migrace: true });
  },

  async web_zdroj_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_web_zdroj_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_pres_claude: false, p_zdroj: webZdrojVstup(telo.zdroj),
    });
    if (error) return chybaDb(cors, error, 'web_zdroj_ulozit');
    return hotovo(cors, data);
  },

  async web_zdroj_overit({ db, u, telo, cors }) {
    const { id, stav, poznamka } = overeniVstup(telo);
    const { data, error } = await db.rpc('bible_web_zdroj_over', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_id: id, p_stav: stav, p_poznamka: poznamka,
    });
    if (error) return chybaDb(cors, error, 'web_zdroj_overit');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zdroj už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async web_zdroj_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_web_zdroj_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'zdroje') });
    if (error) return chybaDb(cors, error, 'web_zdroj_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zdroj už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  // Analýza problémů (etapa 10): problémy s dotčenými várkami a typovanými zjištěními.
  async problemy({ db, cors }) {
    const { data, error } = await db.rpc('bible_problemy_prehled', { p_limit: 200 });
    if (error?.code === 'PGRST202') return hotovo(cors, { problemy: [], migrace: false });
    if (error) return chybaDb(cors, error, 'problemy');
    return hotovo(cors, { problemy: data ?? [], migrace: true });
  },

  async problem_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_problem_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_pres_claude: false, p_problem: problemVstup(telo.problem),
    });
    if (error) return chybaDb(cors, error, 'problem_ulozit');
    return hotovo(cors, { id: data });
  },

  async problem_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_problem_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'problému') });
    if (error) return chybaDb(cors, error, 'problem_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Problém už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async zjisteni_ulozit({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_zjisteni_uloz', {
      p_uzivatel: u.uid, p_pristup: u.pristup, p_jmeno: u.jmeno ?? '', p_pres_claude: false, p_zjisteni: zjisteniVstup(telo.zjisteni),
    });
    if (error) return chybaDb(cors, error, 'zjisteni_ulozit');
    return hotovo(cors, { id: data });
  },

  async zjisteni_stav({ db, u, telo, cors }) {
    const { id, stav } = stavZjisteniVstup(telo);
    const { data, error } = await db.rpc('bible_zjisteni_stav', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id, p_stav: stav });
    if (error) return chybaDb(cors, error, 'zjisteni_stav');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zjištění už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async zjisteni_smazat({ db, u, telo, cors }) {
    const { data, error } = await db.rpc('bible_zjisteni_smaz', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: idZaznamu(telo, 'zjištění') });
    if (error) return chybaDb(cors, error, 'zjisteni_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zjištění už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  async zkusenost_smazat({ db, u, telo, cors }) {
    const id = idZkusenosti(telo);
    const { data, error } = await db.rpc('bible_smaz_zkusenost', { p_uzivatel: u.uid, p_pristup: u.pristup, p_id: id });
    if (error) return chybaDb(cors, error, 'zkusenost_smazat');
    if (!data) return chyba(cors, 404, 'nenalezeno', 'Zkušenost už v bibli není.');
    return hotovo(cors, { ok: true });
  },

  // „Povolit" na obrazovce /claude-pripojeni: kód pro Claude (OAuth, PKCE S256).
  // Přístup do bible ověřila brána (fail-closed); kód platí 5 minut a jednou.
  async mcp_povolit({ db, u, telo, cors }) {
    const navrat = typeof telo.redirect_uri === 'string' ? telo.redirect_uri : '';
    if (!POVOLENE_NAVRATY.includes(navrat)) throw new ChybaVstupu('Žádost nepřišla z aplikace Claude.');
    if (!platnyClient(telo.client_id)) throw new ChybaVstupu('Žádost nemá platného klienta.');
    if (telo.code_challenge_method !== 'S256' || !platnaChallenge(telo.code_challenge)) throw new ChybaVstupu('Žádost nemá zabezpečení PKCE (S256).');
    const stav = typeof telo.state === 'string' ? telo.state.slice(0, 500) : '';
    const kod = nahodnyToken();
    const { data, error } = await db.rpc('bible_mcp_vydej_kod', {
      p_uzivatel: u.uid, p_jmeno: u.jmeno ?? null, p_pristup: u.pristup, p_client_id: telo.client_id,
      p_redirect_uri: navrat, p_challenge: telo.code_challenge, p_kod_hash: await sha256hex(kod),
    });
    if (error?.code === 'PGRST202') return chyba(cors, 409, 'nezpracovano', 'Konektor čeká na migraci databáze bible 20261103030000_bible_mcp.');
    if (error) return chybaDb(cors, error, 'mcp_povolit');
    if (data !== true) throw new ChybaVstupu('Aplikace Claude se u knihovny nezaregistrovala — přidej konektor znovu.');
    const cil = new URL(navrat);
    cil.searchParams.set('code', kod);
    if (stav) cil.searchParams.set('state', stav);
    return hotovo(cors, { presmerovat: cil.toString() });
  },

  // Připojení aplikace Claude přihlášeného uživatele (bez tokenů).
  async mcp_pripojeni({ db, u, cors }) {
    const { data, error } = await db.rpc('bible_mcp_pripojeni', { p_uzivatel: u.uid });
    if (error?.code === 'PGRST202') return hotovo(cors, { pripojeni: [], migrace: false });
    if (error) return chybaDb(cors, error, 'mcp_pripojeni');
    return hotovo(cors, { pripojeni: data ?? [], migrace: true });
  },

  // Odpojení (jedno připojení nebo všechna) — tokeny přestanou platit hned.
  async mcp_odpojit({ db, u, telo, cors }) {
    const pripojeni = telo.pripojeni === undefined || telo.pripojeni === null ? null : telo.pripojeni;
    if (pripojeni !== null && !jeUuid(pripojeni)) throw new ChybaVstupu('Neplatné připojení.');
    const { data, error } = await db.rpc('bible_mcp_odpoj', { p_uzivatel: u.uid, p_pripojeni: pripojeni });
    if (error) return chybaDb(cors, error, 'mcp_odpojit');
    return hotovo(cors, { odpojeno: data ?? 0 });
  },

  // Přehled tabulek, vzorců a popisků (pasáže s druhem) s náhledem a listem.
  async objekty({ db, telo, cors }) {
    const id = idDokumentu(telo);
    const druh = druhObjektu(telo.druh);
    const po = celeCislo(telo.po, 'Pořadí', 0, 100_000_000, 0);
    const c = await citelnyDokument(db, id, cors, 'objekty');
    if ('odpoved' in c) return c.odpoved;
    const zaklad = db.from('bible_pasaze')
      .select('poradi,druh,strana_od,strana_do,kapitola_id,text')
      .eq('dokument_id', id).gt('poradi', po);
    const { data, error } = await (druh ? zaklad.eq('druh', druh) : zaklad.in('druh', [...DRUHY_OBJEKTU]))
      .order('poradi').limit(OBJEKTU_NA_DOTAZ);
    if (error) return chybaDb(cors, error, 'objekty');
    const radky = (data ?? []) as { poradi: number; druh: string; strana_od: number; strana_do: number; kapitola_id: string | null; text: string }[];
    return hotovo(cors, {
      objekty: radky.map((r) => ({
        poradi: r.poradi, druh: r.druh, strana_od: r.strana_od, strana_do: r.strana_do, kapitola_id: r.kapitola_id, nahled: nahled(r.text),
      })),
      dalsi: radky.length === OBJEKTU_NA_DOTAZ ? radky[radky.length - 1].poradi : null,
    });
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
