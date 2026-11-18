// ↩️ Odpověď bez odběratele zdědí odběratele z CITOVANÉ zprávy.
// ---------------------------------------------------------------------------
// Z provozu 17. i 18. 9. 2026: na Radkovu objednávku přišla odpověď
// „60x0,5l. Grep a 40x0,5l. Citrón". Je to VLASTNÍ objednávka (nemění tu
// Radkovu, jen na ni navazuje), takže se nenapojuje — ale odběratel v ní
// napsaný není a v kontrole zůstalo pole „Odběratel" prázdné. Přitom appka
// přesně ví, na koho se odpovídá: WhatsApp u odpovědi posílá citaci.
//
// PROČ TO JE V APLIKACI, A NE V EDGE FUNKCI:
// Tatáž logika v `supabase/functions/whatsapp-auto-parse` existuje od 17. 9.,
// jenže edge funkce se do Supabase nasazují ručně (klíč SUPABASE_ACCESS_TOKEN
// není v GitHubu) a tahle se tam nedostala — v provozu běžela pořád stará
// verze a majitel oprávněně hlásil „říkal jsi, že to umí, a furt nic".
// Aplikace se nasazuje sama při každém pushnutí do mainu, takže tady oprava
// doopravdy dojede k uživateli. Až se funkce nasadí, obě cesty dají totéž;
// tahle se jen nepoužije, protože odběratel už bude vyplněný.
//
// Nic se nikam nezapisuje — jen se PŘEDVYPLNÍ pole v kontrole objednávky,
// které člověk před schválením vidí a může přepsat.
import type { WhatsAppMsgRef } from './whatsappAmendment';
import { mistoZCitace } from '../../supabase/functions/_shared/citovana-zprava';

export type ZpravaSOdberatelem = WhatsAppMsgRef & {
  parsed_place_id?: string | null;
  parsed_place_name?: string | null;
};

export type OdberatelZCitace = {
  placeId: string | null;
  placeName: string | null;
  /** Začátek citované zprávy — do vysvětlivky „převzato z …". */
  zCitace: string;
};

/**
 * Najde odběratele v citované zprávě.
 *
 * `null` když: zpráva není odpověď, citovaná zpráva se nenašla, nebo ani ta
 * odběratele neměla. Nehádá se — bez jistoty zůstane pole prázdné, protože
 * přiřadit objednávku cizímu odběrateli je horší než ji nechat nevyplněnou.
 */
export function odberatelZCitace(
  odpoved: WhatsAppMsgRef,
  drivejsi: ZpravaSOdberatelem[],
): OdberatelZCitace | null {
  // Pravidlo „která zpráva je citovaná" je sdílené se serverem a s kontrolou
  // napojení (_shared/citovana-zprava.ts): bere se nejnovější shoda, ne ta
  // nejstarší s objednávkou.
  const nalez = mistoZCitace(odpoved, drivejsi);
  if (!nalez) return null;
  const { placeId, placeName } = nalez;
  if (!placeId && !placeName) return null;
  return {
    placeId,
    placeName,
    zCitace: (nalez.zprava.message_text ?? '').slice(0, 40),
  };
}

/** Má smysl odběratele z citace vůbec hledat? */
export function stojiZaHledani(zprava: {
  quoted_text?: string | null;
  parsed_place_id?: string | null;
  parsed_place_name?: string | null;
}): boolean {
  // Když AI odběratele našla, citace se neptáme — zpráva sama je spolehlivější.
  if (zprava.parsed_place_id || zprava.parsed_place_name) return false;
  return (zprava.quoted_text ?? '').trim().length >= 3;
}
