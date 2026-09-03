/**
 * Stav databázových migrací: co je v repozitáři vs. co je aplikované.
 *
 * Soubory v `supabase/migrations/` neříkají nic o tom, co na produkci
 * doopravdy běží — migrace se pouští ručně. Dvě čekající migrace tak dva
 * dny nikdo neviděl a projevovalo se to jen tím, že nová obrazovka
 * „nefunguje". Tenhle modul dá dohromady seznam souborů (z `migrace.json`,
 * který vzniká při buildu) a řádky z tabulky `migrace_aplikovane`.
 *
 * JEDNO PRAVIDLO: o migraci, která je starší než evidence, se NEHÁDÁ.
 * Neexistuje způsob, jak zjistit, kdy se pustila, takže se označí jako
 * „starší než evidence" a ne jako „chybí" — falešné „chybí" u čtyřiceti
 * starých migrací by celý přehled zneužitelnil.
 */

/** Stav jedné migrace. */
export type StavMigrace = 'aplikovano' | 'ceka' | 'starsi-nez-evidence';

export type MigraceRadek = {
  nazev: string;
  stav: StavMigrace;
  aplikovanoAt: string | null;
  zdroj: string | null;
};

export type AplikovanaMigrace = {
  nazev: string;
  aplikovano_at: string | null;
  zdroj?: string | null;
};

/**
 * Jméno migrace, od které evidence začíná. Cokoliv staršího se nedá poctivě
 * dohledat. Musí odpovídat souboru, který tabulku zakládá.
 */
export const ZACATEK_EVIDENCE = '20261227010000_evidence_migraci.sql';

/**
 * Spojí seznam souborů v repozitáři s evidencí aplikovaných migrací.
 * Vrací je v pořadí, v jakém se pouštějí (podle jména, tedy podle času).
 */
export function porovnejMigrace(
  souboryVRepo: string[],
  aplikovane: AplikovanaMigrace[],
): MigraceRadek[] {
  const podleNazvu = new Map(aplikovane.map((a) => [a.nazev, a]));
  return [...souboryVRepo]
    .sort((a, b) => a.localeCompare(b))
    .map((nazev) => {
      const zapis = podleNazvu.get(nazev);
      if (zapis) {
        return {
          nazev,
          stav: 'aplikovano' as StavMigrace,
          aplikovanoAt: zapis.aplikovano_at ?? null,
          zdroj: zapis.zdroj ?? null,
        };
      }
      // Starší než evidence = nevíme, a tvrdit „chybí" by bylo lhaní.
      const stav: StavMigrace = nazev < ZACATEK_EVIDENCE ? 'starsi-nez-evidence' : 'ceka';
      return { nazev, stav, aplikovanoAt: null, zdroj: null };
    });
}

/** Kolik migrací čeká na spuštění. To je to jediné číslo, co se hlídá. */
export function pocetCekajicich(radky: MigraceRadek[]): number {
  return radky.filter((r) => r.stav === 'ceka').length;
}

/**
 * Migrace, které jsou v evidenci, ale v repozitáři už nejsou. Většinou to
 * znamená přejmenovaný soubor — a to je věc, o které je lepší vědět, než
 * ji přejít mlčením (v repozitáři pak leží soubor, který se pustí podruhé).
 */
export function osirele(souboryVRepo: string[], aplikovane: AplikovanaMigrace[]): string[] {
  const vRepo = new Set(souboryVRepo);
  return aplikovane.map((a) => a.nazev).filter((n) => !vRepo.has(n)).sort();
}
