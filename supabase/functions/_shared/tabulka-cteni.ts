// 📊 Čtení tabulky stáčení z fotky — řízení obou kroků v edge funkci.
// ---------------------------------------------------------------------------
// Krok 1 („okno"): Google Vision přečte fotku a vrátí řádky tabulky s daty
// a polohou (přepis). Odkud se má číst, spočítá aplikace z toho přepisu
// (najdiOkno, pro zvolené datum) — fotku pak ořízne a zvětší, přesně jak to dřív
// dělal majitel ručně. Při změně data se Vision znovu nevolá: přepis zůstane
// v aplikaci.
// Krok 2 („tabulka"): AI přečte buňky podle sloupců (na výřezu, nebo na celé
// fotce, když se výřez nepovedl), Vision výřez přepíše znovu a čísla a data
// se zkontrolují proti přepisu.
//
// Závislosti na síti (Vision, Gemini) se předávají zvenku, ať jde všechno
// otestovat s předstíranými odpověďmi (viz tabulka-cteni.test.ts).

import {
  parsujOdpovedAi,
  prepisTabulky,
  promptTabulky,
  sestavRadky,
  type DenTabulky,
  type PrepisTabulky,
  type RadekTabulky,
} from "./tabulka-staceni.ts";

export type VstupCteniTabulky = {
  /** „okno" = jen přepsat fotku po řádcích (Vision); „tabulka" = přečíst buňky. */
  rezim: "okno" | "tabulka";
  piva: { id: string; name: string; degree?: string | null; short_name?: string | null }[];
  /** Čtou se jen řádky od tohoto dne (ISO). */
  odData: string | null;
  /** Obrázek je výřez řádků (ne celá fotka). */
  vyrez: boolean;
  /** Datum prvního řádku výřezu (z kroku 1). */
  datumOkna: string | null;
  /** Odpověď Google Vision pro obrázek, nebo null, když Vision není / selhal. */
  // deno-lint-ignore no-explicit-any
  vision: (() => Promise<any | null>) | null;
  /** Odpověď AI na pokyn; "" když nepřečetla. */
  ai: (pokyn: string) => Promise<string>;
};

export type OdpovedTabulky =
  | { status: 200; telo: { tabulka: OknoOdpoved } }
  | { status: 200; telo: { tabulka: TabulkaOdpoved } }
  | { status: 502; telo: { error: string } };

/** Odpověď kroku 1: přepis řádků fotky; null = Vision není k dispozici nebo selhal (pak se čte celá fotka). */
export type OknoOdpoved = { prepis: PrepisTabulky | null };

export type TabulkaOdpoved = {
  radky: RadekTabulky[];
  dny: DenTabulky[];
  varovani: string[];
  vynechano: number;
  bezData: number;
  /** Přepis Vision byl k dispozici a použil se ke kontrole. */
  ocr: boolean;
};

export async function cteniTabulky(v: VstupCteniTabulky): Promise<OdpovedTabulky> {
  if (v.rezim === "okno") {
    const data = v.vision ? await v.vision() : null;
    return { status: 200, telo: { tabulka: { prepis: data ? prepisTabulky(data) : null } } };
  }

  // Vision a AI jedou naráz — Vision je rychlejší, ale čekat na něj po AI by zbytečně prodlužovalo čtení.
  const [visionData, text] = await Promise.all([v.vision ? v.vision() : Promise.resolve(null), v.ai(promptTabulky({ vyrez: v.vyrez, odData: v.odData }))]);
  if (!text) return { status: 502, telo: { error: "AI nepřečetla tabulku ani po opakování — zkus to za chvíli znovu." } };
  const surove = parsujOdpovedAi(text);
  if (!surove) return { status: 502, telo: { error: "AI vrátila odpověď, které nerozumím — zkus to znovu." } };

  const prepis = visionData ? prepisTabulky(visionData) : null;
  const vysledek = sestavRadky({ radky: surove, piva: v.piva, odData: v.odData, datumOkna: v.datumOkna, prepis });
  return { status: 200, telo: { tabulka: { ...vysledek, ocr: !!prepis } } };
}
