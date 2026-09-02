// 🗓️ Týdenní inventura — počítat každý týden, ne jednou za měsíc.
// ---------------------------------------------------------------------------
// Měsíční uzávěrka je poctivá, ale pozdní: když se v půlce srpna nezapíše
// stáčení, přijde se na to až koncem měsíce a dohledávání je pak archeologie.
// Týdenní kontrola zkrátí smyčku na sedm dní — rozdíl se hledá v týdnu, který
// má člověk ještě v hlavě.
//
// DVĚ VĚCI, KTERÉ TENHLE MODUL SCHVÁLNĚ NEDĚLÁ:
//
//  1. NEZAPISUJE RESET. Řádek v `inventory` je podle skladové knihy reset —
//     k jeho datu se stav ROVNÁ zapsanému číslu a starší pohyby padají pod
//     stůl. Uložit týdenní počítání tudy by každý rozdíl tiše spolklo: číslo
//     by sedělo, ale stáčení KEG, stáčení lahví ani sklad by o něm nevěděly.
//     Rozdíl se místo toho propíše TAM, KDE VZNIKL (viz inventoryFix.ts) —
//     a všechny obrazovky ho vidí, protože čtou tytéž tabulky.
//  2. NEPOČÍTÁ NIC NOVÉHO. Očekávaný stav je `stockForObdobi` ze skladové
//     knihy, tedy stejná matematika jako Sklad a měsíční inventura. Kdyby si
//     tenhle soubor počítal po svém, vyrobil by třetí verzi pravdy — přesně
//     to, co má týdenní kontrola odhalovat.
import type { StockLine } from './stockLedger';
import { jeSud } from './inventoryFix';

export type TydenObdobi = {
  /** Pondělí kontrolovaného týdne, YYYY-MM-DD. */
  od: string;
  /** Neděle téhož týdne. */
  do: string;
  /**
   * Do kdy se skutečně počítá. U uzavřeného týdne je to neděle, u běžícího
   * DNEŠEK — jinak by očekávaný stav sahal do budoucnosti a srovnávací zápis
   * by dostal datum, které ještě nenastalo. Přesně tak zmizelo 17 sudů
   * Summer Ale na 30. 9. 2026 u měsíční verze.
   */
  doPocitani: string;
  /** Skončil už ten týden? */
  uzavreny: boolean;
};

const DEN_MS = 24 * 60 * 60 * 1000;

/** Pondělí týdne, do kterého datum spadá (ISO týden). */
export function pondeliTydne(datumISO: string): string {
  const d = new Date(datumISO + 'T00:00:00Z');
  const den = d.getUTCDay(); // 0 = neděle
  d.setUTCDate(d.getUTCDate() - (den === 0 ? 6 : den - 1));
  return d.toISOString().slice(0, 10);
}

