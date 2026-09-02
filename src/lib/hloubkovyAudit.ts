// 🔬 Hloubkový audit — jedna tabulka, ve které je vidět, jestli data sedí VŠUDE.
// ---------------------------------------------------------------------------
// V aplikaci už je kontrol spousta, jenže každá bydlí jinde: audit objednávek
// v modálu u Objednávek, porovnání Sklad × Inventura v kartě uvnitř Inventury,
// stav příjmu zpráv v audit modálu, stáří inventury na Domů. Kdo chce vědět,
// jestli je celý týden v pořádku, musí obejít pět obrazovek a pamatovat si,
// co na které viděl. Prakticky to nikdo nedělá — a přesně proto se dvoudenní
// výpadek WhatsAppu (31. 8. – 2. 9. 2026) našel až po dvou dnech.
//
// Tenhle soubor nezavádí novou matematiku. Sesbírá existující kontroly, pustí
// je nad jedním obdobím a vrátí je jako JEDEN seznam, kde má každá kontrola
// svůj řádek — včetně těch, které dopadly dobře. Zelený řádek je totiž taky
// výsledek: říká „tohle se kontrolovalo a je to v pořádku“, což je u kontroly
// před uzávěrkou to hlavní, co člověk potřebuje vidět.
//
// Funkce jsou schválně ČISTÉ (data si načte volající, viz nactiPodkladyAuditu
// v hloubkovyAuditData.ts). Díky tomu se dají všechny kontroly otestovat na
// vymyšlených datech bez databáze.
import { stavPrijmu } from './stavPrijmu';
import { tichoUOdberatelu, pokrytiTydne, type Zprava, type ObjednavkaKontrola } from './kontrolaObjednavek';
import { porovnejPolozku, maCoUkazat } from './auditSkladu';
import { stariInventury, type InventurniRadek } from './inventuraStari';
import type { StockLine } from './stockLedger';

export type Zavaznost = 'ok' | 'pozor' | 'chyba';

/** Do které části provozu kontrola patří — tabulka se podle toho seskupuje. */
export type Oblast = 'Příjem zpráv' | 'Objednávky' | 'Výroba' | 'Sklad' | 'Inventura';

export const OBLASTI: Oblast[] = ['Příjem zpráv', 'Objednávky', 'Výroba', 'Sklad', 'Inventura'];

export type Nalez = {
  /** Stabilní klíč kontroly — drží se napříč spuštěními, aby šlo porovnat vývoj. */
  id: string;
  oblast: Oblast;
  /** Co se kontroluje, v jedné krátké větě. */
  nazev: string;
  zavaznost: Zavaznost;
  /** Kolik věcí neodpovídá. U zelených řádků 0. */
  pocet: number;
  /** Výsledek slovy — píše se do tabulky vedle stavu. */
  shrnuti: string;
  /** Konkrétní případy, ať se nemusí dohledávat. Max pár desítek. */
  detaily: string[];
  /** Co s tím — jen u nálezů, které něco vyžadují. */
  rada?: string;
};

export type VysledekAuditu = {
  od: string;
  do: string;
  spusteno: string;
  nalezy: Nalez[];
  chyb: number;
  pozor: number;
  ok: number;
  /** Nejhorší nalezená závažnost — barva odznaku nahoře. */
  celkem: Zavaznost;
};

const MAX_DETAILU = 30;

/** Zkrátí seznam detailů a připíše, kolik jich zbývá. */
function orizni(radky: string[]): string[] {
  if (radky.length <= MAX_DETAILU) return radky;
  return [...radky.slice(0, MAX_DETAILU), `… a dalších ${radky.length - MAX_DETAILU}`];
}

/** Zelený řádek — kontrola proběhla a nic nenašla. */
function vPoradku(id: string, oblast: Oblast, nazev: string, shrnuti: string): Nalez {
  return { id, oblast, nazev, zavaznost: 'ok', pocet: 0, shrnuti, detaily: [] };
}

// ─── Vstupní data ──────────────────────────────────────────────────────────

export type ObjednavkaAudit = ObjednavkaKontrola & {
  is_delivered?: boolean | null;
  pocetPolozek?: number;
};

export type VyrobniRadek = {
  entry_date: string;
  beer_id: string;
  package_id: string;
  quantity: number;
  cellar_tank_id?: string | null;
};

