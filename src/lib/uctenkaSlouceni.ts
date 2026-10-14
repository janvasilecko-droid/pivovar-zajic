// 🧾 Účtenka z pokladny na víc fotek: slučování bez zdvojení.
// ---------------------------------------------------------------------------
// 14. 10. 2026, majitel: účtenka se tiskne jako dlouhý pásek a nejlíp se vyfotí
// celá najednou — „udělej i kontrolu dat, kdyby se vyfotila na víckrát, ať se
// stejná data nesčítají nebo neodečítají víckrát".
//
// Dvě fotky téže účtenky se nejspíš překrývají (konec první a začátek druhé
// ukazují stejné zboží). Každý řádek má na účtence JEDINEČNÝ kód zboží, takže
// se spolehlivě pozná, že jde o tentýž řádek:
//   • stejný kód a stejná čísla na obou fotkách → je to jeden řádek, podruhé
//     se nepřidá (jinak by se prodané kusy odečetly dvakrát),
//   • řádek utržený na kraji fotky (chybí množství nebo částka) a na druhé
//     fotce celý → doplní se, ne zdvojí,
//   • stejný kód, ale RŮZNÁ čísla → někde je špatně přečteno; přidají se oba
//     řádky a kontrola („kód je na účtence dvakrát") nedovolí uložit, dokud
//     obsluha jeden neodstraní,
//   • jiné číslo uzávěrky, středisko, čas tisku nebo Celkem → je to jiná
//     účtenka, nic se nesloučí.
//
// Čistá funkce bez Reactu a bez databáze — kontrola proti už ZAPSANÝM
// uzávěrkám je v obchodUzaverka.ts (duplicitaUzaverky).
import type { PrectenaUzaverka, RadekUzaverky } from '../../supabase/functions/_shared/uzaverka';

const TOLERANCE = 0.005;

const stejneCislo = (a: number | null | undefined, b: number | null | undefined): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < TOLERANCE;
};

/** Řádek, kterému chybí množství, cena nebo částka (utržený na kraji fotky). */
export function jeNeuplnyRadek(r: RadekUzaverky): boolean {
  return !Number.isFinite(r.mnozstvi) || r.cena == null || r.celkem == null;
}

/** Všechna čísla řádku, která JSOU známá, se shodují s druhým řádkem. */
function znamaCislaSedi(a: RadekUzaverky, b: RadekUzaverky): boolean {
  if (Number.isFinite(a.mnozstvi) && Number.isFinite(b.mnozstvi) && !stejneCislo(a.mnozstvi, b.mnozstvi)) return false;
  if (a.cena != null && b.cena != null && !stejneCislo(a.cena, b.cena)) return false;
  if (a.celkem != null && b.celkem != null && !stejneCislo(a.celkem, b.celkem)) return false;
  return true;
}

/** Dva řádky téhož kódu mají všechna čísla stejná (množství, cena i částka). */
export function jeStejnyRadek(a: RadekUzaverky, b: RadekUzaverky): boolean {
  const mnozstviSedi = Number.isFinite(a.mnozstvi) ? Number.isFinite(b.mnozstvi) && stejneCislo(a.mnozstvi, b.mnozstvi) : !Number.isFinite(b.mnozstvi);
  return mnozstviSedi && stejneCislo(a.cena, b.cena) && stejneCislo(a.celkem, b.celkem);
}

export type VysledekSlouceni = {
  /** Řádky z nové fotky, které se do seznamu přidají. */
  pridat: RadekUzaverky[];
  /** Řádky z nové fotky, které už v seznamu jsou se stejnými čísly — podruhé se nepřidají. */
  stejne: RadekUzaverky[];
  /** Neúplné řádky v seznamu (utržené na kraji první fotky), které nová fotka doplnila. */
  doplnit: { kod: string; radek: RadekUzaverky }[];
  /** Kódy, které jsou na obou fotkách s různými čísly — přidají se oba řádky, obsluha jeden odstraní. */
  rozdilne: string[];
  /** Údaje z hlavičky a „Celkem", které načtená účtenka neměla a nová fotka je má. */
  hlavicka: Partial<Pick<PrectenaUzaverka, 'cislo' | 'stredisko' | 'vytisteno' | 'celkem'>>;
  /** Nová fotka je jiná účtenka než načtená — důvod; pak se nic nesloučí. */
  jina: string | null;
};

const bezMezer = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, '');
/** Čas tisku na minuty („2026-10-10T10:09:00" = „2026-10-10T10:09"). */
const naMinuty = (t: string | null | undefined) => (t ?? '').slice(0, 16);

const kodRadku = (r: RadekUzaverky) => r.kod.trim();

/**
 * Co z nové fotky přidat k už načteným řádkům. `nactena` jsou řádky tak, jak
 * jsou v okně teď (i s opravami obsluhy), `nova` je čtení další fotky.
 */
