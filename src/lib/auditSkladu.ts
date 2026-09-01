// 🔍 Audit skladu — rozpad JEDNÉ položky na dva řádky vedle sebe.
// ---------------------------------------------------------------------------
// Inventura i Sklad počítají ze stejné skladové knihy (lib/stockLedger.ts),
// jenže každá jinou funkcí:
//
//   Inventura → expectedForMonth(mesic)  — OČEKÁVANÝ stav ke konci měsíce.
//               Záměrně nezapočítává inventury zapsané UVNITŘ měsíce; ty jsou
//               přesně to, s čím se očekávaný stav porovnává.
//   Sklad     → stockAsOf(posledni den)  — SKUTEČNÝ stav k datu.
//               Fyzickou inventuru zapsanou uvnitř měsíce naopak bere jako
//               nový výchozí bod.
//
// Dokud za měsíc není uložená fyzická inventura, musí obě čísla vyjít NA KUS
// STEJNĚ — mají stejný výchozí bod i stejné pohyby. Jakmile je uložená, liší
// se přesně o napočítané manko (nebo přebytek), a to je v pořádku.
//
// Jakýkoli JINÝ rozdíl znamená, že se do jednoho z výpočtů propsalo něco, co
// ve druhém není. Tahle karta ho ukáže ve sloupci, kde vznikl, místo aby se
// hádalo z jednoho výsledného čísla.
import { ZAKLAD_NEZADAN } from './stockLedger';
import type { MovementKind, StockLine } from './stockLedger';

/**
 * Jeden řádek rozpadu. Odbytové sloupce jsou KLADNÉ ve smyslu „tolik kusů
 * ubylo" — na obrazovce se před ně píše minus. Přefuk a dorovnání jdou oběma
 * směry, ty nesou znaménko.
 */
export type AuditRadek = {
  pocatecni: number;
  stoceno: number;
  objednavky: number;
  fasovani: number;
  prodejna: number;
  akce: number;
  odpis: number;
  /** Sudy odepsané ze skladu proto, že se z nich stáčely lahve. */
  sudyNaLahve: number;
  /** Přefuk mezi obaly — do tohoto obalu přiteklo (+) / odteklo (−). */
  prefuk: number;
  /** Ruční dorovnání inventury (±). */
  dorovnani: number;
  konec: number;
};

const zn = (kinds: Partial<Record<MovementKind, number>>, k: MovementKind) => kinds[k] ?? 0;

/**
 * Rozloží řádek skladové knihy na sloupce auditu.
 *
 * Chybějící řádek (položka, se kterou se za celý měsíc nic nestalo) dá samé
 * nuly — ne prázdno. Prázdné buňky by se v porovnání dvou řádků četly jako
 * „nevím", a přitom je to poctivá nula.
 */
export function auditRadek(line: StockLine | undefined): AuditRadek {
  const kinds = line?.byKind ?? {};
  return {
    pocatecni: line?.baselineQty ?? 0,
    stoceno: zn(kinds, 'kegovani') + zn(kinds, 'staceni'),
    objednavky: -zn(kinds, 'zavoz'),
    fasovani: -zn(kinds, 'fasovani'),
    prodejna: -zn(kinds, 'prodejna'),
    akce: -zn(kinds, 'akce'),
    odpis: -zn(kinds, 'odpis'),
    sudyNaLahve: -zn(kinds, 'sud_na_lahve'),
    prefuk: zn(kinds, 'prefuk_do') + zn(kinds, 'prefuk_z'),
    dorovnani: zn(kinds, 'dorovnani'),
    konec: line?.qty ?? 0,
  };
}

/**
 * Kontrolní součet řádku: sedí konec na to, co je před ním?
 *
 * Je to pojistka na sebe sama — kdyby do skladové knihy přibyl nový druh
 * pohybu a zapomnělo se ho sem doplnit, tenhle součet přestane sedět a karta
 * to ukáže. Bez toho by nový pohyb tiše zmizel ze sloupců a rozdíl by se
 * sváděl na Inventuru nebo Sklad.
 */
export function konecZeSloupcu(r: AuditRadek): number {
  return r.pocatecni + r.stoceno + r.prefuk + r.dorovnani
    - r.objednavky - r.fasovani - r.prodejna - r.akce - r.odpis - r.sudyNaLahve;
}

/** Sloupce, které se porovnávají mezi řádkem Inventury a řádkem Skladu. */
export const AUDIT_SLOUPCE = [
  'pocatecni', 'stoceno', 'objednavky', 'fasovani', 'prodejna',
  'akce', 'odpis', 'sudyNaLahve', 'prefuk', 'dorovnani', 'konec',
] as const;
export type AuditSloupec = typeof AUDIT_SLOUPCE[number];

