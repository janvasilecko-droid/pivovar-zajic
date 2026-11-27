// 📴 Místní odpověď na dotaz obrazovky — nad kopií tabulky uloženou v telefonu.
// ---------------------------------------------------------------------------
// Majitel 27. 11. 2026: „furt to nefunguje offline, offline si to má držet aspoň objednávky na daný týden,
// závozy, stáčení, sklad aktuální, vše z daného týdne" a „napíše to, že to je offline, a neukážou se mi žádný data".
//
// Proč se data neukázala: appka si pamatovala jen ODPOVĚDI na přesně tytéž dotazy, které už jednou se signálem
// položila. Skoro každý dotaz ale v adrese nese dnešní datum, týden nebo seznam objednávek — druhý den (nebo na
// obrazovce, kterou člověk se signálem neotevřel) je adresa jiná a v paměti pro ni nic není → prázdná obrazovka.
//
// Tady je druhá půlka opravy (první je lib/offlineZrcadlo.ts — kopie celých tabulek stahovaná na pozadí):
// dotaz se bez signálu VYHODNOTÍ místně nad tou kopií. Umí to, co appka opravdu používá (změřeno na dotazech
// plochy, Objednávek, Stáčení a Skladu): filtry eq, neq, gt, gte, lt, lte, in, is, like, ilike, jejich not.*,
// skupiny or=(…)/and=(…), řazení, offset/limit, výběr sloupců včetně přejmenování a dvě vnoření
// (objednávka → položky, akce → položky).
//
// ⚠️ ZÁSADA: NEHÁDAT. Co modul neumí (jiný operátor, přetypování, JSON cesta, neznámé vnoření, neznámý sloupec),
// na to vrátí `null` a volající se zachová jako dřív (uložená odpověď na přesnou adresu, jinak nic). Špatná čísla
// jsou horší než žádná — „radši ať je to pomalé, ale správné".
//
// Správnost hlídají testy (lib/offlineDotaz.test.ts) a rozdílová zkouška proti skutečnému serveru na dotazech
// zachycených z appky (popsaná v docs/offline.md).
//
// Čistý modul: žádný prohlížeč, žádná databáze, žádné importy.

export type Radek = Record<string, any>;
/** Místní kopie tabulky (celé řádky), nebo null, když ji telefon nemá. */
export type ZdrojTabulek = (tabulka: string) => readonly Radek[] | null | undefined;

export type VysledekDotazu = {
  /** Řádky po filtru, seřazení, offset/limit a výběru sloupců. */
  radky: Radek[];
  /** Kolik řádků vyhovělo filtru (před offset/limit) — pro hlavičku Content-Range. */
  celkem: number;
};

type Vnoreni = {
  tabulka: string;
  /** 'mnoho': vnořené řádky mají `klic` = id nadřazeného. 'jeden': nadřazený má `klic` = id vnořeného. */
  druh: 'mnoho' | 'jeden';
  klic: string;
};

/**
 * Vnoření, která appka v dotazech používá (cizí klíče z databáze). Jiné vnoření = „neumím" (null),
 * ne tichý odhad.
 */
export const VNORENI: Record<string, Record<string, Vnoreni>> = {
  orders: { order_items: { tabulka: 'order_items', druh: 'mnoho', klic: 'order_id' } },
  order_items: { orders: { tabulka: 'orders', druh: 'jeden', klic: 'order_id' } },
  akce: { akce_items: { tabulka: 'akce_items', druh: 'mnoho', klic: 'akce_id' } },
  akce_items: { akce: { tabulka: 'akce', druh: 'jeden', klic: 'akce_id' } },
};

/** „Tohle neumím vyhodnotit" — zachytí se uvnitř `vyhodnotDotaz` a vrátí se null. */
class Neumim extends Error {}
const neumim = (co: string): never => { throw new Neumim(co); };

/** Trojhodnotová logika jako v SQL: true, false, nebo null („nevím" — porovnání s NULL). */
type Pravda = boolean | null;
type Podminka = (r: Radek) => Pravda;

