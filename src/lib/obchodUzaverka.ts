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
import { klicPivaObalu, type ProdanyRadek, type TypUzaverky, type UzaverkaHlavicka, type Zbozi } from './obchodSklad';
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

/** Už zapsaná uzávěrka (hlavička) — to, co se o ní ví při kontrole, že se nezapíše podruhé. */
export type ZapsanaUzaverka = Pick<UzaverkaHlavicka, 'datum_od' | 'datum_do' | 'stredisko' | 'cislo' | 'typ' | 'trzba'> & {
  id?: string;
  vytisteno?: string | null;
};
/** Řádek už zapsané uzávěrky. */
export type ZapsanyRadek = Pick<ProdanyRadek, 'uzaverka_id' | 'kod' | 'mnozstvi' | 'cena'>;

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
  existujiciUzaverky: ZapsanaUzaverka[];
  /** Řádky už zapsaných uzávěrek — k poznání, že je tatáž účtenka zapisovaná podruhé (viz najdiDuplicity). */
  zapsaneRadky?: ZapsanyRadek[];
  /** Obsluha potvrdila, že účtenka číslo uzávěrky nemá. */
  potvrzenoBezCisla?: boolean;
  /** Obsluha potvrdila, že podobná zapsaná uzávěrka je jiná účtenka. */
  souhlasPodobna?: boolean;
};

// ── Totéž podruhé ───────────────────────────────────────────────────────
// 14. 10. 2026, majitel: účtenka se může vyfotit na víckrát (je to dlouhý pásek)
// a „stejná data se nesmí sčítat nebo odečítat víckrát". Uzávěrka, která se uloží
// dvakrát, by odečetla prodané kusy ze skladu dvakrát — proto tři pojistky:
//   1. stejné číslo uzávěrky (a středisko)             — pripravZapis níž,
//   2. stejný čas tisku a stejné Celkem                  — najdiDuplicity (`stejna`),
//   3. řada řádků úplně stejných (kód, množství, cena)   — najdiDuplicity (`podobne`).
// Druhá hlídá, když číslo na fotce nebylo vidět; třetí, když chybí i čas tisku
// a Celkem (fotka jen části účtenky).

export type PodobnaUzaverka = {
  uzaverka: ZapsanaUzaverka;
  /** Kolik řádků nové účtenky je v zapsané se stejným kódem, množstvím i cenou. */
  shodnych: number;
  /** Kolik řádků nové účtenky bylo s čím porovnat (má kód a množství). */
  zNovych: number;
};

export type Duplicity = {
  /** Tatáž účtenka už je zapsaná (stejný čas tisku a Celkem) — uložit nejde. */
  stejna: ZapsanaUzaverka[];
  /** Zapsané uzávěrky s řadou stejných řádků v překrývajícím se období — uložit až po potvrzení. */
  podobne: PodobnaUzaverka[];
};

const naMinuty = (t: string | null | undefined) => (t ?? '').slice(0, 16);
const naCislo = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Zapsané uzávěrky, jejichž data se s novou účtenkou kryjí. `podobne` se hledají
 * jen v překrývajícím se období a u JINÉHO střediska — u stejného střediska
 * se překrývající období zakazuje už pripravZapis. Řádky se porovnávají přesně
 * (kód, množství, cena): dvě různé účtenky v tentýž den sdílejí nanejvýš pár
 * řádků, kdežto tatáž účtenka podruhé skoro všechny.
 */
