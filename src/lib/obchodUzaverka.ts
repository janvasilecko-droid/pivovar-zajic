// 🧾 Uzávěrka obchodu: období, přiřazení zboží k pivu a obalu, kontrola před zápisem.
// ---------------------------------------------------------------------------
// Čtení z fotky dělá edge funkce parse-uzaverka-image, číselná kontrola
// supabase/functions/_shared/uzaverka.ts. Tady je to, co je potřeba kolem:
//
//  • období uzávěrky (denní / týdenní / měsíční) a hlídání, aby se dvě
//    uzávěrky nepřekrývaly — jinak by se tytéž prodané kusy odečetly dvakrát,
//  • přiřazení zboží z pokladny (podle KÓDU) k pivu a obalu z katalogu.
//    Návrh z názvu („Pivo PET 1l 12° světlá") je jen nápověda: potvrdí ho
//    člověk a zapíše se k KÓDU — příště už se nehádá,
//  • všechno, co brání zápisu.
import type { KatalogObal, KatalogPivo } from './fotkaPolozky';
import { klicPivaObalu, type TypUzaverky, type UzaverkaHlavicka, type Zbozi } from './obchodSklad';
import { zkontrolujUzaverku, type PrectenaUzaverka, type RadekUzaverky } from '../../supabase/functions/_shared/uzaverka';

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// ── Období ───────────────────────────────────────────────────────────────

const pridejDny = (iso: string, dny: number) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + dny * 86_400_000).toISOString().slice(0, 10);

/** Výchozí období uzávěrky podle typu a data tisku (pondělí–neděle, celý měsíc, jeden den). */
export function obdobiUzaverky(typ: TypUzaverky, datumISO: string): { od: string; do: string } {
  if (typ === 'denni') return { od: datumISO, do: datumISO };
  if (typ === 'tydenni') {
    const den = new Date(datumISO + 'T00:00:00Z').getUTCDay(); // 0 = neděle
    const odPondeli = (den + 6) % 7;
    const pondeli = pridejDny(datumISO, -odPondeli);
    return { od: pondeli, do: pridejDny(pondeli, 6) };
  }
  const [r, m] = datumISO.split('-').map(Number);
  const prvni = `${r}-${String(m).padStart(2, '0')}-01`;
  const posledni = new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
  return { od: prvni, do: posledni };
}

/** Datum z času tisku („2026-10-10T10:09" → „2026-10-10"). */
export const datumZVytisteno = (vytisteno: string | null | undefined): string | null =>
  vytisteno && /^\d{4}-\d{2}-\d{2}/.test(vytisteno) ? vytisteno.slice(0, 10) : null;

/**
 * Uzávěrky, jejichž období se kryje s novým — stejné středisko. Překryv
 * znamená, že by se tytéž prodané kusy odečetly dvakrát (denní uzávěrky
 * a k nim týdenní za stejný týden).
 */
export function prekryvajiciUzaverky<T extends Pick<UzaverkaHlavicka, 'datum_od' | 'datum_do' | 'stredisko'>>(
  nova: { od: string; do: string; stredisko: string | null },
  existujici: T[],
): T[] {
  return existujici.filter(
    (u) => (u.stredisko ?? '') === (nova.stredisko ?? '') && u.datum_od <= nova.do && u.datum_do >= nova.od,
  );
}

// ── Návrh přiřazení zboží ───────────────────────────────────────────────

/**
 * Objem z čísla na účtence. Pokladna tiskne malé „l" jako číslici 1:
 * „30l" = „301", „0,5l" = „0,51", „0,33l" = „0,331", „PET 1l" = „PET 11",
 * „PET 1,5l" = „PET 1,51". Přebytečná jednička na konci se odřízne.
 */
export function objemZCisla(text: string): number | null {
  const t = text.replace(',', '.').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  if (t.includes('.')) {
    const [cele, desetiny] = t.split('.');
    const des = desetiny.length >= 2 && desetiny.endsWith('1') ? desetiny.slice(0, -1) : desetiny;
    return Number(`${cele}.${des}`);
  }
  if (t.length >= 2 && t.length <= 3 && t.endsWith('1')) return Number(t.slice(0, -1));
  return Number(t);
}

export type DruhObalu = 'sud' | 'sklo' | 'pet';

