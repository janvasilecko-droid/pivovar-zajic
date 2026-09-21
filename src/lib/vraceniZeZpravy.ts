// ↩️ „Tady vrací 1x50l" — WhatsApp zpráva, která není objednávka, ale VRÁCENÍ.
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: zpráva „Tady vrací 1x50l. Vosmy a jednu vosmu
// roztočenou, téměř plnou" se rozpoznala jako OBJEDNÁVKA na dvě padesátky.
// Schválením by z ní vznikl závoz, který nikdy nepojede, a pivo by se ze
// skladu odepsalo — přitom se právě naopak vrátilo.
//
// Dvě pravidla, obě od majitele:
//   1. zpráva o vracení patří do „Vrácení piva", ne mezi objednávky,
//   2. počítá se jen to, u čeho je NAPSANÉ PIVO. „Vrací 3x30" bez piva jsou
//      prázdné obaly — sudy se vracejí pořád, pivo v nich skoro nikdy.
//
// Pravidlo 2 se ale nesmí vyhodnocovat tvrdě: kdyby appka řádek bez
// dohledaného piva zahodila, tiše by zmizel litr piva. Proto se řádky jen
// ROZDĚLÍ — s pivem zaškrtnuté, bez piva nezaškrtnuté a popsané jako
// „nejspíš prázdný obal" — a rozhodne člověk.
//
// Samotná detekce („vypadá to na vrácení?") je sdílená s edge funkcí
// whatsapp-auto-parse (viz supabase/functions/_shared/vraceni-detekce.ts) —
// obě strany musí souhlasit na tom, co je vrácení, jinak edge funkce pošle
// AI vrácení jako „úpravu objednávky" a vypadne z toho nesmysl.
import { norm, vypadaJakoVraceni } from '../../supabase/functions/_shared/vraceni-detekce';
export { norm, vypadaJakoVraceni };

/**
 * Obecná čeština předsazuje před slova na o- písmeno „v": „osma" → „vosma".
 * Bez toho by se „Vosmy" k pivu „Osma" nepřiřadilo a řádek by spadl mezi
 * prázdné obaly, ačkoli pivo napsané bylo.
 */
function jadro(slovo: string): string {
  return slovo.startsWith('v') && slovo.length > 3 ? slovo.slice(1) : slovo;
}

/**
 * Je pivo `nazev` opravdu napsané v textu zprávy?
 *
 * Porovnává se po slovech na první tři písmena kmene, aby prošly pády
 * („vosmy" = „osma", „summeru" = „summer"). Tři písmena jsou málo na to, aby
 * se to dalo brát jako důkaz — proto to slouží jen k PŘEDZAŠKRTNUTÍ, ne
 * k zahazování řádků.
 */
export function pivoJeVTextu(nazev: string | null | undefined, text: string | null | undefined): boolean {
  const slovaNazvu = norm(nazev).split(' ').filter((w) => w.length >= 3);
  if (slovaNazvu.length === 0) return false;
  const slovaTextu = norm(text).split(' ').filter((w) => w.length >= 3);
  return slovaNazvu.some((n) => slovaTextu.some((t) => jadro(t).slice(0, 3) === jadro(n).slice(0, 3)));
}

export type RadekZpravy = {
  /** Cokoli, čím si volající řádek pozná (klíč v tabulce položek). */
  klic: string;
  beerId: string;
  beerName: string | null;
  pkgId: string;
  packageLabel: string | null;
  pocet: number;
};

export type RozpadVraceni = {
  /** Pivo je ve zprávě napsané — počítá se jako vrácené pivo. */
  sPivem: RadekZpravy[];
  /** Jen množství a obal — nejspíš prázdné sudy, do piva se nepočítá. */
  jenObaly: RadekZpravy[];
};

/**
 * Rozdělí rozpoznané řádky na „vrácené pivo" a „nejspíš prázdné obaly".
 *
 * Řádek patří k pivu jen tehdy, když ho AI k nějakému pivu přiřadila A to
 * pivo je vidět i v původním textu. Samotné přiřazení nestačí: u „vrací 3x30"
 * si AI pivo domyslí z kontextu chatu a vzniklo by vrácení piva, které nikdo
 * nevracel.
 */
export function rozdelVraceni(radky: RadekZpravy[], text: string | null | undefined): RozpadVraceni {
  const sPivem: RadekZpravy[] = [];
  const jenObaly: RadekZpravy[] = [];
  for (const r of radky) {
    if (r.pocet <= 0 || !r.pkgId) continue;
    if (r.beerId && pivoJeVTextu(r.beerName, text)) sPivem.push(r);
    else jenObaly.push(r);
  }
  return { sPivem, jenObaly };
}
