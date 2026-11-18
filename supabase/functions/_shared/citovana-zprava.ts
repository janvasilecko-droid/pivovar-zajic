// ↩️ Ke které zprávě patří odpověď — podle citace z WhatsAppu.
// ---------------------------------------------------------------------------
// WhatsApp u odpovědi pošle jen ZAČÁTEK původní zprávy (delší text ořízne).
// Odběratelé posílají objednávku pořád dokola stejným zněním, takže citaci
// splní víc zpráv naráz (tento týden i všechny dřívější) — tohle rozhoduje,
// která z nich je ta správná.
//
// Dosavadní pravidlo dávalo přednost zprávě, ze které už VZNIKLA objednávka.
// Jenže když nová zpráva ještě čeká na schválení a odpověď přijde dřív, vyhrála
// STARŠÍ zpráva stejného znění — odpověď se navrhla k objednávce z minulého
// týdne místo k té z aktuálního (Lužec 3. 11. 2026: zpráva z 13:45 se
// schválila až ve 13:59, odpověď z 13:47 mezitím skončila u objednávky z 26. 10.).
// Pozdější oprava (`opravenyCilUpravy` v aplikaci) to dokázala napravit až po
// schválení nové zprávy; dokud čekala, schválení odpovědi by položky připsalo
// ke staré objednávce. Majitel 18. 11. 2026 se ptal, proč se odpověď chtěla
// přiřadit ke starší objednávce a ne k té z aktuálního týdne.
//
// Teď se jde od NEJNOVĚJŠÍ shody dozadu:
//   • zpráva, ze které vznikla objednávka → odpověď patří k ní,
//   • zpráva, která objednávkou teprve MŮŽE být (čeká na schválení, nebo se
//     čtení nepovedlo) → odpověď patří k ní, ale zatím BEZ objednávky: k žádné
//     starší se nepřipojí, obsluha se to dozví a po schválení se odpověď
//     napojí sama,
//   • zpráva, která objednávkou už nebude (ignorovaná), a čekající zpráva
//     tak stará, že je spíš zapomenutá → přeskočí se.
//
// Jedno pravidlo pro server (whatsapp-auto-parse), kontrolu zprávy a „Přečíst
// znovu" v aplikaci — dvě kopie se tu vždycky rozešly.

export type ZpravaProVazbu = {
  id: string;
  created_at: string;
  message_text: string | null;
  /** pending / processing / parsed / imported / ignored / error. Chybějící = bere se jako čekající. */
  status?: string | null;
  imported_order_id?: string | null;
  parsed_place_id?: string | null;
  parsed_place_name?: string | null;
};

export type OdpovedProVazbu = {
  id: string;
  created_at: string;
  quoted_text?: string | null;
};

/** Stavy zprávy, ze které objednávka ještě může vzniknout. */
const OTEVRENE_STAVY = new Set(["pending", "processing", "parsed", "error"]);

const jeOtevrena = (m: ZpravaProVazbu): boolean => m.status == null || OTEVRENE_STAVY.has(String(m.status));

/**
 * Čekající zpráva starší než tohle už k odpovědi nejspíš nepatří (spíš
 * zapomenutá). Pět dní: objednávka poslaná v pátek se schvaluje v pondělí,
 * přes víkend nebo svátek to může trvat i déle než dva dny.
 */
export const NEJVIC_STARY_RODIC_MS = 5 * 24 * 60 * 60 * 1000;

/** Normalizace pro porovnání citace se zprávou (malá písmena, bez diakritiky a neviditelných znaků). */
export function normCitace(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // WhatsApp vkládá kolem odrážek neviditelné znaky (U+2060 a spol.).
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const cas = (iso: string | null | undefined): number => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : Number.NaN;
};

/** Je zpráva `m` starší než odpověď? (Zpráva ve stejný okamžik nebo později citovanou být nemůže.) */
function jeDrivejsi(m: { created_at: string }, odpoved: { created_at: string }): boolean {
  const t = cas(m.created_at);
  const kdy = cas(odpoved.created_at);
  if (Number.isFinite(t) && Number.isFinite(kdy)) return t < kdy;
  return String(m.created_at) < String(odpoved.created_at);
}