/** Druh a objem obalu z názvu zboží („Pivo sud 30l …", „Pivo sklo … 0,5l", „Pivo PET 1,5l …"). */
export function obalZNazvu(nazev: string): { druh: DruhObalu; objem: number } | null {
  const t = norm(nazev);
  const sud = t.match(/\b(?:sud|keg)\s*(\d{1,3})\s*l?\b/);
  if (sud) {
    const objem = objemZCisla(sud[1]);
    return objem ? { druh: 'sud', objem } : null;
  }
  const pet = t.match(/\bpet\s*(\d+(?:[.,]\d+)?)\s*l?\b/);
  if (pet) {
    const objem = objemZCisla(pet[1]);
    return objem ? { druh: 'pet', objem } : null;
  }
  if (/\b(?:sklo|lahev|lahve)\b/.test(t)) {
    const des = [...t.matchAll(/(\d[.,]\d+)/g)].map((m) => m[1]);
    const objem = des.length ? objemZCisla(des[des.length - 1]) : null;
    return objem ? { druh: 'sklo', objem } : null;
  }
  return null;
}

/** Obal z katalogu podle druhu a objemu; null, když nesedí nebo je jich víc stejně dobrých. */
export function obalZKatalogu(nazev: string, obaly: KatalogObal[]): KatalogObal | undefined {
  const o = obalZNazvu(nazev);
  if (!o) return undefined;
  const jeSud = o.druh === 'sud';
  // V databázi je druh jen 'keg' / 'bottle' (PET je 'bottle'), 'pet' se toleruje pro jistotu.
  const sedi = (k: string | null | undefined) => !k || (jeSud ? k === 'keg' : k === 'bottle' || k === 'pet');
  const shody = obaly.filter((p) => sedi(p.kind) && Math.abs(Number(p.volume_l) - o.objem) < 0.01);
  if (shody.length <= 1) return shody[0];
  const slovo = o.druh === 'pet' ? 'pet' : o.druh === 'sklo' ? 'lahv' : '';
  const podleSlova = slovo ? shody.filter((p) => norm(p.label).includes(slovo)) : [];
  return podleSlova.length === 1 ? podleSlova[0] : undefined;
}

const stupenPiva = (b: KatalogPivo): number | null => {
  const z = `${b.degree ?? ''} ${b.name}`.match(/(\d{1,2})/);
  return z ? Number(z[1]) : null;
};

/** Stupeň z názvu na účtence: „10°", „10è" (pokladna tiskne è/é), „10%". */
const stupenZNazvu = (t: string): number | null => {
  const m = t.match(/(\d{1,2})\s*[°%e]/);
  return m ? Number(m[1]) : null;
};

/**
 * Pivo z katalogu podle názvu zboží. Vrací jen to, co je jednoznačné —
 * dvě sedící piva jsou „nevím", ne tip.
 */
export function pivoZNazvu(nazev: string, piva: KatalogPivo[]): KatalogPivo | undefined {
  const t = norm(nazev);
  const podleJmena = (re: RegExp) => piva.filter((b) => re.test(norm(b.name)));
  if (/jantar/.test(t)) return podleJmena(/jantar/)[0];
  if (/cyklist|vosm|osm/.test(t)) {
    const jmeno = podleJmena(/osma|osm|cyklist|vosm/);
    if (jmeno.length === 1) return jmeno[0];
  }
  const stupen = stupenZNazvu(t);
  if (stupen == null) return undefined;
  let kandidati = piva.filter((b) => stupenPiva(b) === stupen);
  if (kandidati.length > 1) {
    const tmave = /tmav/.test(t);
    kandidati = kandidati.filter((b) => /tmav/.test(norm(b.name)) === tmave);
  }
  if (kandidati.length > 1) kandidati = kandidati.filter((b) => !/jantar/.test(norm(b.name)));
  return kandidati.length === 1 ? kandidati[0] : undefined;
};

export type NavrhZbozi = {
  /** Pivo z pokladny začíná slovem „Pivo" — ostatní zboží (limo, saponát…) se nesleduje po pivech. */
  jePivo: boolean;
  beer?: KatalogPivo;
  pkg?: KatalogObal;
};

export function navrhZbozi(nazev: string, piva: KatalogPivo[], obaly: KatalogObal[]): NavrhZbozi {
  const jePivo = /^\s*pivo\b/.test(norm(nazev));
  if (!jePivo) return { jePivo: false };
  return { jePivo: true, beer: pivoZNazvu(nazev, piva), pkg: obalZKatalogu(nazev, obaly) };
}

// ── Kontrola před zápisem ───────────────────────────────────────────────

/** Jak je přiřazený řádek z účtenky: ke známému zboží, k pivu a obalu, nebo jako ostatní zboží. */
export type PrirazeniRadku =
  | { druh: 'zname' }
  | { druh: 'pivo'; beerId: string; pkgId: string }
  | { druh: 'ostatni' }
  | { druh: 'nevyreseno' };