export type VstupAuditu = {
  /** Začátek a konec kontrolovaného období (včetně), YYYY-MM-DD. */
  od: string;
  do: string;
  /** Měsíc pro porovnání Sklad × Inventura (YYYY-MM). */
  mesic: string;

  // Příjem zpráv
  tepMostu?: { naposledy?: string | null; pripojeno?: boolean | null } | null;
  posledniPrijem?: string | null;
  zpravy?: Zprava[];
  neodeslaneCeka?: number;
  prijemLog?: { created_at: string; vysledek: string; duvod?: string | null; sender_name?: string | null }[];

  // Objednávky
  objednavky?: ObjednavkaAudit[];
  zacatekTydne?: string;

  // Výroba
  kegging?: VyrobniRadek[];
  bottling?: VyrobniRadek[];
  znamaPiva?: Set<string>;
  znameObaly?: Set<string>;

  // Sklad — obě strany téže skladové knihy (viz auditSkladu.ts)
  inventuraLedger?: Map<string, StockLine>;
  skladLedger?: Map<string, StockLine>;
  popisPolozky?: (klic: string) => string;

  // Inventura
  inventurniRadky?: InventurniRadek[];
};

// ─── Jednotlivé kontroly ───────────────────────────────────────────────────

/** Běží most a teče jím něco? Nejde o totéž — viz stavPrijmu.ts. */
export function kontrolaMostu(v: VstupAuditu, ted: Date): Nalez {
  const s = stavPrijmu(v.tepMostu?.naposledy, !!v.tepMostu?.pripojeno, v.posledniPrijem, ted);
  if (s.uroven === 'ok') {
    return vPoradku('most-bezi', 'Příjem zpráv', 'Most běží a zprávy chodí', s.hlaska);
  }
  return {
    id: 'most-bezi',
    oblast: 'Příjem zpráv',
    nazev: 'Most běží a zprávy chodí',
    zavaznost: s.uroven === 'chyba' ? 'chyba' : 'pozor',
    pocet: 1,
    shrnuti: s.hlaska,
    detaily: [],
    rada: s.rada,
  };
}

/**
 * Zprávy, které most nedokázal předat webhooku a odložil je do fronty
 * (whatsapp_neodeslane). Každá je objednávka, kterou nikdo nevidí.
 */
export function kontrolaFronty(v: VstupAuditu): Nalez {
  const ceka = v.neodeslaneCeka ?? 0;
  if (ceka === 0) {
    return vPoradku('fronta-neodeslanych', 'Příjem zpráv', 'Fronta neodeslaných zpráv', 'Fronta je prázdná — všechno prošlo napoprvé');
  }
  return {
    id: 'fronta-neodeslanych',
    oblast: 'Příjem zpráv',
    nazev: 'Fronta neodeslaných zpráv',
    zavaznost: 'chyba',
    pocet: ceka,
    shrnuti: `${ceka} zpráv se nepodařilo předat dál a čeká ve frontě`,
    detaily: [],
    rada: 'Most je zkusí poslat sám každých 10 minut. Když číslo neklesá, nefunguje webhook.',
  };
}

/** Co dorazilo na webhook, ale neuložilo se — zahozeno filtrem, duplicita, chyba. */
export function kontrolaZahozenych(v: VstupAuditu): Nalez {
  const vObdobi = (v.prijemLog ?? []).filter((r) => {
    const den = (r.created_at || '').slice(0, 10);
    return den >= v.od && den <= v.do;
  });
  // Duplicity jsou v pořádku — tak se pozná, že se tatáž zpráva doručila
  // dvakrát, a právě proto se druhá neuložila.
  const problem = vObdobi.filter((r) => r.vysledek === 'zahozeno_filtr' || r.vysledek === 'chyba');
  if (problem.length === 0) {
    return vPoradku('zahozene-zpravy', 'Příjem zpráv', 'Zprávy zahozené na bráně', `Za období dorazilo ${vObdobi.length} zpráv a žádná se nezahodila`);
  }
  const filtr = problem.filter((r) => r.vysledek === 'zahozeno_filtr').length;
  return {
    id: 'zahozene-zpravy',
    oblast: 'Příjem zpráv',
    nazev: 'Zprávy zahozené na bráně',
    zavaznost: 'pozor',
    pocet: problem.length,
    shrnuti: `${problem.length} zpráv se neuložilo (${filtr} zahodil filtr odesílatelů)`,
    detaily: orizni(problem.map((r) => `${(r.created_at || '').slice(0, 16).replace('T', ' ')} — ${r.sender_name || 'neznámý'}: ${r.duvod || r.vysledek}`)),
    rada: filtr > 0 ? 'Hospoda, která napíše z nového čísla, spadne do filtru. Doplň ji v Nastavení → WhatsApp odesílatelé.' : undefined,
  };
}