const ne = (p: Pravda): Pravda => (p === null ? null : !p);
const nebo = (ps: Pravda[]): Pravda => (ps.some((p) => p === true) ? true : ps.some((p) => p === null) ? null : false);
const azaroven = (ps: Pravda[]): Pravda => (ps.some((p) => p === false) ? false : ps.some((p) => p === null) ? null : true);

const JE_DATUM = /^\d{4}-\d{2}-\d{2}/;
const MA_PASMO = /(Z|[+-]\d{2}(:?\d{2})?)$/;

/** Datum s časem jako milisekundy. Čas bez pásma se bere jako UTC (stejně na obou stranách porovnání). */
function casMs(s: string): number {
  const t = s.replace(' ', 'T');
  return Date.parse(MA_PASMO.test(t.slice(10)) ? t : `${t}Z`);
}

/**
 * Porovná hodnotu z řádku s textem z adresy dotazu. Vrací <0, 0, >0. Typ určuje hodnota v řádku
 * (číslo, pravda/nepravda, datum, text) — stejně jako v databázi ho určuje sloupec.
 */
function porovnej(hodnota: unknown, text: string): number {
  if (typeof hodnota === 'number') {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return neumim(`číslo se porovnává s „${text}"`);
    return hodnota < n ? -1 : hodnota > n ? 1 : 0;
  }
  if (typeof hodnota === 'boolean') {
    const t = text.toLowerCase();
    if (t !== 'true' && t !== 'false') return neumim(`pravda/nepravda se porovnává s „${text}"`);
    return Number(hodnota) - Number(t === 'true');
  }
  if (typeof hodnota === 'string') {
    if (JE_DATUM.test(hodnota) && JE_DATUM.test(text) && (hodnota.length > 10 || text.length > 10)) {
      const a = casMs(hodnota);
      const b = casMs(text);
      if (Number.isFinite(a) && Number.isFinite(b)) return a < b ? -1 : a > b ? 1 : 0;
    }
    return hodnota < text ? -1 : hodnota > text ? 1 : 0;
  }
  // Pole a objekty (sloupce JSON) se takhle neporovnávají.
  return neumim('porovnání složené hodnoty');
}

/** Hodnoty ze seznamu `(a,b,"c,d")`. Uvozovky chrání čárky a závorky uvnitř hodnoty. */
export function hodnotySeznamu(v: string): string[] {
  let s = v.trim();
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  const out: string[] = [];
  let cur = '';
  let vUvozovkach = false;
  let bylaUvozovka = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (vUvozovkach && ch === '\\' && i + 1 < s.length) { cur += s[++i]; continue; }
    if (ch === '"') { vUvozovkach = !vUvozovkach; bylaUvozovka = true; continue; }
    if (ch === ',' && !vUvozovkach) { out.push(bylaUvozovka ? cur : cur.trim()); cur = ''; bylaUvozovka = false; continue; }
    cur += ch;
  }
  if (cur !== '' || bylaUvozovka || out.length > 0) out.push(bylaUvozovka ? cur : cur.trim());
  return out;
}

/** Vzor LIKE (`*` i `%` = cokoliv, `_` = jeden znak) jako regulární výraz. */
function vzorLike(vzor: string, bezOhleduNaVelikost: boolean): RegExp {
  const telo = vzor.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '[\\s\\S]*').replace(/_/g, '[\\s\\S]');
  return new RegExp(`^${telo}$`, bezOhleduNaVelikost ? 'iu' : 'u');
}