export type RadekKZapisu = RadekUzaverky & { prirazeni: PrirazeniRadku };

export type VstupZapisu = {
  typ: TypUzaverky | null;
  od: string;
  do: string;
  cislo: string | null;
  stredisko: string | null;
  vytisteno: string | null;
  celkem: number | null;
  radky: RadekKZapisu[];
  znameZbozi: Zbozi[];
  existujiciUzaverky: Pick<UzaverkaHlavicka, 'datum_od' | 'datum_do' | 'stredisko' | 'cislo' | 'typ'>[];
};

export type NoveZbozi = { kod: string; nazev: string; beer_id: string | null; package_id: string | null; cena: number | null };

export type PripravenyZapis = {
  chyby: string[];
  noveZbozi: NoveZbozi[];
};

/**
 * Co brání uložení uzávěrky a jaké zboží se při ní založí. Prázdné `chyby`
 * znamenají, že je možné ukládat. Čísla účtenky se kontrolují znovu — i po
 * ruční opravě obsluhou.
 */
export function pripravZapis(v: VstupZapisu): PripravenyZapis {
  const chyby: string[] = [];

  if (!v.typ) chyby.push('Vyber, jaká uzávěrka to je (denní, týdenní, měsíční).');
  if (!v.od || !v.do) chyby.push('Doplň období uzávěrky.');
  else if (v.do < v.od) chyby.push('Konec období je dřív než začátek.');

  const uctenka: PrectenaUzaverka = {
    cislo: v.cislo, stredisko: v.stredisko, vytisteno: v.vytisteno, celkem: v.celkem,
    radky: v.radky.map(({ kod, nazev, mnozstvi, cena, celkem }) => ({ kod, nazev, mnozstvi, cena, celkem })),
  };
  for (const p of zkontrolujUzaverku(uctenka).problemy) chyby.push(p.text);

  if (v.od && v.do && v.do >= v.od) {
    const prekryv = prekryvajiciUzaverky({ od: v.od, do: v.do, stredisko: v.stredisko }, v.existujiciUzaverky);
    if (prekryv.length > 0) {
      const text = prekryv
        .map((u) => `${u.cislo ? `č. ${u.cislo}, ` : ''}${u.datum_od === u.datum_do ? u.datum_od : `${u.datum_od} až ${u.datum_do}`}`)
        .join('; ');
      chyby.push(`Období se kryje s už zapsanou uzávěrkou (${text}). Tytéž kusy by se odečetly dvakrát — smaž tu starší, nebo uprav období.`);
    }
  }
  if (v.cislo) {
    const stejna = v.existujiciUzaverky.find((u) => u.cislo === v.cislo && (u.stredisko ?? '') === (v.stredisko ?? ''));
    if (stejna) chyby.push(`Uzávěrka č. ${v.cislo} už je zapsaná.`);
  }

  const zname = new Set(v.znameZbozi.map((z) => z.kod));
  const noveZbozi: NoveZbozi[] = [];
  const obsazenaDvojice = new Map(
    v.znameZbozi.filter((z) => z.aktivni !== false && z.beer_id && z.package_id).map((z) => [klicPivaObalu(z.beer_id, z.package_id), z.kod]),
  );

  for (const r of v.radky) {
    if (!r.kod) continue;
    const kdo = `${r.kod} ${r.nazev}`.trim();
    if (zname.has(r.kod)) continue;
    if (r.prirazeni.druh === 'nevyreseno' || r.prirazeni.druh === 'zname') {
      chyby.push(`${kdo}: zboží ještě není v obchodě — vyber, co to je (pivo a obal, nebo ostatní zboží).`);
      continue;
    }
    if (r.prirazeni.druh === 'ostatni') {
      noveZbozi.push({ kod: r.kod, nazev: r.nazev, beer_id: null, package_id: null, cena: r.cena });
      continue;
    }
    if (!r.prirazeni.beerId || !r.prirazeni.pkgId) {
      chyby.push(`${kdo}: vyber pivo i obal.`);
      continue;
    }
    const k = klicPivaObalu(r.prirazeni.beerId, r.prirazeni.pkgId);
    const jiny = obsazenaDvojice.get(k);
    if (jiny && jiny !== r.kod) {
      chyby.push(`${kdo}: tohle pivo v tomhle obalu už má v obchodě zboží s kódem ${jiny}.`);
      continue;
    }
    obsazenaDvojice.set(k, r.kod);
    noveZbozi.push({ kod: r.kod, nazev: r.nazev, beer_id: r.prirazeni.beerId, package_id: r.prirazeni.pkgId, cena: r.cena });
  }

  return { chyby, noveZbozi };
}