/** Zprávy, které dorazily, ale nikdo z nich neudělal objednávku. */
export function kontrolaNezpracovanych(v: VstupAuditu): Nalez {
  const cekaji = (v.zpravy ?? []).filter((z) => {
    const den = (z.created_at || '').slice(0, 10);
    if (den < v.od || den > v.do) return false;
    return z.status === 'pending' || z.status === 'error';
  });
  if (cekaji.length === 0) {
    return vPoradku('nezpracovane-zpravy', 'Příjem zpráv', 'Zprávy čekající na zpracování', 'Všechny zprávy z období jsou vyřízené');
  }
  const chybne = cekaji.filter((z) => z.status === 'error').length;
  return {
    id: 'nezpracovane-zpravy',
    oblast: 'Příjem zpráv',
    nazev: 'Zprávy čekající na zpracování',
    zavaznost: chybne > 0 ? 'chyba' : 'pozor',
    pocet: cekaji.length,
    shrnuti: `${cekaji.length} zpráv čeká${chybne ? `, z toho ${chybne} skončilo chybou` : ''}`,
    detaily: orizni(cekaji.map((z) => `${(z.created_at || '').slice(0, 16).replace('T', ' ')} — ${z.sender_name || 'neznámý'} (${z.status})`)),
    rada: 'Otevři Objednávky → WhatsApp a projdi je.',
  };
}

/** Objednávka bez jediné položky — vznikla, ale nikdo do ní nic nezadal. */
export function kontrolaPrazdnychObjednavek(v: VstupAuditu): Nalez {
  const prazdne = (v.objednavky ?? []).filter((o) => {
    const den = o.delivery_date || o.order_date;
    if (!den || den < v.od || den > v.do) return false;
    return o.status !== 'storno' && (o.pocetPolozek ?? 0) === 0;
  });
  if (prazdne.length === 0) {
    return vPoradku('objednavky-bez-polozek', 'Objednávky', 'Objednávky bez položek', 'Každá objednávka má aspoň jednu položku');
  }
  return {
    id: 'objednavky-bez-polozek',
    oblast: 'Objednávky',
    nazev: 'Objednávky bez položek',
    zavaznost: 'chyba',
    pocet: prazdne.length,
    shrnuti: `${prazdne.length} objednávek nemá ani jednu položku`,
    detaily: orizni(prazdne.map((o) => `${o.delivery_date || o.order_date} — ${o.place_name || 'bez odběratele'}`)),
    rada: 'Buď se zadání nedokončilo, nebo se položky smazaly. Zkontroluj v Objednávkách.',
  };
}

/** Den závozu je pryč a objednávka pořád není vyřízená. */
export function kontrolaNezavezenych(v: VstupAuditu, dnesISO: string): Nalez {
  const visi = (v.objednavky ?? []).filter((o) => {
    const den = o.delivery_date;
    if (!den || den < v.od || den > v.do) return false;
    if (den >= dnesISO) return false; // ještě nenastal
    if (o.status === 'storno') return false;
    return !o.is_delivered && o.status !== 'vyrizeno' && o.status !== 'vyrizeno_zavoz';
  });
  if (visi.length === 0) {
    return vPoradku('objednavky-nezavezene', 'Objednávky', 'Objednávky po termínu závozu', 'Všechny objednávky s uplynulým termínem jsou vyřízené');
  }
  return {
    id: 'objednavky-nezavezene',
    oblast: 'Objednávky',
    nazev: 'Objednávky po termínu závozu',
    zavaznost: 'pozor',
    pocet: visi.length,
    shrnuti: `${visi.length} objednávek má termín v minulosti a není označená jako vyřízená`,
    detaily: orizni(visi.map((o) => `${o.delivery_date} — ${o.place_name || 'bez odběratele'} (${o.status})`)),
    rada: 'Buď se zapomnělo odškrtnout, nebo se opravdu nezavezlo — a pak sedí sklad špatně.',
  };
}

