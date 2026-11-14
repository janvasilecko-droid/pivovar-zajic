// 💬 Odpověď z aplikace Claude zpátky do appky (R33) — čisté funkce (testy:
// nastroje-zapis.test.ts). Claude v aplikaci píše odpověď v Markdownu a u tvrzení
// z knih dává odkaz na stránku ve čtečce appky (INSTRUKCE konektoru). Appka
// ale citace kreslí jako čísla [n] se seznamem zdrojů (stejně jako odpovědi
// chatbota přes API) a Markdown odkazy nezobrazuje — proto se odkazy převedou:
// stránka knihy → [n] se zdrojem (kniha, strana), jiná webová adresa → [n]
// se zdrojem „web". Stejná stránka nebo adresa dostane stejné číslo.
import { APP_URL } from './mcp.ts';
import type { ZdrojOdpovedi } from './chat.ts';

/** Nejvýš tolik zdrojů z jedné odpovědi (zbytek odkazů zůstane jako text). */
export const MAX_ZDROJU_ODPOVEDI = 60;

const APP = APP_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ODKAZ_KNIHY = new RegExp(`^${APP}/?\\?page=bible(?:&|&amp;)sub=kniha(?::|%3A)([0-9a-fA-F-]{36})(?::|%3A)(\\d{1,6})(?:[#&].*)?$`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// [popis](adresa) i [popis](adresa "titulek"); popis bez zalomení řádku.
const MD_ODKAZ = /\[([^\]\n]{0,300})\]\((https?:\/\/[^\s)]+)(?:\s+"[^"\n]*")?\)/g;
// Holá adresa nebo <adresa> (s mezerou před ní, ať jde při vynechání odebrat
// i ta); koncová interpunkce do adresy nepatří.
const HOLA_ADRESA = /( ?)(?:<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>()[\]"'`]+))/g;

export type OdkazKnihy = { dokumentId: string; list: number };

/** Stránka knihy z odkazu do čtečky appky, jinak null. */
export function odkazNaStranu(url: string): OdkazKnihy | null {
  const m = ODKAZ_KNIHY.exec(url);
  if (!m) return null;
  const id = m[1].toLowerCase();
  const list = Number(m[2]);
  return UUID.test(id) && Number.isInteger(list) && list >= 1 ? { dokumentId: id, list } : null;
}

const jeAdresa = (t: string) => /^\s*<?https?:\/\//i.test(t);

function rozdelKonec(url: string): [string, string] {
  const m = /[.,;:!?]+$/.exec(url);
  return m ? [url.slice(0, m.index), m[0]] : [url, ''];
}

/** Stránky knih, na které odpověď odkazuje (ať se k nim dohledá název a strana). */
export function stranyVOdpovedi(text: string): OdkazKnihy[] {
  const videno = new Map<string, OdkazKnihy>();
  const pridej = (url: string) => {
    const o = odkazNaStranu(rozdelKonec(url)[0]);
    if (o) videno.set(`${o.dokumentId}:${o.list}`, o);
  };
  for (const m of text.matchAll(MD_ODKAZ)) pridej(m[2]);
  for (const m of text.replace(MD_ODKAZ, ' ').matchAll(HOLA_ADRESA)) pridej(m[2] ?? m[3]);
  return [...videno.values()];
}

export type UdajeKnih = {
  /** Název knihy podle id (kniha, která v knihovně není, se necituje). */
  nazvy: ReadonlyMap<string, string>;
  /** Tištěná strana podle „id:list" (jen když je jistá). */
  strany: ReadonlyMap<string, string | null>;
};

/**
 * Odkazy v odpovědi → citace [n] a zdroje pro appku. Čísla navazují za
 * nejvyšší [n], které už v textu je, ať se nic neplete. Odkaz na stránku
 * knihy, která v knihovně není, se necituje: zůstane jen popis odkazu a počet
 * takových odkazů se vrátí (Claude ho řekne uživateli).
 */
export function odkazyNaCitace(text: string, udaje: UdajeKnih): { text: string; citace: ZdrojOdpovedi[]; vynechano: number } {
  let dalsi = Math.max(0, ...[...text.matchAll(/\[(\d{1,3})\](?!\()/g)].map((m) => Number(m[1]))) + 1;
  const podleKlice = new Map<string, number>();
  const citace: ZdrojOdpovedi[] = [];
  let vynechano = 0;

  /** Číslo zdroje pro adresu, nebo null (neznámá kniha, moc zdrojů, ne http). */
  const cislo = (url: string, popis: string): number | null => {
    const kniha = odkazNaStranu(url);
    const klic = kniha ? `k:${kniha.dokumentId}:${kniha.list}` : `w:${url}`;
    const uz = podleKlice.get(klic);
    if (uz !== undefined) return uz;
    if (citace.length >= MAX_ZDROJU_ODPOVEDI) return null;
    if (kniha) {
      const nazev = udaje.nazvy.get(kniha.dokumentId);
      if (!nazev) { vynechano++; return null; }
      citace.push({
        n: dalsi, dokumentId: kniha.dokumentId, pdfIndex: kniha.list, nazev,
        tistena: udaje.strany.get(`${kniha.dokumentId}:${kniha.list}`) ?? null, kapitola: null, zdroj: 'original', url: null, citat: '',
      });
    } else {
      let host = url;
      try { host = new URL(url).hostname; } catch { return null; }
      citace.push({
        n: dalsi, dokumentId: null, pdfIndex: null, nazev: (popis && !jeAdresa(popis) ? popis : host).slice(0, 300),
        tistena: null, kapitola: null, zdroj: 'web', url, citat: '',
      });
    }
    podleKlice.set(klic, dalsi);
    return dalsi++;
  };

  const sOdkazy = text.replace(MD_ODKAZ, (celek: string, popis: string, adresa: string) => {
    const p = popis.trim();
    const n = cislo(adresa, p);
    if (n === null) return p && !jeAdresa(p) ? p : (odkazNaStranu(adresa) ? '' : celek);
    return p && !jeAdresa(p) ? `${p} [${n}]` : `[${n}]`;
  });
  const vysledek = sOdkazy.replace(HOLA_ADRESA, (celek: string, mezera: string, vSipkach: string | undefined, hola: string | undefined) => {
    const [adresa, konec] = vSipkach ? [vSipkach, ''] : rozdelKonec(hola ?? '');
    const n = cislo(adresa, '');
    if (n === null) return odkazNaStranu(adresa) ? konec : celek;
    return `${mezera}[${n}]${konec}`;
  });
  return { text: vysledek.replace(/[ \t]+\n/g, '\n').trim(), citace, vynechano };
}
