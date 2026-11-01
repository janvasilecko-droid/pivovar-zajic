// 🛢️ Malé sudy (KEG 20/15/10 l) — kolik jich máme a kolik chtějí objednávky.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „pro stáčení sudů připrav záložku malé sudy, tam
// naklikám počet malých sudů 20, 15, 10, a pak mi v objednávkách hlídej, aby
// když mám 3× 15, tak mi označ a hlídej, že můžu celkem použít jen 3× 15,
// ne třeba 6× 15."
//
// Počet zadává stáčeč na obrazovce KEG (záložka Malé sudy, tabulka
// male_sudy). Tady se jen porovná s OTEVŘENÝMI objednávkami (ne storno,
// nezavezené, nevyřízené): sudy se rozdělí po objednávkách od nejbližšího
// dovozu, a co se do počtu nevejde, se označí jako „nad počet". Obal, pro
// který nikdo počet nezadal, se nehlídá — appka by jinak hlásila nedostatek
// všude, kde se jen nic nevyplnilo.
import { jeVyrizena } from './stavyObjednavek';
import { vlastniSudyOdberatele } from './vlastniSudy';

export type ObalProSudy = { id: string; kind?: string | null; volume_l?: number | string | null; label?: string | null };

/** Malý sud = KEG pod 30 l (20, 15, 10 l). */
export function jeMalySud(obal: ObalProSudy | undefined): boolean {
  if (!obal) return false;
  const objem = Number(obal.volume_l ?? 0);
  return obal.kind === 'keg' && objem > 0 && objem < 30;
}

export type ObjednavkaProSudy = {
  id: string;
  status?: string | null;
  is_delivered?: boolean | null;
  delivery_date?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  /** Odběratel s vlastními sudy (lib/vlastniSudy.ts) prázdné sudy pivovaru nebere. */
  place_name?: string | null;
  /** Poznámka „do jejich sudu“ dělá vlastní i objednávku odběratele mimo seznam. */
  note?: string | null;
};
export type PolozkaProSudy = { id: string; order_id: string; package_id: string | null; quantity: number | string; beer_id?: string | null };

/** Objednávka, na kterou se sudy teprve chystají. */
export function jeOtevrena(o: ObjednavkaProSudy): boolean {
  return o.status !== 'storno' && !o.is_delivered && !jeVyrizena(o.status);
}

/**
 * Chystá se na ni sud TEĎ — závoz dnes nebo později. Z provozu 29. 9. 2026:
 * „v malých sudech mi to píše, že chybí přes 100 sudů" — počítaly se i staré
 * objednávky z minulých týdnů, které nikdo neoznačil jako zavezené. Ty jsou
 * dávno pryč a sudy nedrží. Bez data závozu se bere týden od objednání.
 */
export function chystaSeOd(o: ObjednavkaProSudy, dnes: string): boolean {
  if (o.delivery_date) return o.delivery_date.slice(0, 10) >= dnes;
  const objednano = (o.order_date ?? o.created_at ?? '').slice(0, 10);
  if (!objednano) return false;
  const tydenZpet = new Date(dnes + 'T00:00:00Z');
  tydenZpet.setUTCDate(tydenZpet.getUTCDate() - 7);
  return objednano >= tydenZpet.toISOString().slice(0, 10);
}

/** Kdy stáčeč počet naklikal: čas zápisu (ISO) a pražský den (YYYY-MM-DD). */
export type ZadaniMalehoSudu = { cas: string; den: string };

/** Odpočet závozu (zavoz_deductions) — co objednávka odvezla ze skladu. */
export type OdpocetProSudy = { order_id: string; beer_id?: string | null; package_id?: string | null; quantity?: number | string | null };

/** Kolik prázdných sudů jednoho obalu vzala objednávka, která už odjela. */
export type OdvezenoZObjednavky = { order_id: string; nazev: string | null; den: string | null; kusu: number };

