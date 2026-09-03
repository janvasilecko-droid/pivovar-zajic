/**
 * Fronta nedokončených odečtů objemu z tanků.
 *
 * Stáčení se zapíše jedním krokem a objem se z tanku odečte krokem druhým
 * (RPC). Když druhý krok selže — výpadek sítě ve sklepě je běžná věc —
 * zůstane tank nafouknutý o pivo, které už odteklo. Dosud se to řešilo
 * hláškou „Oprav objem ve Sklepě ručně" a dál to bylo na člověku; když na
 * to zapomněl, vznikl schodek, který se našel až na inventuře.
 *
 * Fronta si takový odečet uloží a zkusí ho znovu — při startu aplikace a
 * pokaždé, když se vrátí síť.
 *
 * PROČ SE TO NESMÍ DĚLAT PŘES `adjust_tank_volume`: ta funkce je relativní
 * (přičti delta). Když odpověď nedojde, ale server ji už provedl, druhý
 * pokus odečte objem DVAKRÁT — a to je horší chyba než ta původní, protože
 * se pozná až na inventuře. Proto se opakuje jen přes
 * `adjust_tank_volume_once`, které dostane jednorázový klíč a druhý pokus
 * se stejným klíčem neudělá nic (viz migrace 20261227020000).
 *
 * Fronta nikdy nic nezahodí sama od sebe. Po vyčerpání pokusů zůstane
 * položka označená `vzdano` — je to informace, kterou musí někdo vidět, ne
 * něco, co se smaže do ticha.
 */

/** Jeden nedokončený odečet. */
export type OdecetVeFronte = {
  /** Klíč idempotence — s ním se odečet nikdy neprovede dvakrát. */
  klic: string;
  tankId: string;
  /** Popis tanku pro člověka („Tank 6"). */
  label: string;
  /** Kolik litrů (záporné = odečet, kladné = vrácení). */
  deltaL: number;
  zdroj: string;
  pokusu: number;
  vytvoreno: string;
  poslednePokus: string | null;
  /** Poslední důvod selhání — v UI je to jediná stopa, proč to nešlo. */
  chyba: string | null;
  /** Pokusy vyčerpány. Položka zůstává, aby o ní někdo věděl. */
  vzdano: boolean;
};

export const KLIC_ULOZISTE = 'pivovar_tank_fronta';
/** Po kolika neúspěšných pokusech se to přestane zkoušet samo. */
export const MAX_POKUSU = 8;
/** Změna fronty — UI na ni umí reagovat bez pollování. */
export const TANK_FRONTA_EVENT = 'pivovar:tank-fronta';

export type UlozisteFronty = Pick<Storage, 'getItem' | 'setItem'>;

function vychoziUloziste(): UlozisteFronty | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Přečte frontu. Poškozený obsah se bere jako prázdná fronta, ne jako chyba. */
export function frontaTanku(uloziste?: UlozisteFronty | null): OdecetVeFronte[] {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return [];
  try {
    const raw = store.getItem(KLIC_ULOZISTE);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((p) => p && typeof p.klic === 'string' && typeof p.tankId === 'string');
  } catch {
    return [];
  }
}

function zapis(fronta: OdecetVeFronte[], uloziste?: UlozisteFronty | null): void {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return;
  try {
    store.setItem(KLIC_ULOZISTE, JSON.stringify(fronta));
  } catch {
    // Plné úložiště — víc se dělat nedá a padat kvůli tomu nemá cenu.
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TANK_FRONTA_EVENT, { detail: fronta.length }));
    }
  } catch { /* prostředí bez window (test, worker) */ }
}

/**
 * Zařadí odečet do fronty. Klíč je zároveň identita: zařadit tentýž odečet
 * dvakrát frontu nezdvojí.
 */
export function zaradOdecet(
  polozka: { klic: string; tankId: string; label: string; deltaL: number; zdroj: string; chyba?: string | null },
  uloziste?: UlozisteFronty | null,
): OdecetVeFronte[] {
  const fronta = frontaTanku(uloziste);
  if (fronta.some((p) => p.klic === polozka.klic)) return fronta;
  const nova: OdecetVeFronte = {
    klic: polozka.klic,
    tankId: polozka.tankId,
    label: polozka.label,
    deltaL: polozka.deltaL,
    zdroj: polozka.zdroj,
    pokusu: 0,
    vytvoreno: new Date().toISOString(),
    poslednePokus: null,
    chyba: polozka.chyba ?? null,
    vzdano: false,
  };
  const vysledek = [...fronta, nova];
  zapis(vysledek, uloziste);
  return vysledek;
}

/** Vyhodí položku z fronty (povedlo se, nebo to někdo spravil ručně). */
export function odeberZFronty(klic: string, uloziste?: UlozisteFronty | null): OdecetVeFronte[] {
  const vysledek = frontaTanku(uloziste).filter((p) => p.klic !== klic);
  zapis(vysledek, uloziste);
  return vysledek;
}

/** Zapíše neúspěšný pokus. Po MAX_POKUSU položku označí jako vzdanou. */
export function zapisNeuspech(klic: string, chyba: string, uloziste?: UlozisteFronty | null): OdecetVeFronte[] {
  const vysledek = frontaTanku(uloziste).map((p) => {
    if (p.klic !== klic) return p;
    const pokusu = p.pokusu + 1;
    return { ...p, pokusu, chyba, poslednePokus: new Date().toISOString(), vzdano: pokusu >= MAX_POKUSU };
  });
  zapis(vysledek, uloziste);
  return vysledek;
}

/** Položky, které se mají teď zkusit. Vzdané se samy nezkoušejí. */
export function kZopakovani(fronta: OdecetVeFronte[]): OdecetVeFronte[] {
  return fronta.filter((p) => !p.vzdano);
}

/** Kolik odečtů čeká (včetně vzdaných — člověk má vědět o obojím). */
export function pocetVeFronte(uloziste?: UlozisteFronty | null): number {
  return frontaTanku(uloziste).length;
}

/** Výsledek jednoho pokusu o odečet. */
export type VysledekOdectu =
  | { stav: 'provedeno' | 'jiz_provedeno' }
  | { stav: 'chyba'; chyba: string };

/**
 * Projde frontu a zkusí každou položku znovu.
 *
 * `provedOdecet` se předává zvenčí, aby se dala fronta otestovat bez
 * databáze — a aby tenhle modul nezávisel na Supabase.
 *
 * `jiz_provedeno` je ÚSPĚCH: znamená, že to server kdysi provedl a jen se
 * to nedozvěděl klient. Přesně proto tu ten klíč idempotence je.
 */
export async function zpracujFrontu(
  provedOdecet: (p: OdecetVeFronte) => Promise<VysledekOdectu>,
  uloziste?: UlozisteFronty | null,
): Promise<{ hotovo: number; selhalo: number; zbyva: number }> {
  let hotovo = 0;
  let selhalo = 0;
  for (const polozka of kZopakovani(frontaTanku(uloziste))) {
    let vysledek: VysledekOdectu;
    try {
      vysledek = await provedOdecet(polozka);
    } catch (e) {
      vysledek = { stav: 'chyba', chyba: e instanceof Error ? e.message : String(e) };
    }
    if (vysledek.stav === 'chyba') {
      selhalo += 1;
      zapisNeuspech(polozka.klic, vysledek.chyba, uloziste);
    } else {
      hotovo += 1;
      odeberZFronty(polozka.klic, uloziste);
    }
  }
  return { hotovo, selhalo, zbyva: pocetVeFronte(uloziste) };
}

/** Nový klíč idempotence. */
export function novyKlic(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* starší prohlížeč */ }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