/** Kdo objednal minulý týden a tenhle ještě ne. */
export function kontrolaPokryti(v: VstupAuditu): Nalez {
  if (!v.zacatekTydne) {
    return vPoradku('pokryti-tydne', 'Objednávky', 'Odběratelé bez objednávky', 'Kontrola se pouští jen u týdenního auditu');
  }
  const { chybi } = pokrytiTydne(v.objednavky ?? [], v.zacatekTydne);
  if (chybi.length === 0) {
    return vPoradku('pokryti-tydne', 'Objednávky', 'Odběratelé bez objednávky', 'Každý, kdo objednal minulý týden, objednal i tenhle');
  }
  return {
    id: 'pokryti-tydne',
    oblast: 'Objednávky',
    nazev: 'Odběratelé bez objednávky',
    zavaznost: 'pozor',
    pocet: chybi.length,
    shrnuti: `${chybi.length} odběratelů objednalo minulý týden, tenhle zatím ne`,
    detaily: orizni(chybi.map((r) => `${r.odberatel} — minulý týden ${r.minulyTyden}×`)),
    rada: 'Může to být normální, ale taky ztracená zpráva. Stojí za telefonát.',
  };
}

/** Pravidelný odběratel, který mlčí podstatně dýl, než je u něj obvyklé. */
export function kontrolaTicha(v: VstupAuditu, ted: Date): Nalez {
  const ticho = tichoUOdberatelu(v.zpravy ?? [], ted);
  if (ticho.length === 0) {
    return vPoradku('ticho-odberatelu', 'Objednávky', 'Podezřelé ticho u odběratele', 'Nikdo pravidelný nevypadl z rytmu');
  }
  return {
    id: 'ticho-odberatelu',
    oblast: 'Objednávky',
    nazev: 'Podezřelé ticho u odběratele',
    zavaznost: 'pozor',
    pocet: ticho.length,
    shrnuti: `${ticho.length} odesílatelů mlčí déle, než je u nich obvyklé`,
    detaily: orizni(ticho.map((r) => `${r.odesilatel} — ticho ${r.tichoDnu} dní, obvykle píše po ${r.obvykleDnu} dnech`)),
  };
}

/**
 * Stáčení KEG bez tanku. Takový zápis neodečte objem ze sklepa, takže tank
 * zůstane navždy nafouknutý — přesně tohle způsobilo schodek 2 000 l na
 * Spilce 1 a 5 400 l na Tanku 6.
 */
export function kontrolaKeggingBezTanku(v: VstupAuditu): Nalez {
  const bezTanku = (v.kegging ?? []).filter((r) => {
    const den = (r.entry_date || '').slice(0, 10);
    return den >= v.od && den <= v.do && !r.cellar_tank_id;
  });
  if (bezTanku.length === 0) {
    return vPoradku('keg-bez-tanku', 'Výroba', 'Stáčení KEG bez tanku', 'Každý zápis stáčení má přiřazený tank');
  }
  return {
    id: 'keg-bez-tanku',
    oblast: 'Výroba',
    nazev: 'Stáčení KEG bez tanku',
    zavaznost: 'chyba',
    pocet: bezTanku.length,
    shrnuti: `${bezTanku.length} zápisů stáčení nemá tank — objem se neodečetl ze sklepa`,
    detaily: orizni(bezTanku.map((r) => `${r.entry_date} — ${r.quantity} ks`)),
    rada: 'V úpravě zápisu jde tank doplnit i zpětně. Bez toho sklep ukazuje víc piva, než tam je.',
  };
}