/** Den, kdy objednávka odjíždí: den závozu, bez něj den objednání. */
export function denObjednavky(o: ObjednavkaProSudy): string | null {
  return (o.delivery_date ?? o.order_date ?? o.created_at ?? '').slice(0, 10) || null;
}

/**
 * Vzala už ODJETÁ objednávka sudy z naklikaného počtu? Jen když odjela PO
 * zadání počtu (1. 11. 2026: „v malých sudech vidím počty… ty se měly odečíst
 * podle objednávek, měly by tam být jen 2× 10 prázdné" — naklikáno v úterý,
 * Maneo ve čtvrtek odvezlo 4× 20, 2× 15 a 6× 10, a jakmile se odepsalo, jeho
 * sudy se k počtu zase „vrátily").
 *
 * Po zadání = den závozu je pozdější než den zadání, nebo je to týž den a
 * objednávka vznikla až po zadání (dnešní objednávka se odepíše hned při
 * zápisu, nikdy nebyla „otevřená"). Objednávka odvezená dřív — i zapsaná
 * zpětně — počet nemění: ty sudy stáčeč při počítání už neměl.
 */
export function odjelaPoZadani(o: ObjednavkaProSudy, zadani: ZadaniMalehoSudu): boolean {
  const den = denObjednavky(o);
  if (!den) return false;
  if (den !== zadani.den) return den > zadani.den;
  const vznik = Date.parse(o.created_at ?? '');
  const zadano = Date.parse(zadani.cas);
  return Number.isFinite(vznik) && Number.isFinite(zadano) && vznik > zadano;
}

export type SouhrnMalychSudu = {
  package_id: string;
  /**
   * Prázdných sudů TEĎ = naklikaný počet minus prázdné, které od zadání
   * odjely s objednávkami (`odvezeno`, 1. 11. 2026). Dokud nic neodjelo, je
   * to přesně naklikané číslo (13. 10. a 21. 10. 2026).
   */
  mame: number;
  /** Kolik sudů otevřené objednávky chtějí — každý si vezme jeden prázdný. */
  objednano: number;
  nad: number;
  /**
   * Plné sudy skladem u piv, která otevřené objednávky v tomhle obalu chtějí
   * (beer_id → kusy). Samy počet prázdných nemění (6. 10. 2026: „žádné plné,
   * tohle jsou prázdné, z těch se dělají objednávky"); panel se zeptá, jestli
   * je započítat.
   */
  plneSkladem?: Record<string, number>;
  /** Kolik objednaných sudů pokryly plné sudy skladem (jen u obalu se „započítat"). */
  zapocitanoPlnych?: number;
  /** Naklikaný počet (male_sudy.pocet) — kolik prázdných bylo při zadání. */
  zadano?: number;
  /** Kolik prázdných od zadání odjelo s objednávkami (stočily se a odvezly). */
  odvezeno?: number;
  /** Rozpad `odvezeno` po objednávkách — záložka Malé sudy ukáže, odkud číslo je. */
  odvezenoZ?: OdvezenoZObjednavky[];
};

export type VysledekMalychSudu = {
  /** Jen obaly s naklikaným počtem. */
  souhrn: SouhrnMalychSudu[];
  /** Kolik kusů položky je nad počet (id položky → kusy). Chybí = v pořádku. */
  nadPoPolozce: Map<string, number>;
  /** Každá hlídaná položka: kolik kusů má sud a kolik ne (zelená/oranžová/červená); `zeSkladu` = kolik pokryly započítané plné sudy skladem. */
  poPolozce: Map<string, { kryto: number; chybi: number; zeSkladu?: number }>;
};

/**
 * Rozdělí malé sudy po otevřených objednávkách od nejbližšího dovozu
 * (bez data na konec). Co se nevejde, je „nad počet".
 *
 * Objednávky, které od zadání počtu už odjely (`volby.zadano`, viz
 * odjelaPoZadani), si sudy vezmou napřed: o ně se zmenší `mame`. Každý sud
 * se tak počítá jednou — dokud objednávka neodjede, je v `objednano` (K
 * dispozici), potom v `odvezeno` — a K dispozici se po odvozu nezmění.
 */