/** Posun data o N dní, zůstává YYYY-MM-DD. */
export function posunDnu(datumISO: string, oKolik: number): string {
  return new Date(new Date(datumISO + 'T00:00:00Z').getTime() + oKolik * DEN_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Období kontrolovaného týdne.
 *
 * @param dnesISO dnešek
 * @param posun   0 = týden, ve kterém dnešek leží; −1 = ten předchozí atd.
 */
export function tydenObdobi(dnesISO: string, posun = 0): TydenObdobi {
  const od = posunDnu(pondeliTydne(dnesISO), posun * 7);
  const doNedele = posunDnu(od, 6);
  const uzavreny = doNedele < dnesISO;
  return {
    od,
    do: doNedele,
    doPocitani: doNedele <= dnesISO ? doNedele : dnesISO,
    uzavreny,
  };
}

/**
 * Který týden nabídnout při otevření.
 *
 * Kontroluje se týden, který skončil — v pondělí a v úterý tedy ten minulý.
 * Uprostřed týdne už dává smysl běžící týden: víc než polovina je za námi
 * a člověk se dívá na to, co právě dělal. Stejná úvaha jako u
 * `vychoziMesicInventury` v inventoryFix.ts, jen o řád kratší.
 */
export function vychoziTyden(dnesISO: string): number {
  const den = new Date(dnesISO + 'T00:00:00Z').getUTCDay(); // 1 = pondělí
  return den === 1 || den === 2 ? -1 : 0;
}

const MESICE_ZKRATKA = ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.', '10.', '11.', '12.'];

/** „2026-08-31" + „2026-09-06" → „31. 8. – 6. 9. 2026". */
export function popisTydne(od: string, doDne: string): string {
  const kus = (iso: string, sRokem: boolean) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d}. ${MESICE_ZKRATKA[m - 1]}${sRokem ? ` ${y}` : ''}`;
  };
  return `${kus(od, false)} – ${kus(doDne, true)}`;
}

/**
 * Štítek týdne do poznámek zápisů — dosazuje se tam, kde měsíční verze píše
 * „2026-08". Poznámka pak zní „Doplněno z inventury týdne 2026-08-31 — …",
 * takže jde zpětně najít i smazat po týdnech (viz smazání srovnání v
 * InventoryScreen.tsx), ne jen po měsících.
 */
export function stitekTydne(od: string): string {
  return `týdne ${od}`;
}

export type TydenniRadek = {
  klic: string;
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  package_kind?: string;
  /** Co sklad čeká ke konci období. */
  ocekavano: number;
  /** Co se napočítalo. `null` = ještě se nepočítalo. */
  napocitano: number | null;
  /** napočítáno − očekáváno. Bez zadaného počtu 0 — nezadané není manko. */
  rozdil: number;
  /** Kolik kusů se s položkou za týden dělo (příjem i výdej v absolutní hodnotě). */
  pohybuVTydnu: number;
  /** Sud, nebo lahev — rozhoduje, kam se rozdíl propíše. */
  sud: boolean;
};

export type KatalogPivo = { id: string; name: string };
export type KatalogObal = { id: string; label: string; kind?: string; volume_l?: number };

/**
 * Poskládá řádky týdenní inventury ze skladové knihy a napočítaných hodnot.
 *
 * `napocitano` je mapa klíč → text z políčka. Prázdný text znamená „ještě se
 * nepočítalo", ne nulu: nula je legitimní výsledek („nic tu není") a splést
 * si ji s nevyplněným polem by vyrobilo manko na každé položce, které se
 * člověk nedotkl.
 */
export function radkyTydne(
  sklad: Map<string, StockLine>,
  piva: KatalogPivo[],
  obaly: KatalogObal[],
  napocitano: Record<string, string>,
): TydenniRadek[] {
  const jmenoPiva = new Map(piva.map((b) => [b.id, b.name]));
  const poradiPiva = new Map(piva.map((b, i) => [b.id, i]));
  const obalPodleId = new Map(obaly.map((p) => [p.id, p]));
  const poradiObalu = new Map(obaly.map((p, i) => [p.id, i]));

  const radky: TydenniRadek[] = [];
  sklad.forEach((line, klic) => {
    // Zápisy na pivo nebo obal, který v číselníku není, se do knihy počítají,
    // ale pojmenovat je nejde — a bez jména se nedá počítat. Hlídá je
    // hloubkový audit (kontrolaNeznamychPolozek), sem nepatří.
    const obal = obalPodleId.get(line.package_id);
    if (!jmenoPiva.has(line.beer_id) || !obal) return;

    const zadano = (napocitano[klic] ?? '').trim();
    const cislo = zadano === '' ? null : Number(zadano.replace(',', '.'));
    const platne = cislo !== null && Number.isFinite(cislo) ? cislo : null;

    radky.push({
      klic,
      beer_id: line.beer_id,
      beer_name: jmenoPiva.get(line.beer_id)!,
      package_id: line.package_id,
      package_label: obal.label,
      package_kind: obal.kind,
      ocekavano: line.qty,
      napocitano: platne,
      rozdil: platne === null ? 0 : platne - line.qty,
      pohybuVTydnu: Object.values(line.byKind).reduce((s, v) => s + Math.abs(v ?? 0), 0),
      sud: jeSud(obal.kind, obal.label),
    });
  });

  return radky.sort((a, b) => {
    const p = (poradiPiva.get(a.beer_id) ?? 999) - (poradiPiva.get(b.beer_id) ?? 999);
    if (p !== 0) return p;
    return (poradiObalu.get(a.package_id) ?? 999) - (poradiObalu.get(b.package_id) ?? 999);
  });
}

/**
 * Řádky, které má cenu počítat.
 *
 * Katalog má stovky kombinací pivo × obal a většina z nich je dávno mrtvá.
 * Projít je každý týden by kontrolu zabilo — nikdo nebude klikat přes tři sta
 * řádků, aby našel dva rozdíly. Zůstává tedy to, co má stav, co se za týden
 * hýbalo, nebo do čeho už někdo něco napsal.
 */
export function jenAktivni(radky: TydenniRadek[]): TydenniRadek[] {
  return radky.filter(
    (r) => r.ocekavano !== 0 || r.pohybuVTydnu !== 0 || r.napocitano !== null,
  );
}

export type SouhrnTydne = {
  /** Kolik řádků je vyplněných. */
  spocitano: number;
  /** Kolik jich sedí na kus. */
  sedi: number;
  prebytku: number;
  manek: number;
  /** Součet kladných a záporných rozdílů — jak moc se to rozešlo. */
  prebytekKusu: number;
  mankoKusu: number;
};

export function souhrnTydne(radky: TydenniRadek[]): SouhrnTydne {
  const s: SouhrnTydne = { spocitano: 0, sedi: 0, prebytku: 0, manek: 0, prebytekKusu: 0, mankoKusu: 0 };
  for (const r of radky) {
    if (r.napocitano === null) continue;
    s.spocitano += 1;
    if (r.rozdil === 0) s.sedi += 1;
    else if (r.rozdil > 0) { s.prebytku += 1; s.prebytekKusu += r.rozdil; }
    else { s.manek += 1; s.mankoKusu += -r.rozdil; }
  }
  return s;
}

/** Řádek pro tabulku `tydenni_inventura` — záznam o kontrole, ne reset stavu. */
export function zaznamKontroly(
  r: TydenniRadek,
  obdobi: TydenObdobi,
  vyreseno: 'staceni' | 'dorovnani' | 'ponechano' | null,
): Record<string, unknown> {
  return {
    tyden_od: obdobi.od,
    tyden_do: obdobi.do,
    beer_id: r.beer_id,
    beer_name: r.beer_name,
    package_id: r.package_id,
    package_label: r.package_label,
    ocekavano: r.ocekavano,
    napocitano: r.napocitano ?? 0,
    rozdil: r.rozdil,
    vyreseno,
    updated_at: new Date().toISOString(),
  };
}
