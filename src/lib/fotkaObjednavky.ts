// 📷 Fotka objednávky → kolik objednávek z ní uložení založí.
// ---------------------------------------------------------------------------
// Každý řádek z fotky si nese vlastního odběratele (screenshot se dvěma
// okny WhatsAppu = dvě objednávky). Z provozu 7. 10. 2026: na fotce
// 1,5l lahví měl odběratele „Restaurace" jen první řádek, ostatní žádného
// a hlavní odběratel nahoře zůstal prázdný. Uložily se DVĚ objednávky —
// 5× 1,5 l 12° pro Restauraci a zbytek bez odběratele — a po přesunu té
// druhé na víkend „najednou tam zbylo 5× 1,5 12sv".
//
// Odběratel napsaný jen u části řádků proto platí pro celou fotku, pokud
// je jediný (13. 10. 2026: „když na lístku bez odběratele napíšu na první
// řádek Restaurace nebo Obchod, slouč to do jedné objednávky pod jednoho
// odběratele"). Jméno psané jinak (velká/malá písmena, mezery) je stále tentýž odběratel. Víc různých odběratelů = víc objednávek jako dosud, jen se to
// před uložením řekne nahlas (objednavkyZFotky).
//
// 📅 Víc dnů závozu na jedné fotce (16. 10. 2026: „udělej to pro všechno i
// objednávky"). Řádek si může nést i vlastní den závozu; bez něj platí den
// společný pro celou fotku (tlačítka Po–Pá nahoře). Objednávka je tedy dvojice
// odběratel × den závozu — Restaurace na úterý a Restaurace na čtvrtek jsou
// dvě objednávky, každá s vlastním dnem. Okno čtení z fotky (náhled „Uloží se
// jako…") i obrazovka Objednávky, která je zakládá, seskupují stejnou funkcí.
import { dayKeyFromISO, nejblizsiDatumDne } from './keggingPlan';
import { parseDeliveryDayFromText } from './orderParser';
import { DAYS } from './shared';
import { platnyDen } from './zapisPoDnech';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Odběratel každého řádku při uložení ('' = bez odběratele).
 *
 * Řádek bez vlastního odběratele dostane hlavního (vybraného nahoře). Když
 * hlavní chybí a řádky jmenují jediného odběratele, platí ten pro všechny.
 */
export function odberatelRadku(radky: Array<string | null | undefined>, hlavni: string | null | undefined): string[] {
  const vlastni = radky.map((r) => (r ?? '').trim());
  const hl = (hlavni ?? '').trim();
  let vysledek: string[];
  if (hl) {
    vysledek = vlastni.map((r) => r || hl);
  } else {
    const jmenovani = vlastni.filter(Boolean);
    // Jedno jméno i pro „Restaurace" / „restaurace" — skupiny se dělí podle textu.
    vysledek = jmenovani.length > 0 && new Set(jmenovani.map(norm)).size === 1
      ? vlastni.map(() => jmenovani[0])
      : vlastni;
  }
  // Stejné jméno psané jinak („Restaurace", „restaurace ", „RESTAURACE") je
  // JEDEN odběratel — bere se podle prvního výskytu. Jinak z jednoho lístku
  // vznikly tři objednávky téhož odběratele (13. 10. 2026).
  const prvniPsani = new Map<string, string>();
  return vysledek.map((r) => {
    if (!r) return r;
    const k = norm(r);
    if (!prvniPsani.has(k)) prvniPsani.set(k, r);
    return prvniPsani.get(k)!;
  });
}

/**
 * Den závozu řádku: jeho vlastní, jinak společný pro celou fotku. Neexistující
 * den („2026-02-31") se nebere — databáze by zápis odmítla až při ukládání.
 */
export function zavozRadku(vlastni: unknown, spolecny: unknown): string | null {
  return platnyDen(vlastni) ?? platnyDen(spolecny);
}

/** Řádek z fotky: kdo si objednává a (volitelně) na který den. */
export type RadekObjednavky = { odberatel: string; zavoz?: string | null };

/** Jedna objednávka, která se založí: odběratel × den závozu a její řádky. */
export type SkupinaObjednavky<R> = { odberatel: string; zavoz: string | null; radky: R[] };

/**
 * Řádky rozdělené do objednávek — podle odběratele (bez ohledu na velikost
 * písmen, diakritiku a mezery; jméno bere první výskyt) a dne závozu. Pořadí
 * objednávek i řádků v nich je pořadí na fotce.
 */
export function seskupDoObjednavek<R extends RadekObjednavky>(radky: R[], spolecnyZavoz?: string | null): SkupinaObjednavky<R>[] {
  const skupiny = new Map<string, SkupinaObjednavky<R>>();
  for (const radek of radky) {
    const zavoz = zavozRadku(radek.zavoz, spolecnyZavoz);
    const klic = `${norm(radek.odberatel)}\u0000${zavoz ?? ''}`;
    const skupina = skupiny.get(klic) ?? { odberatel: radek.odberatel, zavoz, radky: [] };
    skupina.radky.push(radek);
    skupiny.set(klic, skupina);
  }
  return [...skupiny.values()];
}

/** Objednávky, které uložení založí, v pořadí řádků: odběratel, den závozu a počet položek. */
export function objednavkyZFotky(radky: RadekObjednavky[], spolecnyZavoz?: string | null): { odberatel: string; zavoz: string | null; polozek: number }[] {
  return seskupDoObjednavek(radky, spolecnyZavoz).map((s) => ({ odberatel: s.odberatel, zavoz: s.zavoz, polozek: s.radky.length }));
}

/** „Út 20. 10." — den v týdnu a datum; u neplatného data prázdný text. */
export function datumKratce(iso: string): string {
  const den = platnyDen(iso);
  if (!den) return '';
  const popisekDne = DAYS.find((d) => d.v === dayKeyFromISO(den))?.label ?? '';
  return `${popisekDne} ${Number(den.slice(8, 10))}. ${Number(den.slice(5, 7))}.`;
}

export type DenNabidky = { datum: string; popisek: string; proslo: boolean };

/**
 * Dny, které nabídne výběr dne závozu u řádku: týden zpátky (víkendová
 * objednávka zapsaná v pondělí) a dva týdny dopředu, od nejstaršího.
 * Dnešek a dny, které už proběhly, mají to v popisku — takový závoz se po
 * uložení hned odečte ze skladu.
 */
export function nabidkaDnuZavozu(dnes: string, zpet = 7, dopredu = 14): DenNabidky[] {
  if (!platnyDen(dnes)) return [];
  const dny: DenNabidky[] = [];
  for (let posun = -zpet; posun <= dopredu; posun++) {
    const d = new Date(`${dnes}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + posun);
    const datum = d.toISOString().slice(0, 10);
    const poznamka = posun === 0 ? ' (dnes)' : posun < 0 ? ' (už proběhl)' : '';
    dny.push({ datum, popisek: `${datumKratce(datum)}${poznamka}`, proslo: posun < 0 });
  }
  return dny;
}

/**
 * Den závozu napsaný přímo v textu řádku („2x50 12 v úterý", „na čtvrtek"):
 * nejbližší takový den od dneška, jinak `null`. Čte jen názvy dnů Po–Pá
 * (parseDeliveryDayFromText); den napsaný zvlášť v záhlaví nad řádky se tu
 * nepozná — ten se vybere ručně.
 */
export function zavozZTextuRadku(text: string | null | undefined, dnes: string): string | null {
  const den = parseDeliveryDayFromText(text ?? '');
  return den ? nejblizsiDatumDne(den, dnes) : null;
}