export function hlidejMaleSudy(
  zasoba: Record<string, number>,
  objednavky: ObjednavkaProSudy[],
  polozky: PolozkaProSudy[],
  /** Síla piva podle beer_id — v rámci objednávky dostane sud nejdřív nejsilnější. */
  silaPodleId?: Map<string, number>,
  /** Dnešek (YYYY-MM-DD) — starší objednávky se nepočítají (chystaSeOd). */
  dnes?: string,
  /**
   * 30. 9. 2026: „v otevřených objednávkách mi píše, že chybí malé sudy —
   * všechny malé sudy odešly, 1× 20 l 11° jsem stáhl ze zrušeného Manea,
   * naopak mám 2× 20 a 1× 15 na skladě."
   *
   * `odepsane` = objednávky už odepsané ze skladu (odpočet závozu proběhl —
   * den závozu nastal, sudy jsou pryč). Z naklikaného počtu nic neberou.
   * `skladem` = stočené pivo skladem (beer_id__package_id → kusy). Samo počet
   * prázdných NEMĚNÍ — každý objednaný malý sud si vezme prázdný; plné sudy
   * skladem se ukážou v souhrn.plneSkladem (6. 10. 2026).
   * `zapocitatPlne` = obaly, u kterých stáčeč na otázku „započítat plné?"
   * řekl ano: tam plné sudy toho piva skladem pokryjí objednávku napřed
   * a prázdný sud se bere jen na zbytek.
   * `zadano` = kdy byl který počet naklikaný (bez něj se odjeté neodečítají).
   * `odpocty` = odpočty závozu: u obalu se „započítat plné" se odjeté
   * objednávce vrátí do skladu, co odvezla, ať plné pokryjí totéž co před
   * odvozem.
   */
  volby: {
    odepsane?: Set<string>;
    skladem?: Map<string, number>;
    zapocitatPlne?: Set<string>;
    zadano?: Record<string, ZadaniMalehoSudu>;
    odpocty?: OdpocetProSudy[];
  } = {},
): VysledekMalychSudu {
  // Odběratel s vlastními sudy (Duck and Dog, Michal Fojtovice, Martin —
  // lib/vlastniSudy.ts) se stáčí do svých sudů: z prázdných malých sudů
  // pivovaru nebere nic (6. 10. 2026: „to samý Martin malý sudy"). Stejně
  // tak objednávka, která to říká v poznámce („do jejich sudu", 14. 10. 2026).
  const otevrene = objednavky.filter((o) => jeOtevrena(o) && (!dnes || chystaSeOd(o, dnes)) && !volby.odepsane?.has(o.id)
    && !vlastniSudyOdberatele(o.place_name, o.note));
  const poradi = poradiObjednavek(otevrene);

  // Odjeté = ne storno, ne otevřené (zavezené, odepsané, vyřízené, po
  // termínu) a ne do vlastních sudů odběratele.
  const otevreneId = new Set(otevrene.map((o) => o.id));
  const zadano = volby.zadano ?? {};
  const odjete = objednavky.filter((o) => o.status !== 'storno' && !otevreneId.has(o.id)
    && !vlastniSudyOdberatele(o.place_name, o.note));
  const odjetaPodleId = new Map(odjete.map((o) => [o.id, o]));
  const poradiOdjetych = poradiObjednavek(odjete);
  const odjetePolozky = polozky
    .filter((p) => {
      const o = odjetaPodleId.get(p.order_id);
      const z = p.package_id ? zadano[p.package_id] : undefined;
      return !!o && !!z && zasoba[p.package_id!] != null && Number(p.quantity) > 0 && odjelaPoZadani(o, z);
    })
    .sort((a, b) => poradiOdjetych.get(a.order_id)! - poradiOdjetych.get(b.order_id)!
      || silaZ(silaPodleId, b.beer_id) - silaZ(silaPodleId, a.beer_id)
      || (a.id < b.id ? -1 : 1));

  const hlidane = polozky
    .filter((p) => p.package_id && zasoba[p.package_id] != null && poradi.has(p.order_id) && Number(p.quantity) > 0)
    .sort((a, b) => poradi.get(a.order_id)! - poradi.get(b.order_id)!
      || silaZ(silaPodleId, b.beer_id) - silaZ(silaPodleId, a.beer_id)
      || (a.id < b.id ? -1 : 1));

  const zbyva: Record<string, number> = { ...zasoba };
  // Plné sudy skladem pro „započítat plné": co odjeté objednávky odvezly, se
  // jim vrátí (odpočet je ze skladu už vzal), jinak by po odvozu pokryly míň
  // než předtím a K dispozici by poskočilo.
  const odjeteObj = new Set(odjetePolozky.map((p) => p.order_id));
  const sklad = new Map<string, number>(volby.skladem ?? []);
  for (const d of volby.odpocty ?? []) {
    if (!odjeteObj.has(d.order_id) || !d.package_id) continue;
    const k = `${d.beer_id ?? ''}__${d.package_id}`;
    sklad.set(k, (sklad.get(k) ?? 0) + (Number(d.quantity) || 0));
  }
  const zbyvaSkladem = new Map<string, number>();
  sklad.forEach((n, k) => { if (n > 0) zbyvaSkladem.set(k, n); });

  // 1) Odjeté od zadání: prázdné sudy už nejsou — zmenší naklikaný počet.
  const odvezeno: Record<string, number> = {};
  const odvezenoZ: Record<string, Map<string, OdvezenoZObjednavky>> = {};
  for (const p of odjetePolozky) {
    const obal = p.package_id!;
    const kusu = Number(p.quantity);
    const klicSkladu = `${p.beer_id ?? ''}__${obal}`;
    const zeSkladu = volby.zapocitatPlne?.has(obal) ? Math.min(kusu, zbyvaSkladem.get(klicSkladu) ?? 0) : 0;
    if (zeSkladu > 0) zbyvaSkladem.set(klicSkladu, (zbyvaSkladem.get(klicSkladu) ?? 0) - zeSkladu);
    const prazdnych = kusu - zeSkladu;
    if (prazdnych <= 0) continue;
    odvezeno[obal] = (odvezeno[obal] ?? 0) + prazdnych;
    zbyva[obal] = Math.max(0, zbyva[obal] - prazdnych);
    const o = odjetaPodleId.get(p.order_id)!;
    const poObjednavkach = (odvezenoZ[obal] ??= new Map());
    const radek = poObjednavkach.get(o.id) ?? { order_id: o.id, nazev: o.place_name ?? null, den: denObjednavky(o), kusu: 0 };
    radek.kusu += prazdnych;
    poObjednavkach.set(o.id, radek);
  }
  const mameTed: Record<string, number> = { ...zbyva };

  // 2) Otevřené objednávky si rozeberou, co zbylo.
  const objednano: Record<string, number> = {};
  const plne: Record<string, Record<string, number>> = {};
  const zapocitano: Record<string, number> = {};
  const nadPoPolozce = new Map<string, number>();
  const poPolozce = new Map<string, { kryto: number; chybi: number; zeSkladu?: number }>();
  for (const p of hlidane) {
    const obal = p.package_id!;
    const kusu = Number(p.quantity);
    const klicSkladu = `${p.beer_id ?? ''}__${obal}`;
    const skladem = volby.skladem?.get(klicSkladu) ?? 0;
    if (p.beer_id && skladem > 0) (plne[obal] ??= {})[p.beer_id] = skladem;
    // Plné sudy skladem jen když je stáčeč u obalu započítal.
    const zeSkladu = volby.zapocitatPlne?.has(obal) ? Math.min(kusu, zbyvaSkladem.get(klicSkladu) ?? 0) : 0;
    if (zeSkladu > 0) {
      zbyvaSkladem.set(klicSkladu, (zbyvaSkladem.get(klicSkladu) ?? 0) - zeSkladu);
      zapocitano[obal] = (zapocitano[obal] ?? 0) + zeSkladu;
    }
    const potreba = kusu - zeSkladu;
    objednano[obal] = (objednano[obal] ?? 0) + potreba;
    const vejde = Math.max(0, Math.min(potreba, zbyva[obal]));
    zbyva[obal] -= vejde;
    if (potreba > vejde) nadPoPolozce.set(p.id, potreba - vejde);
    poPolozce.set(p.id, { kryto: zeSkladu + vejde, chybi: potreba - vejde, zeSkladu });
  }

  const souhrn = Object.entries(zasoba).map(([package_id, naklikano]) => {
    const mame = mameTed[package_id];
    const obj = objednano[package_id] ?? 0;
    return {
      package_id, mame, objednano: obj, nad: Math.max(0, obj - mame),
      plneSkladem: plne[package_id] ?? {}, zapocitanoPlnych: zapocitano[package_id] ?? 0,
      zadano: naklikano, odvezeno: odvezeno[package_id] ?? 0,
      odvezenoZ: [...(odvezenoZ[package_id]?.values() ?? [])],
    };
  });
  return { souhrn, nadPoPolozce, poPolozce };
}

