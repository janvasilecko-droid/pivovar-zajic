// 🧠 Naučené opravy čtení — jen to, co uživatel výslovně potvrdil („Naučit").
// ---------------------------------------------------------------------------
// Zadání majitele 23. 11. 2026: „pokud se něco přečte nesprávně, přidej tam
// možnost tlačítko naučit; pokud to uživatel opraví a bude chtít, aby si AI
// pamatovala tu opravu, tak to může zakliknout a appka si to bude na příště
// pamatovat."
//
// Do té doby se appka učila potichu z KAŽDÉ ruční změny (parser_aliases) a to
// čtení rozbilo: záměna jen pro jednu objednávku („místo dvacítky dáme
// patnáctku") se stala pravidlem pro všechny další zprávy. Proto:
//   • učí se jen se zaškrtnutím v kontrole zprávy (tabulka naucene_opravy),
//   • oprava patří ODBĚRATELI, u kterého vznikla („bedna" je u Lužce třetinka),
//   • nejde naučit nic, co odporuje tomu, co v řádku výslovně stojí („15l",
//     „Hazy") — to je záměna, ne chyba čtení (viz duvodProcNelzeNaucit),
//   • použije se dvojím způsobem: řádek se stejným textem (bez počtu kusů) se
//     u téhož odběratele přečte stejně NAJISTO, a AI ji dostane jako příklad
//     pro podobně napsané řádky.
//
// Modul je společný pro server (whatsapp-auto-parse) i appku (kontrolní okno,
// „Přečíst znovu"), ať obě cesty čtou stejně.
import { normText, objemyVyslovneVTextu, pivaJmenovanaVTextu, jeRadekJednePolozky } from "./beer-match.ts";