/** Podmínka pro jeden sloupec: `op.hodnota` (bez případného `not.`). Použitý sloupec si poznačí do `pouzite`. */
function podminkaSloupce(sloupec: string, op: string, hodnota: string, pouzite: Set<string>): Podminka {
  // Filtr na vnořené tabulce (`order_items.quantity`) nebo JSON cesta (`data->>klic`) — to tu není.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sloupec)) return neumim(`sloupec „${sloupec}"`);
  pouzite.add(sloupec);
  const sNull = (f: (h: unknown) => boolean): Podminka => (r) => {
    const h = r[sloupec];
    return h === null || h === undefined ? null : f(h);
  };
  switch (op) {
    case 'eq': return sNull((h) => porovnej(h, hodnota) === 0);
    case 'neq': return sNull((h) => porovnej(h, hodnota) !== 0);
    case 'gt': return sNull((h) => porovnej(h, hodnota) > 0);
    case 'gte': return sNull((h) => porovnej(h, hodnota) >= 0);
    case 'lt': return sNull((h) => porovnej(h, hodnota) < 0);
    case 'lte': return sNull((h) => porovnej(h, hodnota) <= 0);
    case 'in': {
      const seznam = hodnotySeznamu(hodnota);
      return sNull((h) => seznam.some((x) => porovnej(h, x) === 0));
    }
    case 'is': {
      const t = hodnota.toLowerCase();
      if (t === 'null') return (r) => r[sloupec] === null || r[sloupec] === undefined;
      if (t === 'true') return (r) => r[sloupec] === true;
      if (t === 'false') return (r) => r[sloupec] === false;
      return neumim(`is.${hodnota}`);
    }
    case 'like':
    case 'ilike': {
      const re = vzorLike(hodnota, op === 'ilike');
      return sNull((h) => (typeof h === 'string' ? re.test(h) : neumim('like na jiné než textové hodnotě')));
    }
    default: return neumim(`operátor „${op}"`);
  }
}

/** `[not.]op.hodnota` pro daný sloupec. */
function podminkaZHodnoty(sloupec: string, vyraz: string, pouzite: Set<string>): Podminka {
  let v = vyraz;
  let zapor = false;
  if (v.startsWith('not.')) { zapor = true; v = v.slice(4); }
  const tecka = v.indexOf('.');
  if (tecka <= 0) return neumim(`výraz „${vyraz}"`);
  const p = podminkaSloupce(sloupec, v.slice(0, tecka), v.slice(tecka + 1), pouzite);
  return zapor ? (r) => ne(p(r)) : p;
}

/** Rozdělí `a,b(c,d),"e,f"` podle čárek na nejvyšší úrovni (závorky a uvozovky se respektují). */
function rozdelNaUrovni(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let hloubka = 0;
  let vUvozovkach = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (vUvozovkach && ch === '\\' && i + 1 < s.length) { cur += ch + s[++i]; continue; }
    if (ch === '"') vUvozovkach = !vUvozovkach;
    else if (!vUvozovkach && ch === '(') hloubka++;
    else if (!vUvozovkach && ch === ')') hloubka--;
    if (ch === ',' && hloubka === 0 && !vUvozovkach) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (hloubka !== 0 || vUvozovkach) return neumim('nespárované závorky nebo uvozovky');
  if (cur.trim() !== '') out.push(cur);
  return out.map((x) => x.trim());
}

/** Skupina `or`/`and`: `(a.eq.1,b.gte.2,and(c.is.null,d.lt.5))`. */
function podminkaSkupiny(druh: 'or' | 'and', obsah: string, pouzite: Set<string>): Podminka {
  const s = obsah.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) return neumim(`skupina „${obsah}"`);
  const casti = rozdelNaUrovni(s.slice(1, -1)).map((cast): Podminka => {
    const skupina = cast.match(/^(not\.)?(or|and)(\([\s\S]*\))$/);
    if (skupina) {
      const p = podminkaSkupiny(skupina[2] as 'or' | 'and', skupina[3], pouzite);
      return skupina[1] ? (r) => ne(p(r)) : p;
    }
    const tecka = cast.indexOf('.');
    if (tecka <= 0) return neumim(`výraz „${cast}"`);
    return podminkaZHodnoty(cast.slice(0, tecka), cast.slice(tecka + 1), pouzite);
  });
  if (casti.length === 0) return neumim('prázdná skupina');
  return druh === 'or' ? (r) => nebo(casti.map((p) => p(r))) : (r) => azaroven(casti.map((p) => p(r)));
}

type Razeni = { sloupec: string; sestupne: boolean; nullyPrvni: boolean };