export const AUDIT_NADPISY: Record<AuditSloupec, string> = {
  pocatecni: 'Počáteční',
  stoceno: 'Stočeno',
  objednavky: 'Objednávky',
  fasovani: 'Fasování',
  prodejna: 'Prodejna',
  akce: 'Akce',
  odpis: 'Odpis',
  sudyNaLahve: 'Sudy na lahve',
  prefuk: 'Přefuk',
  dorovnani: 'Dorovnání',
  konec: 'Konec měsíce',
};

export type PorovnaniPolozky = {
  inventura: AuditRadek;
  sklad: AuditRadek;
  /** Sloupce, ve kterých se oba řádky liší. Prázdné pole = sedí všechno. */
  rozdilne: AuditSloupec[];
  /** Rozdíl ve výsledném stavu (sklad − inventura). */
  rozdilKonec: number;
  /** Nesedí řádku vlastní součet? Pak chybí sloupec, ne data. */
  soucetNesedi: boolean;
  /**
   * Počáteční stav není za tenhle měsíc zadaný a Inventura počítá od nuly.
   *
   * Nastane, když k prvnímu dni měsíce leží jen NAPOČÍTANÁ inventura
   * („Fyzická" / „Schválená") a chybí „Počáteční stav". Napočítanou hodnotu
   * expectedForMonth záměrně vyřazuje — je to právě to, s čím se porovnává —
   * a místo ní dosadí nulu (ZAKLAD_NEZADAN). Sklad si napočítanou hodnotu
   * vezme jako základ, takže se řádky liší v POČÁTEČNÍM stavu. Sloupce pohybů
   * sedět musí; rozdíl v nich by byl skutečná chyba.
   */
  chybiZaklad: boolean;
};

/**
 * Porovná řádek Inventury s řádkem Skladu.
 *
 * `rozdilne` schválně nehlásí jen výsledek, ale KAŽDÝ sloupec zvlášť. Rozdíl
 * ve výsledku se dá vysvětlit uloženou inventurou; rozdíl ve stočení nebo
 * v objednávkách vysvětlit nejde a je to chyba.
 */
export function porovnejPolozku(
  inventuraLine: StockLine | undefined,
  skladLine: StockLine | undefined,
): PorovnaniPolozky {
  const inventura = auditRadek(inventuraLine);
  const sklad = auditRadek(skladLine);
  const rozdilne = AUDIT_SLOUPCE.filter((s) => inventura[s] !== sklad[s]);
  return {
    inventura,
    sklad,
    rozdilne,
    rozdilKonec: sklad.konec - inventura.konec,
    soucetNesedi:
      konecZeSloupcu(inventura) !== inventura.konec ||
      konecZeSloupcu(sklad) !== sklad.konec,
    chybiZaklad: inventuraLine?.baselineNote === ZAKLAD_NEZADAN,
  };
}

/** Má se položka v auditu vůbec ukázat? Nuly na obou stranách nikoho nezajímají. */
export function maCoUkazat(p: PorovnaniPolozky): boolean {
  return AUDIT_SLOUPCE.some((s) => p.inventura[s] !== 0 || p.sklad[s] !== 0);
}

/**
 * Jak se sloupec chová ve znaménku:
 *   'stav'      — počáteční a konečný stav, píše se jak je,
 *   'prirustek' — přibylo (stočení), případně ubylo, znaménko nese hodnota,
 *   'odbyt'     — kolik kusů ubylo; hodnota je kladná a před ni patří minus.
 *
 * Bez tohohle rozdělení se v tabulce nedá poznat, jestli „12" znamená příjem
 * nebo výdej — a přesně to má karta ukázat na první pohled.
 */
export function povahaSloupce(sl: AuditSloupec): 'stav' | 'prirustek' | 'odbyt' {
  if (sl === 'pocatecni' || sl === 'konec') return 'stav';
  if (sl === 'stoceno' || sl === 'prefuk' || sl === 'dorovnani') return 'prirustek';
  return 'odbyt';
}

/** Text buňky auditu — včetně znaménka. */
export function bunkaAuditu(sl: AuditSloupec, hodnota: number): string {
  switch (povahaSloupce(sl)) {
    case 'stav': return String(hodnota);
    case 'prirustek': return hodnota > 0 ? `+${hodnota}` : String(hodnota);
    case 'odbyt': return hodnota === 0 ? '0' : `−${hodnota}`;
  }
}