/** Pořadí objednávek od nejbližšího dovozu (bez data na konec), pak podle vzniku. */
function poradiObjednavek(objednavky: ObjednavkaProSudy[]): Map<string, number> {
  return new Map(
    [...objednavky]
      .sort((a, b) => {
        const da = a.delivery_date ?? '9999-12-31';
        const db = b.delivery_date ?? '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        const ca = a.created_at ?? a.order_date ?? '';
        const cb = b.created_at ?? b.order_date ?? '';
        if (ca !== cb) return ca < cb ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((o, i) => [o.id, i]),
  );
}

/**
 * Kolik malých sudů daného obalu smí ještě dostat JEDNA objednávka — pro
 * formulář zadání a úpravy (29. 9. 2026: „v objednávce Maneo chci vidět, na
 * kolik sudů mě to pustí, na co není sud, udělej červeně").
 *
 * `uzVTetoObjednavce` = kolik kusů tohoto obalu už objednávka měla před
 * úpravou (ty jsou v `objednano` započítané a uvolní se). Vrací null, když
 * se obal nehlídá.
 */
export function volneProObjednavku(
  souhrn: SouhrnMalychSudu[],
  packageId: string | null | undefined,
  uzVTetoObjednavce = 0,
): number | null {
  if (!packageId) return null;
  const s = souhrn.find((x) => x.package_id === packageId);
  if (!s) return null;
  return s.mame - (s.objednano - uzVTetoObjednavce);
}

function silaZ(mapa: Map<string, number> | undefined, beerId: string | null | undefined): number {
  return (beerId && mapa?.get(beerId)) || 0;
}

/** Síla piva ve stupních — z `degree` („12", „12°", „11,5"), jinak z názvu („12 Světlý"). */
export function silaPiva(beer: { degree?: string | null; name?: string | null } | null | undefined): number {
  for (const zdroj of [beer?.degree, beer?.name]) {
    const m = String(zdroj ?? '').match(/(\d+(?:[.,]\d+)?)/);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return 0;
}

export type RadekSudu = { klic: string; pkgId: string | null | undefined; qty: number; sila: number };
export type PrideleniRadku = { kryto: number; chybi: number };

/**
 * Rozdělí volné malé sudy po řádcích JEDNÉ objednávky (29. 9. 2026: „má to
 * vzít od nejsilnějších a přiřadit prázdné malé sudy — mám 1× 20 a 2× 15,
 * je tam 2× 20 12° → částečně, řádek oranžový a pod tím −1× 20; 2× 15
 * normálně; zbytek malých červeně, protože pro ně nejsou sudy; 30 l a PET
 * normálně").
 *
 * V každém obalu dostanou sudy řádky od nejsilnějšího piva. Řádky s
 * nehlídaným obalem (velké sudy, lahve) ve výsledku nejsou.
 */
export function rozdelMaleSudyVObjednavce(
  souhrn: SouhrnMalychSudu[],
  radky: RadekSudu[],
  uzVTetoObjednavce: (pkgId: string) => number = () => 0,
): Map<string, PrideleniRadku> {
  const vysledek = new Map<string, PrideleniRadku>();
  const zbyva = new Map<string, number>();
  const serazene = radky
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.sila - a.r.sila || a.i - b.i);
  for (const { r } of serazene) {
    if (!r.pkgId || !(r.qty > 0)) continue;
    if (!zbyva.has(r.pkgId)) {
      const volne = volneProObjednavku(souhrn, r.pkgId, uzVTetoObjednavce(r.pkgId));
      if (volne == null) continue;
      zbyva.set(r.pkgId, Math.max(0, volne));
    }
    const mam = zbyva.get(r.pkgId)!;
    const kryto = Math.min(mam, r.qty);
    zbyva.set(r.pkgId, mam - kryto);
    vysledek.set(r.klic, { kryto, chybi: r.qty - kryto });
  }
  return vysledek;
}

/** Pondělí týdne, do kterého spadá den `datum` (YYYY-MM-DD). */
export function pondeliTydne(datum: string): string {
  const d = new Date(datum + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type RadekMalychSudu = { package_id: string; pocet: number | string; updated_at?: string | null };
export type StoceniMalehoSudu = { package_id: string | null; quantity: number | string; created_at?: string | null };

/**
 * Kolik PRÁZDNÝCH malých sudů je teď k dispozici = přesně to, co stáčeč naklikal, do konce týdne.
 *
 * 5. 10. 2026: „sudy se ukazují vždy jen na týden" — naklikaný počet platí jen v TÝDNU, kdy byl
 * zadaný (po–ne, podle Prahy); z minulého týdne se nehlídá nic, stáčeč počet zadá znovu.
 *
 * 21. 10. 2026: počet se po stočení NEODEČÍTÁ („to nejsou data, co jsem zadával v pondělí").
 * Dřív se od zadaného počtu odečítalo, co se od zadání stočilo do daného obalu, takže číslo
 * v záložce Malé sudy samo klesalo (10 l: zadáno 2 → ukazovalo 0) a sudy objednávky, která
 * ještě neodjela, se odečetly dvakrát (stočením i v K dispozici).
 *
 * 1. 11. 2026: od naklikaného čísla se odečtou objednávky, které od zadání ODJELY — to dělá
 * hlidejMaleSudy (souhrn.mame); tady je jen naklikané číslo platné v týdnu zadání.
 *
 * `denZadani` převádí updated_at na pražský den (businessDateISO).
 */
export function prazdneMaleSudy(
  radky: RadekMalychSudu[],
  dnes: string,
  denZadani: (iso: string) => string,
): Record<string, number> {
  const tyden = pondeliTydne(dnes);
  const z: Record<string, number> = {};
  for (const r of radky) {
    if (r.updated_at && pondeliTydne(denZadani(r.updated_at)) < tyden) continue;
    z[r.package_id] = Math.max(0, Number(r.pocet) || 0);
  }
  return z;
}

/**
 * Kdy byl který počet naklikaný (jen počty platné v tomhle týdnu, stejně jako
 * prazdneMaleSudy) — podle toho hlidejMaleSudy pozná objednávky odjeté po zadání.
 */
export function zadaniMalychSudu(
  radky: RadekMalychSudu[],
  dnes: string,
  denZadani: (iso: string) => string,
): Record<string, ZadaniMalehoSudu> {
  const tyden = pondeliTydne(dnes);
  const z: Record<string, ZadaniMalehoSudu> = {};
  for (const r of radky) {
    if (!r.updated_at) continue;
    const den = denZadani(r.updated_at);
    if (pondeliTydne(den) < tyden) continue;
    z[r.package_id] = { cas: r.updated_at, den };
  }
  return z;
}