function rozeberRazeni(order: string): Razeni[] {
  return rozdelNaUrovni(order).map((cast) => {
    const [sloupec, ...zbytek] = cast.split('.');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sloupec)) return neumim(`řazení podle „${cast}"`);
    let sestupne = false;
    let nully: boolean | null = null;
    for (const z of zbytek) {
      if (z === 'asc') sestupne = false;
      else if (z === 'desc') sestupne = true;
      else if (z === 'nullsfirst') nully = true;
      else if (z === 'nullslast') nully = false;
      else return neumim(`řazení „${cast}"`);
    }
    // Výchozí chování databáze: vzestupně NULL na konci, sestupně na začátku.
    return { sloupec, sestupne, nullyPrvni: nully ?? sestupne };
  });
}

/** Porovnání dvou hodnot téhož sloupce pro řazení (bez NULL — ty řeší volající). */
function poradi(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') {
    if (JE_DATUM.test(a) && JE_DATUM.test(b)) {
      if (a.length > 10 || b.length > 10) {
        const x = casMs(a);
        const y = casMs(b);
        if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    // Text: databáze řadí podle svých jazykových pravidel; tohle je nejbližší místní obdoba.
    const jazykove = a.localeCompare(b, 'en');
    return jazykove !== 0 ? jazykove : a < b ? -1 : a > b ? 1 : 0;
  }
  return neumim('řazení podle složené hodnoty');
}

function serad(radky: Radek[], razeni: Razeni[]): Radek[] {
  if (razeni.length === 0) return radky;
  return radky.slice().sort((x, y) => {
    for (const { sloupec, sestupne, nullyPrvni } of razeni) {
      const a = x[sloupec];
      const b = y[sloupec];
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        return aNull === nullyPrvni ? -1 : 1;
      }
      const p = poradi(a, b);
      if (p !== 0) return sestupne ? -p : p;
    }
    return 0;
  });
}

type Vyber =
  | { druh: 'vse' }
  | { druh: 'sloupec'; sloupec: string; jako: string }
  | { druh: 'vnoreni'; jako: string; vnoreni: Vnoreni; vyber: Vyber[] };

function rozeberVyber(tabulka: string, select: string): Vyber[] {
  return rozdelNaUrovni(select).map((cast): Vyber => {
    if (cast === '*') return { druh: 'vse' };
    const vnorene = cast.match(/^(?:([A-Za-z_][A-Za-z0-9_]*):)?([A-Za-z_][A-Za-z0-9_]*)(![A-Za-z0-9_]+)?\(([\s\S]*)\)$/);
    if (vnorene) {
      const [, alias, vztah, napoveda, vnitrek] = vnorene;
      // `!inner` mění, které nadřazené řádky se vrátí — to tu není.
      if (napoveda) return neumim(`vnoření s nápovědou „${napoveda}"`);
      const vnoreni = VNORENI[tabulka]?.[vztah];
      if (!vnoreni) return neumim(`vnoření ${tabulka} → ${vztah}`);
      return { druh: 'vnoreni', jako: alias ?? vztah, vnoreni, vyber: rozeberVyber(vnoreni.tabulka, vnitrek.trim() === '' ? '*' : vnitrek) };
    }
    const sloupec = cast.match(/^(?:([A-Za-z_][A-Za-z0-9_]*):)?([A-Za-z_][A-Za-z0-9_]*)$/);
    if (!sloupec) return neumim(`výběr „${cast}"`);      // přetypování (::), JSON cesta (->), agregace…
    return { druh: 'sloupec', sloupec: sloupec[2], jako: sloupec[1] ?? sloupec[2] };
  });
}

/** Sloupce tabulky podle její místní kopie (řádky jsou celé, takže stačí první). */
function znameSloupce(radky: readonly Radek[]): Set<string> | null {
  return radky.length > 0 ? new Set(Object.keys(radky[0])) : null;
}

function overSloupce(vyber: Vyber[], radky: readonly Radek[], zdroj: ZdrojTabulek): void {
  const zname = znameSloupce(radky);
  for (const v of vyber) {
    if (v.druh === 'sloupec' && zname && !zname.has(v.sloupec)) neumim(`neznámý sloupec „${v.sloupec}"`);
    if (v.druh === 'vnoreni') {
      const vnorene = zdroj(v.vnoreni.tabulka);
      if (!vnorene) neumim(`chybí kopie tabulky ${v.vnoreni.tabulka}`);
      else overSloupce(v.vyber, vnorene, zdroj);
    }
  }
}