export function najdiDuplicity(
  nova: { od: string; do: string; stredisko: string | null; vytisteno: string | null; celkem: number | null; radky: RadekUzaverky[] },
  existujici: ZapsanaUzaverka[],
  zapsaneRadky: ZapsanyRadek[] = [],
): Duplicity {
  const cas = naMinuty(nova.vytisteno);
  const stejna = existujici.filter((u) => {
    const trzba = naCislo(u.trzba);
    return cas.length === 16 && naMinuty(u.vytisteno) === cas && trzba != null && nova.celkem != null && Math.abs(trzba - nova.celkem) < 0.005;
  });

  const podleUzaverky = new Map<string, ZapsanyRadek[]>();
  for (const r of zapsaneRadky) podleUzaverky.set(r.uzaverka_id, [...(podleUzaverky.get(r.uzaverka_id) ?? []), r]);
  const porovnatelne = nova.radky.filter((r) => r.kod.trim() !== '' && Number.isFinite(r.mnozstvi));

  const podobne: PodobnaUzaverka[] = [];
  for (const u of existujici) {
    if (!u.id || stejna.includes(u)) continue;
    if (!(u.datum_od <= nova.do && u.datum_do >= nova.od)) continue;
    if ((u.stredisko ?? '') === (nova.stredisko ?? '')) continue; // stejné středisko hlídá pripravZapis
    const radky = podleUzaverky.get(u.id) ?? [];
    let shodnych = 0;
    for (const r of porovnatelne) {
      const kod = r.kod.trim();
      const stejnyRadek = radky.some((z) => {
        if (z.kod !== kod || Number(z.mnozstvi) !== r.mnozstvi) return false;
        const cenaZapsana = naCislo(z.cena);
        return cenaZapsana == null || r.cena == null || Math.abs(cenaZapsana - r.cena) < 0.005;
      });
      if (stejnyRadek) shodnych++;
    }
    if (shodnych >= 2 && shodnych * 2 >= porovnatelne.length) podobne.push({ uzaverka: u, shodnych, zNovych: porovnatelne.length });
  }
  return { stejna, podobne };
}

/** Jak se zapsaná uzávěrka ukáže v hlášce: „č. 2/2873, 10. 10. 2026, středisko 2". */
export function popisZapsane(u: ZapsanaUzaverka): string {
  const obdobi = u.datum_od === u.datum_do ? u.datum_od : `${u.datum_od} až ${u.datum_do}`;
  return [u.cislo ? `č. ${u.cislo}` : null, obdobi, u.stredisko ? `středisko ${u.stredisko}` : null].filter(Boolean).join(', ');
}

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
  let uzJeZapsana = false;
  const cisloUzaverky = v.cislo?.trim() ?? '';
  if (cisloUzaverky) {
    const stejna = v.existujiciUzaverky.find((u) => u.cislo === cisloUzaverky && (u.stredisko ?? '') === (v.stredisko ?? ''));
    if (stejna) { chyby.push(`Uzávěrka č. ${cisloUzaverky} už je zapsaná.`); uzJeZapsana = true; }
  } else if (!v.potvrzenoBezCisla) {
    // Číslo uzávěrky je jediné, podle čeho se spolehlivě pozná, že účtenka už je zapsaná
    // (fotka, na které začátek účtenky nebyl vidět, ho nemá).
    chyby.push('Doplň číslo uzávěrky z účtenky („Uzaverka: 2/2873“) — podle něj appka pozná, že už je zapsaná. Když účtenka číslo nemá, potvrď to.');
  }
  const duplicity = najdiDuplicity(
    { od: v.od, do: v.do, stredisko: v.stredisko, vytisteno: v.vytisteno, celkem: v.celkem, radky: uctenka.radky },
    v.existujiciUzaverky,
    v.zapsaneRadky,
  );
  if (!uzJeZapsana) {
    for (const u of duplicity.stejna) {
      chyby.push(`Tahle účtenka už je zapsaná (uzávěrka ${popisZapsane(u)}, vytištěno ${naMinuty(u.vytisteno).replace('T', ' ')}, Celkem ${naCislo(u.trzba)}) — znovu se zapsat nedá, prodané kusy by se odečetly ze skladu podruhé.`);
    }
  }
  if (!v.souhlasPodobna) {
    for (const p of duplicity.podobne) {
      chyby.push(`Zapsaná uzávěrka ${popisZapsane(p.uzaverka)} má ${p.shodnych} z ${p.zNovych} řádků úplně stejných (kód, množství i cena) — nejspíš tatáž účtenka vyfocená podruhé. Když je to jiná účtenka, potvrď to.`);
    }
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