/** Zápis odkazuje na pivo nebo obal, který v číselníku není. */
export function kontrolaNeznamychPolozek(v: VstupAuditu): Nalez {
  if (!v.znamaPiva || !v.znameObaly) {
    return vPoradku('neznama-piva-obaly', 'Výroba', 'Zápisy na neznámé pivo nebo obal', 'Číselníky nejsou načtené — kontrola přeskočena');
  }
  const spatne: string[] = [];
  const projdi = (radky: VyrobniRadek[], kde: string) => {
    for (const r of radky) {
      const den = (r.entry_date || '').slice(0, 10);
      if (den < v.od || den > v.do) continue;
      if (!v.znamaPiva!.has(r.beer_id)) spatne.push(`${kde} ${r.entry_date}: neznámé pivo`);
      else if (!v.znameObaly!.has(r.package_id)) spatne.push(`${kde} ${r.entry_date}: neznámý obal`);
    }
  };
  projdi(v.kegging ?? [], 'KEG');
  projdi(v.bottling ?? [], 'Lahve');
  if (spatne.length === 0) {
    return vPoradku('neznama-piva-obaly', 'Výroba', 'Zápisy na neznámé pivo nebo obal', 'Všechny zápisy míří na existující pivo i obal');
  }
  return {
    id: 'neznama-piva-obaly',
    oblast: 'Výroba',
    nazev: 'Zápisy na neznámé pivo nebo obal',
    zavaznost: 'chyba',
    pocet: spatne.length,
    shrnuti: `${spatne.length} zápisů odkazuje na pivo nebo obal, který v číselníku není`,
    detaily: orizni(spatne),
    rada: 'Takový zápis se do skladu nezapočítá. Nejspíš se smazalo pivo nebo obal, který se ještě používal.',
  };
}

/**
 * Jádro kontroly: Sklad a Inventura počítají ze STEJNÉ knihy, ale každý jinou
 * funkcí. Dokud za měsíc není uložená fyzická inventura, musí vyjít na kus
 * stejně — jakýkoli rozdíl ve sloupcích pohybů je skutečná chyba (viz
 * auditSkladu.ts).
 */
export function kontrolaSkladVsInventura(v: VstupAuditu): Nalez {
  const inv = v.inventuraLedger;
  const skl = v.skladLedger;
  if (!inv || !skl) {
    return vPoradku('sklad-vs-inventura', 'Sklad', 'Sklad × Inventura — shoda čísel', 'Skladová kniha není načtená — kontrola přeskočena');
  }
  const klice = new Set([...inv.keys(), ...skl.keys()]);
  const rozdily: string[] = [];
  for (const k of klice) {
    const p = porovnejPolozku(inv.get(k), skl.get(k));
    if (!maCoUkazat(p)) continue;
    // Rozdíl JEN v konečném stavu vysvětluje uložená fyzická inventura.
    // Rozdíl ve sloupcích pohybů vysvětlit nejde.
    const pohybove = p.rozdilne.filter((s) => s !== 'konec' && s !== 'pocatecni');
    if (pohybove.length === 0 && !p.soucetNesedi) continue;
    const popis = v.popisPolozky?.(k) ?? k;
    if (p.soucetNesedi) rozdily.push(`${popis} — řádku nesedí vlastní součet`);
    else rozdily.push(`${popis} — liší se: ${pohybove.join(', ')}`);
  }
  if (rozdily.length === 0) {
    return vPoradku('sklad-vs-inventura', 'Sklad', 'Sklad × Inventura — shoda čísel', 'Obě obrazovky počítají stejná čísla');
  }
  return {
    id: 'sklad-vs-inventura',
    oblast: 'Sklad',
    nazev: 'Sklad × Inventura — shoda čísel',
    zavaznost: 'chyba',
    pocet: rozdily.length,
    shrnuti: `${rozdily.length} kombinací pivo × obal se mezi Skladem a Inventurou liší v pohybech`,
    detaily: orizni(rozdily),
    rada: 'Rozdíl v pohybech znamená, že se do jednoho výpočtu propsalo něco, co ve druhém není. Rozpad je v kartě Audit — Inventura vs. Sklad.',
  };
}

/** Záporný stav = vydalo se víc, než kolik bylo. Někde chybí zápis. */
export function kontrolaZapornehoSkladu(v: VstupAuditu): Nalez {
  const skl = v.skladLedger;
  if (!skl) {
    return vPoradku('zaporny-sklad', 'Sklad', 'Záporný stav skladu', 'Skladová kniha není načtená — kontrola přeskočena');
  }
  const zaporne: string[] = [];
  for (const [k, line] of skl) {
    if (line.qty < 0) zaporne.push(`${v.popisPolozky?.(k) ?? k}: ${line.qty} ks`);
  }
  if (zaporne.length === 0) {
    return vPoradku('zaporny-sklad', 'Sklad', 'Záporný stav skladu', 'Žádná položka není v mínusu');
  }
  return {
    id: 'zaporny-sklad',
    oblast: 'Sklad',
    nazev: 'Záporný stav skladu',
    zavaznost: 'chyba',
    pocet: zaporne.length,
    shrnuti: `${zaporne.length} položek je v mínusu — vydalo se víc, než kolik bylo naskladněno`,
    detaily: orizni(zaporne),
    rada: 'Nejčastěji chybí zápis stáčení nebo počáteční stav měsíce.',
  };
}