function vyberZRadku(r: Radek, vyber: Vyber[], zdroj: ZdrojTabulek, index: Map<string, Map<unknown, Radek[]>>): Radek {
  const out: Radek = {};
  for (const v of vyber) {
    if (v.druh === 'vse') { Object.assign(out, r); continue; }
    if (v.druh === 'sloupec') { out[v.jako] = r[v.sloupec] ?? null; continue; }
    const { tabulka, druh, klic } = v.vnoreni;
    const klicIndexu = `${tabulka}|${druh === 'mnoho' ? klic : 'id'}`;
    let podleKlice = index.get(klicIndexu);
    if (!podleKlice) {
      podleKlice = new Map();
      for (const x of zdroj(tabulka) ?? []) {
        const k = druh === 'mnoho' ? x[klic] : x.id;
        const seznam = podleKlice.get(k);
        if (seznam) seznam.push(x); else podleKlice.set(k, [x]);
      }
      index.set(klicIndexu, podleKlice);
    }
    if (druh === 'mnoho') {
      out[v.jako] = (podleKlice.get(r.id) ?? []).map((x) => vyberZRadku(x, v.vyber, zdroj, index));
    } else {
      const cil = r[klic] === null || r[klic] === undefined ? undefined : podleKlice.get(r[klic])?.[0];
      out[v.jako] = cil ? vyberZRadku(cil, v.vyber, zdroj, index) : null;
    }
  }
  return out;
}

/** Parametry adresy, které nejsou filtrem sloupce. */
const NEFILTRY = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/**
 * Vyhodnotí dotaz `GET /rest/v1/<tabulka>?<parametry>` nad místní kopií. `null` = neumím nebo kopie není —
 * volající se zachová jako dřív.
 */
export function vyhodnotDotaz(tabulka: string, parametry: URLSearchParams, zdroj: ZdrojTabulek): VysledekDotazu | null {
  const vsechny = zdroj(tabulka);
  if (!vsechny) return null;
  try {
    const podminky: Podminka[] = [];
    const pouzite = new Set<string>();
    for (const [klic, hodnota] of parametry) {
      if (NEFILTRY.has(klic)) continue;
      const skupina = klic.match(/^(not\.)?(or|and)$/);
      if (skupina) {
        const p = podminkaSkupiny(skupina[2] as 'or' | 'and', hodnota, pouzite);
        podminky.push(skupina[1] ? (r) => ne(p(r)) : p);
        continue;
      }
      podminky.push(podminkaZHodnoty(klic, hodnota, pouzite));
    }
    const vyber = rozeberVyber(tabulka, parametry.get('select') || '*');
    overSloupce(vyber, vsechny, zdroj);
    const razeni = rozeberRazeni(parametry.get('order') ?? '');
    // Sloupec, který kopie nezná (překlep, sloupec přidaný po stažení kopie), by se tvářil jako NULL a tiše
    // by vyřadil všechny řádky — to je odhad, ne odpověď.
    const zname = znameSloupce(vsechny);
    if (zname) for (const sloupec of [...pouzite, ...razeni.map((r) => r.sloupec)]) if (!zname.has(sloupec)) neumim(`neznámý sloupec „${sloupec}"`);
    const cislo = (nazev: string): number | null => {
      const v = parametry.get(nazev);
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 ? n : neumim(`${nazev}=${v}`);
    };
    const offset = cislo('offset') ?? 0;
    const limit = cislo('limit');

    const vyhovujici = vsechny.filter((r) => podminky.every((p) => p(r) === true));
    const serazene = serad(vyhovujici as Radek[], razeni);
    const stranka = serazene.slice(offset, limit === null ? undefined : offset + limit);
    const index = new Map<string, Map<unknown, Radek[]>>();
    const jenVse = vyber.length === 1 && vyber[0].druh === 'vse';
    return {
      radky: jenVse ? stranka.map((r) => ({ ...r })) : stranka.map((r) => vyberZRadku(r, vyber, zdroj, index)),
      celkem: vyhovujici.length,
    };
  } catch (e) {
    if (e instanceof Neumim) return null;
    throw e;
  }
}