/** Zprávy před odpovědí, jejichž začátek splňuje citaci (a naopak) — od nejnovější. */
export function zpravySplnujiciCitaci<T extends ZpravaProVazbu>(odpoved: OdpovedProVazbu, vsechny: T[]): T[] {
  const q = normCitace(odpoved.quoted_text);
  if (q.length < 3) return [];
  return vsechny
    .filter((m) => {
      if (m.id === odpoved.id) return false;
      if (!jeDrivejsi(m, odpoved)) return false;
      const text = normCitace(m.message_text);
      return !!text && (text.startsWith(q) || q.startsWith(text));
    })
    .sort((a, z) => (cas(z.created_at) || 0) - (cas(a.created_at) || 0));
}

export type RodicOdpovedi<T extends ZpravaProVazbu = ZpravaProVazbu> = {
  /** Zpráva, ke které odpověď patří; null = nenašla se. */
  zprava: T | null;
  /** Objednávka, která z ní vznikla; null = žádná (ještě). */
  objednavkaId: string | null;
  /** Rodič je novější zpráva, která ještě není schválená — odpověď se zatím k žádné objednávce nepřipojí. */
  ceka: boolean;
};

export function vyberRodice<T extends ZpravaProVazbu>(odpoved: OdpovedProVazbu, vsechny: T[]): RodicOdpovedi<T> {
  const kandidati = zpravySplnujiciCitaci(odpoved, vsechny);
  if (kandidati.length === 0) return { zprava: null, objednavkaId: null, ceka: false };
  const kdy = cas(odpoved.created_at);
  for (const k of kandidati) {
    if (k.imported_order_id) return { zprava: k, objednavkaId: k.imported_order_id, ceka: false };
    if (!jeOtevrena(k)) continue;
    const stari = Number.isFinite(kdy) ? kdy - cas(k.created_at) : 0;
    if (!(stari > NEJVIC_STARY_RODIC_MS)) return { zprava: k, objednavkaId: null, ceka: true };
  }
  // Nikdo nemá objednávku ani nečeká: nejnovější shoda aspoň kvůli odběrateli.
  return { zprava: kandidati[0], objednavkaId: null, ceka: false };
}

export type MistoZCitace<T extends ZpravaProVazbu = ZpravaProVazbu> = {
  /** Zpráva, od které se odběratel vzal. */
  zprava: T;
  placeId: string | null;
  placeName: string | null;
};

const klicMista = (m: ZpravaProVazbu): string =>
  m.parsed_place_id ? `id:${m.parsed_place_id}` : `jmeno:${normCitace(m.parsed_place_name)}`;
const maMisto = (m: ZpravaProVazbu): boolean => !!(m.parsed_place_id || m.parsed_place_name);

/**
 * Odběratel z citované zprávy. Bere se od rodiče odpovědi (`vyberRodice`);
 * když ten odběratele nemá (novější zpráva se ještě nepřečetla), pomůže starší
 * zpráva stejného znění — ale jen když se na odběrateli shodnou všechny, které
 * ho mají. Při rozporu zůstane prázdné: přiřadit objednávku cizímu odběrateli
 * je horší než ji nechat nevyplněnou.
 */
export function mistoZCitace<T extends ZpravaProVazbu>(odpoved: OdpovedProVazbu, vsechny: T[]): MistoZCitace<T> | null {
  const rodic = vyberRodice(odpoved, vsechny).zprava;
  if (!rodic) return null;
  const zMisto = (z: T): MistoZCitace<T> => ({
    zprava: z,
    placeId: z.parsed_place_id ?? null,
    placeName: z.parsed_place_name ?? null,
  });
  if (maMisto(rodic)) return zMisto(rodic);
  const sMistem = zpravySplnujiciCitaci(odpoved, vsechny).filter(maMisto);
  if (sMistem.length === 0) return null;
  const klice = new Set(sMistem.map(klicMista));
  return klice.size === 1 ? zMisto(sMistem[0]) : null;
}