export function slucUctenky(nactena: PrectenaUzaverka, nova: PrectenaUzaverka): VysledekSlouceni {
  const prazdny: VysledekSlouceni = { pridat: [], stejne: [], doplnit: [], rozdilne: [], hlavicka: {}, jina: null };

  // Jiná účtenka? Číslo, středisko, čas tisku i Celkem jsou na jedné účtence jediné.
  if (nactena.cislo && nova.cislo && bezMezer(nactena.cislo) !== bezMezer(nova.cislo)) {
    return { ...prazdny, jina: `Tahle fotka je jiná uzávěrka (č. ${nova.cislo}), načtená je č. ${nactena.cislo}.` };
  }
  if (nactena.stredisko && nova.stredisko && bezMezer(nactena.stredisko) !== bezMezer(nova.stredisko)) {
    return { ...prazdny, jina: `Tahle fotka je z jiného střediska (${nova.stredisko}), načtená účtenka je ze střediska ${nactena.stredisko}.` };
  }
  if (nactena.vytisteno && nova.vytisteno && naMinuty(nactena.vytisteno) !== naMinuty(nova.vytisteno)) {
    return { ...prazdny, jina: `Tahle fotka je jiná účtenka (vytištěno ${nova.vytisteno.replace('T', ' ')}), načtená byla vytištěná ${nactena.vytisteno.replace('T', ' ')}.` };
  }
  if (nactena.celkem != null && nova.celkem != null && !stejneCislo(nactena.celkem, nova.celkem)) {
    return { ...prazdny, jina: `Tahle fotka má jiné „Celkem“ (${nova.celkem}) než načtená účtenka (${nactena.celkem}) — je to jiná účtenka.` };
  }

  const vysledek: VysledekSlouceni = { ...prazdny, pridat: [], stejne: [], doplnit: [], rozdilne: [], hlavicka: {} };

  const podleKodu = new Map<string, RadekUzaverky>();
  for (const r of nactena.radky) {
    const k = kodRadku(r);
    if (k && !podleKodu.has(k)) podleKodu.set(k, r);
  }
  const zpracovane = new Set<string>();

  for (const n of nova.radky) {
    const k = kodRadku(n);
    const e = k ? podleKodu.get(k) : undefined;
    // Bez kódu se řádek nedá s ničím spárovat; s kódem, který tu ještě není, je nový.
    if (!k || !e) { vysledek.pridat.push(n); continue; }

    if (jeStejnyRadek(e, n)) { vysledek.stejne.push(n); continue; }
    if (jeNeuplnyRadek(e) && !jeNeuplnyRadek(n) && znamaCislaSedi(e, n)) {
      // Řádek utržený na kraji první fotky; tahle ho má celý.
      if (!zpracovane.has(k)) { vysledek.doplnit.push({ kod: k, radek: n }); zpracovane.add(k); }
      else vysledek.stejne.push(n);
      continue;
    }
    if (jeNeuplnyRadek(n) && znamaCislaSedi(e, n)) {
      // Utržený řádek na kraji NOVÉ fotky; celý už v seznamu je.
      vysledek.stejne.push(n);
      continue;
    }
    // Stejný kód, jiná čísla: někde je špatně přečteno. Oba řádky zůstanou vidět.
    vysledek.rozdilne.push(k);
    vysledek.pridat.push(n);
  }

  // Hlavička, která na první fotce chyběla.
  if (!nactena.cislo && nova.cislo) vysledek.hlavicka.cislo = nova.cislo;
  if (!nactena.stredisko && nova.stredisko) vysledek.hlavicka.stredisko = nova.stredisko;
  if (!nactena.vytisteno && nova.vytisteno) vysledek.hlavicka.vytisteno = nova.vytisteno;
  if (nactena.celkem == null && nova.celkem != null) vysledek.hlavicka.celkem = nova.celkem;
  return vysledek;
}

const jeCiselnyKod = (k: string) => /^\d+$/.test(k.trim());
const jeVzestupne = (radky: { kod: string }[]) =>
  radky.every((r) => jeCiselnyKod(r.kod)) && radky.every((r, i) => i === 0 || Number(radky[i - 1].kod) <= Number(r.kod));

/**
 * Řádky z další fotky na správné místo. Pokladna tiskne zboží podle kódu
 * (393, 1106, 10241 …), takže když jsou kódy v obou částech vzestupně, srovnají
 * se podle kódu — druhá fotka může ukazovat začátek účtenky. Jinak se nové
 * řádky připojí na konec (pořadí se nehádá).
 */
export function vlozPodleKodu<T extends { kod: string }>(existujici: T[], nove: T[]): T[] {
  if (nove.length === 0) return existujici;
  if (!jeVzestupne(existujici) || !jeVzestupne(nove)) return [...existujici, ...nove];
  const vysledek: T[] = [];
  let i = 0;
  let j = 0;
  while (i < existujici.length || j < nove.length) {
    if (j >= nove.length || (i < existujici.length && Number(existujici[i].kod) <= Number(nove[j].kod))) vysledek.push(existujici[i++]);
    else vysledek.push(nove[j++]);
  }
  return vysledek;
}

/** Věta pro obsluhu: co se z další fotky stalo. */
export function popisSlouceni(v: VysledekSlouceni): string {
  const casti: string[] = [];
  if (v.pridat.length > 0) casti.push(`přidáno ${v.pridat.length} ${v.pridat.length === 1 ? 'nový řádek' : v.pridat.length < 5 ? 'nové řádky' : 'nových řádků'}`);
  if (v.stejne.length > 0) casti.push(`${v.stejne.length} ${v.stejne.length === 1 ? 'řádek byl' : v.stejne.length < 5 ? 'řádky byly' : 'řádků bylo'} už načtených z předchozí fotky (podruhé se nepřičetly)`);
  if (v.doplnit.length > 0) casti.push(`${v.doplnit.length} ${v.doplnit.length === 1 ? 'utržený řádek se doplnil' : v.doplnit.length < 5 ? 'utržené řádky se doplnily' : 'utržených řádků se doplnilo'}`);
  if (casti.length === 0) return 'Z další fotky se nic nepřidalo — všechny řádky už načtené jsou.';
  const text = casti.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}