/** Je za měsíc vůbec inventura, nebo se na ni zapomnělo? */
export function kontrolaStariInventury(v: VstupAuditu, dnesISO: string): Nalez {
  const s = stariInventury(v.inventurniRadky ?? [], dnesISO);
  if (!s.chybejiciMesice.length) {
    return vPoradku('inventura-mesice', 'Inventura', 'Měsíce bez inventury', 'Za všechny uzavřené měsíce je inventura hotová');
  }
  return {
    id: 'inventura-mesice',
    oblast: 'Inventura',
    nazev: 'Měsíce bez inventury',
    zavaznost: s.naléhavé ? 'chyba' : 'pozor',
    pocet: s.chybejiciMesice.length,
    shrnuti: `${s.chybejiciMesice.length} uzavřených měsíců nemá inventuru: ${s.chybejiciMesice.join(', ')}`,
    detaily: s.chybejiciMesice.slice(0, MAX_DETAILU),
    rada: 'Bez inventury nemá další měsíc zapsaný počáteční stav a čísla se rozjedou.',
  };
}

// ─── Sestavení celého auditu ───────────────────────────────────────────────

/**
 * Pustí všechny kontroly nad jedním obdobím a vrátí je jako jeden seznam.
 *
 * Vrací se i kontroly, které dopadly dobře — právě ty dělají z výsledku
 * kontrolní tabulku, ne jen seznam problémů. Před uzávěrkou je zásadní vidět,
 * co všechno se prověřilo, ne jen co se náhodou našlo.
 */
export function sestavAudit(v: VstupAuditu, ted: Date = new Date()): VysledekAuditu {
  const dnesISO = ted.toISOString().slice(0, 10);
  const nalezy: Nalez[] = [
    kontrolaMostu(v, ted),
    kontrolaFronty(v),
    kontrolaZahozenych(v),
    kontrolaNezpracovanych(v),
    kontrolaPrazdnychObjednavek(v),
    kontrolaNezavezenych(v, dnesISO),
    kontrolaPokryti(v),
    kontrolaTicha(v, ted),
    kontrolaKeggingBezTanku(v),
    kontrolaNeznamychPolozek(v),
    kontrolaSkladVsInventura(v),
    kontrolaZapornehoSkladu(v),
    kontrolaStariInventury(v, dnesISO),
  ];

  const chyb = nalezy.filter((n) => n.zavaznost === 'chyba').length;
  const pozor = nalezy.filter((n) => n.zavaznost === 'pozor').length;
  const ok = nalezy.filter((n) => n.zavaznost === 'ok').length;

  return {
    od: v.od,
    do: v.do,
    spusteno: ted.toISOString(),
    nalezy,
    chyb,
    pozor,
    ok,
    celkem: chyb > 0 ? 'chyba' : pozor > 0 ? 'pozor' : 'ok',
  };
}

// ─── Období ────────────────────────────────────────────────────────────────

/** Pondělí toho týdne, do kterého datum spadá (ISO týden, pondělí = začátek). */
export function zacatekTydne(dnesISO: string): string {
  const d = new Date(dnesISO + 'T00:00:00Z');
  const den = d.getUTCDay(); // 0 = neděle
  const posun = den === 0 ? 6 : den - 1;
  d.setUTCDate(d.getUTCDate() - posun);
  return d.toISOString().slice(0, 10);
}

/** Období pro audit — týden (od pondělí) nebo celý měsíc. */
export function obdobiAuditu(rezim: 'tyden' | 'mesic', dnesISO: string): { od: string; do: string; mesic: string } {
  if (rezim === 'tyden') {
    const od = zacatekTydne(dnesISO);
    const d = new Date(od + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return { od, do: d.toISOString().slice(0, 10), mesic: dnesISO.slice(0, 7) };
  }
  const mesic = dnesISO.slice(0, 7);
  const prvni = `${mesic}-01`;
  const d = new Date(prvni + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { od: prvni, do: d.toISOString().slice(0, 10), mesic };
}
