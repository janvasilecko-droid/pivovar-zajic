// 💓 Tep WhatsApp mostu — RYCHLÁ detekce výpadku, nezávislá na tom, jestli
// zrovna někdo píše.
// ---------------------------------------------------------------------------
// `tichoWhatsApp` (whatsappTicho.ts) pozná výpadek jen podle ticha v chatu —
// a to musí být benevolentní (24 pracovních hodin), protože běžná víkendová
// pauza nebo klidné pondělní odpoledne vypadají úplně stejně jako spadlý
// most (viz testy u tichoWhatsApp — 18 pracovních hodin ticha je normální).
// Takže dokud nikdo nenapíše, appka se o výpadku dozví až za den.
//
// Most ale zapisuje TEP do `whatsapp_most_stav` každou minutu, ať se píše,
// nebo ne (viz whatsapp-bridge/lib/stav.js). Když tenhle tep zmizí (most
// spadl, usnul, nebo se restartuje), appka to pozná do pár minut — bez
// ohledu na to, jestli je večer, víkend, nebo prostě nikdo nepsal.
//
// STALE_MINUT je nastavené s rezervou: tep chodí každou minutu, ale most se
// budí i z klidu (viz index.js `spustSebeBuzeni`) a Render/síť občas
// zakolísá o pár desítek vteřin. 15 minut je pořád radikálně rychlejší než
// dosavadní práh 24 pracovních HODIN, a přitom to nebude hlásit každý drobný
// zádrhel jako poruchu.
export const TEP_STALE_MINUT = 15;

export type MostStavRadek = {
  naposledy: string | null;
  pripojeno: boolean | null;
  poznamka: string | null;
};

export type MostVarovani = {
  /** Má se to appce ukázat jako porucha? */
  varovat: boolean;
  /** Krátký důvod pro title/popisek — už obsahuje radu, co udělat. */
  duvod: string | null;
};

/**
 * Vyhodnotí poslední známý stav mostu.
 *
 * Tři případy:
 *  1. Tep dávno nedorazil (proces neběží / Render výpadek) → varovat.
 *  2. Tep chodí, ale most hlásí `pripojeno: false` (odhlášeno z WhatsAppu,
 *     čeká na nové spárování) → varovat, s poznámkou z mostu (ta už radí
 *     otevřít /qr).
 *  3. Tep chodí a most je připojený → v pořádku. (Sem spadá i „hluchá"
 *     session — tu už most sám detekuje a promítne do `poznamka`, viz
 *     index.js; taková zpráva se pak zobrazí i když `pripojeno` je true.)
 *
 * Žádný záznam (most nikdy neběžel / appka teprve nasazená) NEVAROVÁ —
 * stejná zásada jako u tichoWhatsApp: chybějící historie není porucha.
 */
export function vyhodnotMostStav(radek: MostStavRadek | null | undefined, ted: Date): MostVarovani {
  if (!radek || !radek.naposledy) return { varovat: false, duvod: null };
  const od = new Date(radek.naposledy);
  if (Number.isNaN(od.getTime())) return { varovat: false, duvod: null };

  const minutStareho = (ted.getTime() - od.getTime()) / 60000;
  if (minutStareho > TEP_STALE_MINUT) {
    const hodin = Math.floor(minutStareho / 60);
    const zbytek = Math.round(minutStareho % 60);
    const zaCas = hodin > 0 ? `${hodin} h ${zbytek} min` : `${Math.round(minutStareho)} min`;
    return {
      varovat: true,
      duvod: `Most neposílá tep už ${zaCas} — nejspíš spadl nebo neběží. Zkontroluj službu whatsapp-bridge na Renderu.`,
    };
  }

  if (radek.pripojeno === false) {
    return {
      varovat: true,
      duvod: radek.poznamka || 'Most běží, ale není spárovaný s WhatsAppem — otevři https://whatsapp-bridge-g1v0.onrender.com/qr a naskenuj QR.',
    };
  }

  // Připojeno a tep čerstvý — ale most sám může do poznámky napsat i
  // varování o „hluché" session (viz index.js `hluchy`), i když
  // `pripojeno` zůstává true. Takovou poznámku appka pozná podle toho, že
  // obsahuje slovo „spárování".
  if (radek.poznamka && /spárov/i.test(radek.poznamka)) {
    return { varovat: true, duvod: radek.poznamka };
  }

  return { varovat: false, duvod: null };
}