export type NaucenaOprava = {
  id?: string;
  misto_klic: string;
  place_id: string | null;
  place_name: string | null;
  radek: string;
  klic: string;
  beer_id: string | null;
  package_id: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

export type Misto = { placeId?: string | null; placeName?: string | null };

/** Nejvíc příkladů, které dostane AI — víc by jen ubíralo pozornost pravidlům. */
export const NEJVIC_PRIKLADU_PRO_AI = 40;
const NEJVIC_ZNAKU_RADKU = 200;

/**
 * Komu oprava patří: id odběratele z katalogu, jinak „jmeno:<název>" (bez
 * diakritiky, malými). Prázdný řetězec = odběratel není znám, oprava nemá
 * komu patřit.
 */
export function klicMista(misto: Misto): string {
  if (misto.placeId) return String(misto.placeId);
  const jmeno = normText(String(misto.placeName || ""));
  return jmeno ? `jmeno:${jmeno}` : "";
}

/**
 * Klíče, pod kterými se oprava HLEDÁ: id i jméno. Oprava naučená u odběratele
 * psaného jen jménem musí platit i poté, co dostal místo v katalogu (a obráceně).
 */
export function kliceMista(misto: Misto): string[] {
  const klice: string[] = [];
  if (misto.placeId) klice.push(String(misto.placeId));
  const jmeno = normText(String(misto.placeName || ""));
  if (jmeno) klice.push(`jmeno:${jmeno}`);
  return klice;
}

/**
 * Řádek bez diakritiky a BEZ POČTU KUSŮ — podle něj se pozná „tentýž zápis":
 * „10x zajíc 1l" i „5x zajíc 1l" dají „zajic 1l", „5 beden světlého" dá „beden
 * svetleho". Objem i stupeň v klíči zůstávají: „3x 15l desítka" a „3x 30l
 * desítka" jsou různé zápisy.
 */
export function klicRadku(raw: string | null | undefined): string {
  return normText(String(raw || ""))
    // úvodní spojka nebo zdvořilost („a 3 tmavého", „plus …", „prosím 5 beden")
    .replace(/^(?:(?:a|plus|jeste|prosim|taky|dale)\s+)+/, "")
    // „3x", „12x" (i přilepené: „12xpet", „3x30"), „5 ks", „2 kusy"
    .replace(/(?:^|(?<=\s))\d{1,4}\s*(?:x|ks|kus[a-z]{0,2})(?=\s|[a-z0-9]|$)/g, " ")
    // počet na začátku před slovem („5 beden…") nebo před objemem („10 30 litrů")
    .replace(/^\s*\d{1,4}\s+(?=[a-z]|\d+(?:[.,]\d+)?\s*l)/, "")
    .replace(/\s+/g, " ")
    .replace(/^[.,\s]+|[.,\s]+$/g, "")
    .slice(0, NEJVIC_ZNAKU_RADKU);
}

type Pivo = { id: string; name: string; degree?: string | null; short_name?: string | null };
type Obal = { id: string; label: string; volume_l?: number | null };
const PRAZDNE_ZKRATKY = { beer: new Map<string, string>(), package: new Map<string, string>() };
const litry = (v: number) => `${String(v).replace(".", ",")} l`;

/**
 * Proč opravu NEJDE naučit — věta pro člověka; null = naučit jde.
 *
 * `noveBeerId` / `novePackageId` = co uživatel vybral místo přečteného (jen to,
 * co změnil). Záměna proti tomu, co v řádku výslovně stojí, se neučí: řádek byl
 * přečten správně a člověk jen pro tuhle objednávku dává něco jiného.
 */
export function duvodProcNelzeNaucit(v: {
  rawLine: string | null | undefined;
  noveBeerId?: string | null;
  novePackageId?: string | null;
  beers: Pivo[];
  packages: Obal[];
  /** Řádek výsledného stavu upravované objednávky s textem citované zprávy. */
  zCitace?: boolean;
}): string | null {
  const raw = String(v.rawLine || "").trim();
  if (!raw) return "Položka nemá řádek ze zprávy — není se z čeho učit.";
  if (v.zCitace) return "Položka je z původní (citované) zprávy — oprava platí jen pro tuhle objednávku.";
  if (!jeRadekJednePolozky(raw)) return "Na řádku je víc položek najednou — oprava platí jen pro tuhle objednávku.";
  if (!klicRadku(raw)) return "V řádku je jen počet kusů — není se z čeho učit.";
  if (v.novePackageId) {
    const objem = Number(v.packages.find((p) => p.id === v.novePackageId)?.volume_l);
    const vyslovne = objemyVyslovneVTextu(raw);
    if (vyslovne.length && !vyslovne.includes(objem)) {
      return `V řádku stojí ${litry(vyslovne[0])} — oprava platí jen pro tuhle objednávku.`;
    }
  }
  if (v.noveBeerId) {
    const jmenovana = pivaJmenovanaVTextu(raw, v.beers, PRAZDNE_ZKRATKY);
    if (jmenovana.length && !jmenovana.includes(v.noveBeerId)) {
      const jmeno = v.beers.find((b) => b.id === jmenovana[0])?.name ?? "jiné pivo";
      return `V řádku stojí ${jmeno.trim()} — oprava platí jen pro tuhle objednávku.`;
    }
  }
  return null;
}

/** Řádek k uložení (nebo null, když oprava nemá komu patřit / nic neučí). */
export function sestavOpravu(v: {
  misto: Misto;
  rawLine: string | null | undefined;
  beerId?: string | null;
  packageId?: string | null;
  createdBy?: string | null;
}): NaucenaOprava | null {
  const misto_klic = klicMista(v.misto);
  const klic = klicRadku(v.rawLine);
  const radek = String(v.rawLine || "").replace(/\s+/g, " ").trim().slice(0, NEJVIC_ZNAKU_RADKU);
  if (!misto_klic || !klic || !radek || (!v.beerId && !v.packageId)) return null;
  return {
    misto_klic,
    place_id: v.misto.placeId || null,
    place_name: String(v.misto.placeName || "").trim() || null,
    radek,
    klic,
    beer_id: v.beerId || null,
    package_id: v.packageId || null,
    created_by: v.createdBy ?? null,
  };
}

/**
 * Oprava naučená pro tenhle řádek u tohohle odběratele — přesná shoda klíče
 * (text bez počtu kusů). Řádek s víc položkami se nepáruje: klíč by sdílely
 * všechny jeho položky.
 */
export function najdiOpravu(opravy: NaucenaOprava[], misto: Misto, rawLine: string | null | undefined): NaucenaOprava | null {
  const klice = kliceMista(misto);
  if (!klice.length || !opravy.length) return null;
  const raw = String(rawLine || "");
  if (!raw.trim() || !jeRadekJednePolozky(raw)) return null;
  const klic = klicRadku(raw);
  if (!klic) return null;
  return opravy.find((o) => klice.includes(o.misto_klic) && o.klic === klic) ?? null;
}

/**
 * Velikost lahve (0,33 / 0,5 l), kterou uživatel odběrateli výslovně naučil
 * u řádku bez udané velikosti („5 beden světlého" → třetinky). Má přednost
 * před zvykem z historie (zvyk-lahve.ts). Při víc opravách platí nejnovější.
 */
export function lahevZOprav(opravy: NaucenaOprava[], misto: Misto, packages: Obal[]): 0.33 | 0.5 | null {
  const klice = kliceMista(misto);
  if (!klice.length) return null;
  const kandidati = opravy
    .filter((o) => klice.includes(o.misto_klic) && o.package_id)
    .map((o) => ({ o, objem: Number(packages.find((p) => p.id === o.package_id)?.volume_l) }))
    .filter((x) => (x.objem === 0.33 || x.objem === 0.5) && !objemyVyslovneVTextu(x.o.radek).some((v) => v === 0.33 || v === 0.5))
    .sort((a, b) => String(b.o.created_at ?? "").localeCompare(String(a.o.created_at ?? "")));
  return kandidati.length ? (kandidati[0].objem as 0.33 | 0.5) : null;
}

export type PrikladOpravy = { odberatel: string | null; radek: string; pivo: string | null; obal: string | null };

/** Opravy jako příklady pro AI — nejnovější napřed, s čitelnými názvy z katalogu. */
export function prikladyProAI(opravy: NaucenaOprava[], beers: Pivo[], packages: Obal[], nejvic = NEJVIC_PRIKLADU_PRO_AI): PrikladOpravy[] {
  return [...opravy]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((o) => ({
      odberatel: o.place_name,
      radek: o.radek,
      pivo: o.beer_id ? (beers.find((b) => b.id === o.beer_id)?.name ?? "").trim() || null : null,
      obal: o.package_id ? (packages.find((p) => p.id === o.package_id)?.label ?? "").trim() || null : null,
    }))
    .filter((p) => p.radek && (p.pivo || p.obal))
    .slice(0, nejvic);
}

/** Text bez znaků, které by v pokynu pro AI mohly dělat neplechu (nové řádky, uvozovky). */
const doPokynu = (t: unknown, nejvic: number) => String(t ?? "").replace(/[\r\n"„“”]+/g, " ").replace(/\s+/g, " ").trim().slice(0, nejvic);

/**
 * Příklady z těla požadavku → řádky do pokynu pro AI (zvlášť piva a obaly).
 * Bere jen to, co má smysluplný tvar; nic z toho nejsou pokyny, jen data.
 */
export function radkyDoPokynu(opravy: unknown): { piva: string[]; obaly: string[] } {
  const piva: string[] = [];
  const obaly: string[] = [];
  if (!Array.isArray(opravy)) return { piva, obaly };
  for (const o of opravy.slice(0, NEJVIC_PRIKLADU_PRO_AI)) {
    const radek = doPokynu((o as PrikladOpravy)?.radek, 120);
    if (!radek) continue;
    const odberatel = doPokynu((o as PrikladOpravy)?.odberatel, 60);
    const zacatek = `${odberatel ? `[${odberatel}] ` : ""}"${radek}"`;
    const pivo = doPokynu((o as PrikladOpravy)?.pivo, 60);
    const obal = doPokynu((o as PrikladOpravy)?.obal, 40);
    if (pivo) piva.push(`${zacatek} → ${pivo}`);
    if (obal) obaly.push(`${zacatek} → ${obal}`);
  }
  return { piva, obaly };
}

/**
 * Načte naučené opravy. Nikdy nevyhazuje výjimku: bez tabulky (migrace ještě
 * neběžela) nebo při výpadku se čte bez nich, jako dosud.
 */
export async function nactiNauceneOpravy(supabase: { from: (t: string) => any }): Promise<NaucenaOprava[]> {
  try {
    const { data, error } = await supabase
      .from("naucene_opravy")
      .select("id, misto_klic, place_id, place_name, radek, klic, beer_id, package_id, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return [];
    return (data ?? []) as NaucenaOprava[];
  } catch {
    return [];
  }
}
