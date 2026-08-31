// ✅ Denní checklisty přípravy pracoviště — sdílené mezi zařízeními.
// ---------------------------------------------------------------------------
// Do 31. 8. 2026 žily jen v localStorage. Mělo to dva důsledky, které jdou
// proti sobě: kdo checklist proklikal na tabletu, musel ho na mobilu projít
// ZNOVU — a zároveň šla brána „bez checklistu nezapíšeš stáčení" OBEJÍT tím,
// že se člověk přepnul na jiné zařízení.
//
// Proč localStorage zůstává: bránu i pruhy postupu čte spousta míst SYNCHRONNĚ
// přímo při vykreslování (isChecklistCompleteForDate, isWeeklyItemDoneForWeek…).
// Předělat je všechny na asynchronní čtení by znamenalo sáhnout do stáčení
// lahví i KEGů naráz. Místo toho je localStorage LOKÁLNÍ ZRCADLO sdíleného
// stavu: po otevření okna se srovná s databází a každé odškrtnutí jde do obou.
//
// Slučuje se SJEDNOCENÍM, ne přepisem: kdo odškrtával offline, o svou práci
// nepřijde, až se připojí. Odškrtnutí se ruší jen výslovně (resetAll), a to
// se propíše i do databáze.
import { supabase } from './supabase';

/** Které pracoviště — odpovídá sloupci `pracoviste` v tabulce. */
export type Pracoviste = 'lahve' | 'kegy';

/** Klíč lokálního zrcadla. Musí se shodovat s tím, co čtou synchronní kontroly. */
export function klicZrcadla(pracoviste: Pracoviste, datum: string): string {
  return (pracoviste === 'lahve' ? 'bottling_checklist_' : 'keg_checklist_') + datum;
}

/**
 * Stav položek. Hodnota bývá true/false, ale u některých kroků nese VOLBU:
 * KEG checklist si u sanitace pamatuje, jestli se použil NaOH nebo Persteril
 * (`keg_start_1_choice`). Prázdný řetězec a false znamenají „nesplněno".
 */
export type Mapa = Record<string, boolean | string>;

/** Je položka splněná? Volba (neprázdný text) se počítá jako splněná. */
function jeSplnena(v: boolean | string | undefined): boolean {
  return typeof v === 'string' ? v.length > 0 : !!v;
}

function nactiZrcadlo(pracoviste: Pracoviste, datum: string): Mapa {
  try {
    const raw = localStorage.getItem(klicZrcadla(pracoviste, datum));
    return raw ? (JSON.parse(raw) as Mapa) : {};
  } catch {
    return {};
  }
}

function ulozZrcadlo(pracoviste: Pracoviste, datum: string, mapa: Mapa): void {
  try {
    localStorage.setItem(klicZrcadla(pracoviste, datum), JSON.stringify(mapa));
  } catch { /* plná paměť — sdílený stav je stejně v databázi */ }
}

function odskrtnute(mapa: Mapa): string[] {
  return Object.keys(mapa).filter((k) => jeSplnena(mapa[k]));
}

/**
 * Srovná lokální zrcadlo s databází a vrátí výsledný stav.
 *
 * Sjednocení obou stran: co je odškrtnuté kdekoli, platí. Položky, které zná
 * jen tohle zařízení, se do databáze dopíšou — tím se dorovná i práce
 * odvedená offline.
 *
 * Když databáze není dostupná, vrátí se zrcadlo beze změny. Checklist se tak
 * dá proklikat i bez signálu a srovná se při dalším otevření.
 */
export async function synchronizuj(pracoviste: Pracoviste, datum: string): Promise<Mapa> {
  const mistni = nactiZrcadlo(pracoviste, datum);

  const { data, error } = await supabase
    .from('checklisty_hotovo')
    .select('polozka, hodnota')
    .eq('pracoviste', pracoviste)
    .eq('datum', datum);
  if (error || !data) return mistni;

  const radky = data as { polozka: string; hodnota: string | null }[];
  const vCloudu = new Set(radky.map((r) => r.polozka));
  const slouceno: Mapa = { ...mistni };
  // Uložená volba (NaOH/Persteril) se vrací jako text, prosté splnění jako true.
  radky.forEach((r) => { slouceno[r.polozka] = r.hodnota ?? true; });
  ulozZrcadlo(pracoviste, datum, slouceno);

  // Co zná jen tohle zařízení, dopsat do databáze.
  const chybiVCloudu = odskrtnute(mistni).filter((p) => !vCloudu.has(p));
  if (chybiVCloudu.length > 0) {
    await supabase.from('checklisty_hotovo').upsert(
      chybiVCloudu.map((polozka) => ({
        pracoviste, datum, polozka,
        hodnota: typeof mistni[polozka] === 'string' ? (mistni[polozka] as string) : null,
      })),
      { onConflict: 'pracoviste,datum,polozka' },
    );
  }

  return slouceno;
}

/**
 * Uloží celý stav dne — do zrcadla hned, do databáze na pozadí.
 *
 * Bere celou mapu, ne jednu položku: „Označit vše" i „Vyčistit" mění desítky
 * položek naráz a posílat je po jedné by znamenalo desítky kulatých cest.
 * Odškrtnuté se dopíšou, odznačené smažou — řádek existuje jen pro splněnou
 * položku (stejný vzorec jako zavoz_ukoly_hotovo).
 */
export async function ulozStav(
  pracoviste: Pracoviste,
  datum: string,
  mapa: Mapa,
  kdo?: string | null,
): Promise<void> {
  ulozZrcadlo(pracoviste, datum, mapa);

  const hotove = odskrtnute(mapa);
  const zrusene = Object.keys(mapa).filter((k) => !jeSplnena(mapa[k]));

  if (hotove.length > 0) {
    await supabase.from('checklisty_hotovo').upsert(
      hotove.map((polozka) => ({
        pracoviste, datum, polozka, splnil: kdo ?? null,
        hodnota: typeof mapa[polozka] === 'string' ? (mapa[polozka] as string) : null,
      })),
      { onConflict: 'pracoviste,datum,polozka' },
    );
  }
  if (zrusene.length > 0) {
    await supabase.from('checklisty_hotovo').delete()
      .eq('pracoviste', pracoviste).eq('datum', datum).in('polozka', zrusene);
  }
}
