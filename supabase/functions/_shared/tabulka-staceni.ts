// 📊 Tabulka stáčení („Zápis stáčení lahve", excel) z fotky — čtení od zvoleného data.
// ---------------------------------------------------------------------------
// 15. 10. 2026, majitel: „čtení fotky z týhle excelový tabulky udělej ve všech
// zadáváních, ať se nemusí ořezávat, takže můžu zadat datum od kdy chci data
// číst — třeba od 10.10., takže stačí přečíst poslední 3 nebo 4 řádky. Datum
// platí do tý doby, než se objeví další (u prázdných políček u datumů)."
//
// Jak tabulka vypadá (stejně jako soubor, který appka umí načíst z Disku —
// src/lib/importStaceniExcel.ts): zleva číslo řádku excelu (tmavý sloupec),
// Datum, Pivo, pak pět úzkých sloupců SUDŮ (kolik sudů 50 / 30 / 20 / 15 / 10 l
// se spotřebovalo), tlustá čára, čtyři úzké sloupce LAHVÍ (kolik kusů se
// stočilo: PET 1,5 l, PET 1 l, lahev 0,5 l, lahev 0,33 l) a vpravo dopočítané
// sloupce. Datum je napsané jen na PRVNÍM řádku dne, na dalších je buňka prázdná.
//
// Obecné čtení objednávek (parse-order-image) tuhle tabulku četlo špatně:
// všechno brané jako „KEG 30l" a čtyři sloupce lahví vůbec. Tady se čte po
// sloupcích a v tom, co jde spočítat, se nic nehádá:
//   • Google Vision přečte fotku a podle POLOHY slov najde řádky s daty — tím
//     se zjistí, odkud se má číst (první řádek s datem od zvoleného dne) a kolik
//     řádků to je; appka pak ten výřez ořízne a zvětší (což majitel dělal ručně),
//   • AI přečte buňky podle sloupců (a nic nepočítá ani nedoplňuje),
//   • DATUM zděděné z řádku výš a filtr „od data" dělá kód, ne AI,
//   • kontroly: čísla proti přepisu Vision, litry v lahvích proti litrům sudu
//     (výtrata), shoda dat. Co nesedí, se nezahodí — ukáže se s varováním.
//
// Soubor je čistý (bez Dena a bez Reactu), aby šel testovat a používat jak
// v edge funkci parse-order-image, tak v aplikaci (kontrola výtraty, popisky).

import { slovaZVision } from "./uzaverka-ocr.ts";
import { matchBeerId } from "./beer-match.ts";

/** Sloupce sudů, zleva doprava (objem v litrech). */
export const OBJEMY_SUDU = [50, 30, 20, 15, 10];
/** Sloupce lahví, zleva doprava: PET 1,5 l, PET 1 l, lahev 0,5 l, lahev 0,33 l. */
export const OBJEMY_LAHVI = [1.5, 1, 0.5, 0.33];

/** Kolik kusů (sudů / lahví) je v buňce sloupce o daném objemu. */
export type Bunka = { objemL: number; ks: number };

/** Jeden řádek tabulky, jak ho čtení vrací. */
export type RadekTabulky = {
  /** Číslo řádku excelu z levého sloupce, když je na fotce vidět. */
  cislo: number | null;
  /** Datum z buňky TOHOTO řádku (ISO) — null, když je buňka prázdná. */
  datumVBunce: string | null;
  /** Datum řádku: z buňky, jinak z nejbližšího řádku nad ním (ISO). Null = patří k datu nad fotkou. */
  datum: string | null;
  /** Text z buňky Pivo (null = buňka je prázdná). */
  pivo: string | null;
  /** Pivo z katalogu, když se text dal spárovat. */
  pivoId: string | null;
  sudy: Bunka[];
  lahve: Bunka[];
  /** Co na řádku nesedí a má se zkontrolovat podle fotky. */
  varovani: string[];
};

/** Kolik řádků je v kterém dni (datum null = nad prvním datem na fotce). */
export type DenTabulky = { datum: string | null; radku: number };

// ── Datum ───────────────────────────────────────────────────────────────

/** „2026-10-13" → „13. 10. 2026" (do hlášek pro obsluhu). */
export function datumCesky(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : String(iso ?? "");
}

function platneDatum(rok: number, mesic: number, den: number): string | null {
  if (!Number.isInteger(rok) || !Number.isInteger(mesic) || !Number.isInteger(den)) return null;
  if (rok < 2000 || rok > 2100 || mesic < 1 || mesic > 12 || den < 1) return null;
  const posledniDen = new Date(Date.UTC(rok, mesic, 0)).getUTCDate();
  if (den > posledniDen) return null;
  return `${rok}-${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/**
 * Datum z textu buňky: „13.10.2026", „13. 10. 2026", „13.10.26" i ISO
 * „2026-10-13". Neexistující den („31.9.2026") a cokoli jiného = null — nehádá
 * se. OCR občas píše O místo nuly a l místo jedničky („13.1O.2O26"); to se
 * opraví, jen když text jinak vypadá jako datum.
 */
export function datumZTextu(text: string | null | undefined): string | null {
  if (text == null) return null;
  let t = String(text).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (m) return platneDatum(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^[\dOolI|.,/\s-]+$/.test(t)) t = t.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1");
  m = t.match(/^(\d{1,2})\s*[.,/-]\s*(\d{1,2})\s*[.,/-]\s*(\d{4}|\d{2})\s*\.?$/);
  if (!m) return null;
  const rok = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return platneDatum(rok, Number(m[2]), Number(m[1]));
}

// ── Přepis fotky (Google Vision) po řádcích ─────────────────────────────

/** Jeden řádek tabulky podle polohy slov z Google Vision. */
export type OcrRadek = {
  /** Střed a okraje řádku (0–1 vzhledem k výšce obrázku). */
  y: number;
  yHore: number;
  yDole: number;
  /** Číslo řádku excelu z levého sloupce, když fotka sloupec s čísly řádků má. */
  cislo: number | null;
  /** Datum z buňky Datum (ISO). */
  datum: string | null;
  /** Text z buňky Pivo. */
  pivo: string | null;
  /** Čísla z buněk sudů a lahví zleva doprava (bez čísla řádku, data a názvu piva). */
  cisla: number[];
  /** Řádek obsahuje něco ze zápisu (datum, pivo nebo čísla), ne jen číslo řádku. */
  maData: boolean;
};

export type PrepisTabulky = {
  radky: OcrRadek[];
  /** Náklon písma v radiánech (0 = vodorovně). */
  naklon: number;
  sirka: number;
  vyska: number;
  /** Fotka má sloupec s čísly řádků excelu. */
  maRadkovaCisla: boolean;
  /** Typická výška písma v pixelech — pod ~14 px Vision čísla v buňkách zkomolí a přepis se k jejich kontrole nehodí. */
  pismo: number;
};

/** Od jaké výšky písma se čísla z přepisu berou jako spolehlivá. */
const SPOLEHLIVE_PISMO_PX = 14;

type Token = { t: string; x: number; l: number; r: number; w: number; h: number; horni: number; dolni: number };

const jeCislo = (t: string) => /^\d{1,4}$/.test(t);
/** Slovo s písmenem — začátek názvu piva. Samotné čárky, závorky a svislítka (okraj okna, posuvník) pivo nejsou. */
const maPismeno = (t: string) => /\p{L}/u.test(t);
/** Stupeň u názvu („11°") Vision občas přečte jako uvozovku nebo apostrof. */
const jeStupen = (t: string) => /^["”'`´°]$/.test(t);

/** Datum složené z 1–3 sousedních slov („13.10.2026" / „13. 10. 2026"); vrací i počet spotřebovaných slov. */
function datumVTokenech(tokeny: Token[], od: number, hMed: number): { datum: string; pocet: number } | null {
  for (let pocet = 1; pocet <= 3 && od + pocet <= tokeny.length; pocet++) {
    const skupina = tokeny.slice(od, od + pocet);
    let souvisle = true;
    for (let i = 1; i < skupina.length; i++) if (skupina[i].l - skupina[i - 1].r > 2.5 * hMed) souvisle = false;
    if (!souvisle) break;
    const datum = datumZTextu(skupina.map((s) => s.t).join(""));
    if (datum) return { datum, pocet };
  }
  return null;
}

/**
 * Řádky tabulky z odpovědi Google Vision (DOCUMENT_TEXT_DETECTION, slova
 * s polohou). Slova se seskupí podle výšky; v řádku se pozná číslo řádku
 * excelu, datum, název piva a čísla z buněk.
 */
// deno-lint-ignore no-explicit-any
export function prepisTabulky(data: any): PrepisTabulky {
  const slova = slovaZVision(data);
  const stranka = data?.responses?.[0]?.fullTextAnnotation?.pages?.[0];
  let sirka = Number(stranka?.width) || 0;
  let vyska = Number(stranka?.height) || 0;
  if (!sirka || !vyska) {
    for (const s of slova) for (const p of s.v) { sirka = Math.max(sirka, p.x); vyska = Math.max(vyska, p.y); }
  }
  const prazdny: PrepisTabulky = { radky: [], naklon: 0, sirka, vyska, maRadkovaCisla: false, pismo: 0 };
  if (slova.length === 0 || !sirka || !vyska) return prazdny;

  // Náklon písma = medián směru horní hrany DLOUHÝCH slov. Součet přes všechna
  // slova (jako u účtenky) tu nestačí: u malého písma Vision zaokrouhluje rohy
  // na celé pixely, pár krátkých slov se šikmým rohem posunulo náklon na 1,4° —
  // a to je u široké tabulky dost, aby se buňky na pravém kraji odtrhly od
  // svého řádku.
  const uhly: number[] = [];
  for (const s of slova) {
    const dx = s.v[1].x - s.v[0].x;
    const dy = s.v[1].y - s.v[0].y;
    const delka = Math.hypot(dx, dy);
    const vyska0 = Math.hypot(s.v[3].x - s.v[0].x, s.v[3].y - s.v[0].y);
    if (delka >= 3 * vyska0 && s.t.length >= 3) uhly.push(Math.atan2(dy, dx));
  }
  uhly.sort((a, b) => a - b);
  const naklon = uhly.length >= 5 ? uhly[Math.floor(uhly.length / 2)] : 0;
  const cos = Math.cos(naklon);
  const sin = Math.sin(naklon);

  const body = slova.map((s) => {
    const xs = s.v.map((p) => p.x);
    const ys = s.v.map((p) => p.y);
    const cx = xs.reduce((a, b) => a + b, 0) / 4;
    const cy = ys.reduce((a, b) => a + b, 0) / 4;
    return {
      t: s.t,
      x: cx * cos + cy * sin,
      y: -cx * sin + cy * cos,
      w: Math.hypot(s.v[1].x - s.v[0].x, s.v[1].y - s.v[0].y),
      h: Math.hypot(s.v[3].x - s.v[0].x, s.v[3].y - s.v[0].y),
      l: Math.min(...xs),
      r: Math.max(...xs),
      horni: Math.min(...ys),
      dolni: Math.max(...ys),
    };
  });
  const vysky = body.map((b) => b.h).filter((h) => h > 0).sort((a, b) => a - b);
  const hMed = vysky.length ? vysky[Math.floor(vysky.length / 2)] : 1;

  body.sort((a, b) => a.y - b.y);
  const skupiny: { body: typeof body; soucet: number }[] = [];
  for (const b of body) {
    const posledni = skupiny[skupiny.length - 1];
    if (posledni && Math.abs(b.y - posledni.soucet / posledni.body.length) < 0.55 * hMed) {
      posledni.body.push(b);
      posledni.soucet += b.y;
    } else {
      skupiny.push({ body: [b], soucet: b.y });
    }
  }

  const radky: OcrRadek[] = skupiny.map((s) => {
    const tokeny: Token[] = s.body
      .sort((a, b) => a.x - b.x)
      .map((b) => ({ t: b.t, x: b.x, l: b.l, r: b.r, w: b.w, h: b.h, horni: b.horni, dolni: b.dolni }));

    // Číslo řádku excelu: úplně první slovo řádku, celé číslo, v levém okraji fotky.
    let cislo: number | null = null;
    let od = 0;
    if (tokeny.length > 0 && /^\d{1,6}$/.test(tokeny[0].t) && tokeny[0].l / sirka < 0.12) {
      cislo = Number(tokeny[0].t);
      od = 1;
    }

    // Datum: první souvislá skupina slov, která je datem.
    let datum: string | null = null;
    let zbytek = tokeny.slice(od);
    for (let i = 0; i < zbytek.length && !datum; i++) {
      const d = datumVTokenech(zbytek, i, hMed);
      if (d) { datum = d.datum; zbytek = [...zbytek.slice(0, i), ...zbytek.slice(i + d.pocet)]; }
    }

    // Pivo: souvislý text od prvního slova s písmenem; číslice a stupeň („°")
    // těsně před ním jsou jeho součást („12 Světlá", „11° sv.ležák"). Co je
    // napravo, jsou buňky.
    const prvniText = zbytek.findIndex((t) => maPismeno(t.t));
    let pivo: string | null = null;
    let cisla: Token[] = zbytek;
    if (prvniText >= 0) {
      let a = prvniText;
      while (a > 0 && (jeCislo(zbytek[a - 1].t) || jeStupen(zbytek[a - 1].t)) && zbytek[a].l - zbytek[a - 1].r < 2 * hMed) a--;
      let b = prvniText;
      while (b + 1 < zbytek.length && (maPismeno(zbytek[b + 1].t) || jeStupen(zbytek[b + 1].t)) && zbytek[b + 1].l - zbytek[b].r < 2.5 * hMed) b++;
      pivo = zbytek.slice(a, b + 1).map((t) => t.t).join(" ")
        .replace(/(\d)\s*["”'`´]\s*/g, "$1° ")
        .replace(/\s+°/g, "°")
        .replace(/\s+\./g, ".")
        .trim();
      cisla = [...zbytek.slice(0, a), ...zbytek.slice(b + 1)];
    }
    const hodnoty = cisla.filter((t) => jeCislo(t.t)).map((t) => Number(t.t));

    const horni = Math.min(...s.body.map((b) => b.horni));
    const dolni = Math.max(...s.body.map((b) => b.dolni));
    return {
      y: s.soucet / s.body.length / vyska,
      yHore: horni / vyska,
      yDole: dolni / vyska,
      cislo,
      datum,
      pivo,
      cisla: hodnoty,
      maData: !!datum || !!pivo || hodnoty.length > 0,
    };
  });

  // Fotka s čísly řádků: řádek bez čísla je jen šum mezi řádky (OCR občas
  // vyrobí „duchy" z čísel ze dvou sousedních řádků), do zápisu nepatří.
  const sCislem = radky.filter((r) => r.cislo !== null).length;
  const maRadkovaCisla = radky.length >= 3 && sCislem / radky.length >= 0.6;
  if (maRadkovaCisla) for (const r of radky) if (r.cislo === null) r.maData = false;

  return { radky, naklon, sirka, vyska, maRadkovaCisla, pismo: hMed };
}

// ── Odkud číst ──────────────────────────────────────────────────────────

/** Obdélník na fotce (0–1 vzhledem k šířce a výšce obrázku). */
export type OknoTabulky = { x0: number; y0: number; x1: number; y1: number };

export type VysledekOkna = {
  /** Výřez řádků, které se mají číst; null = nejde určit (viz důvod). */
  okno: OknoTabulky | null;
  duvod: null | "prazdna" | "bez-dat" | "nic-od-data" | "natocena";
  /** Data, která Vision na fotce našlo (vzestupně, bez opakování). */
  data: string[];
  /** Datum prvního řádku výřezu (z buňky) — pro případ, že AI datum prvního řádku nepřečte. */
  datumOkna: string | null;
  /** Kolik řádků výřez obsahuje. */
  radku: number;
};

/** Víc než ~2,5° se ořez nedělá — vodorovný výřez by u šikmé fotky řezal řádky. */
const MAX_NAKLON = 0.045;

const median = (cisla: number[]) => {
  const s = [...cisla].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Výřez fotky od prvního řádku s datem `odData` (včetně) po poslední řádek se
 * zápisem. Datum platí i pro řádky pod ním, dokud se neobjeví další, takže
 * stačí najít PRVNÍ řádek s datem od zvoleného dne — všechno pod ním je v době
 * „od". Bez `odData` se bere celá tabulka od prvního řádku se zápisem.
 */
export function najdiOkno(p: PrepisTabulky, odData: string | null): VysledekOkna {
  const radky = p.radky.filter((r) => r.maData);
  const data = [...new Set(radky.map((r) => r.datum).filter((d): d is string => !!d))].sort();
  const bez = (duvod: VysledekOkna["duvod"]): VysledekOkna => ({ okno: null, duvod, data, datumOkna: null, radku: 0 });
  if (radky.length === 0) return bez("prazdna");
  if (data.length === 0) return bez("bez-dat");
  if (Math.abs(p.naklon) > MAX_NAKLON) return bez("natocena");

  const start = odData ? radky.find((r) => r.datum !== null && r.datum >= odData) : radky[0];
  if (!start) return bez("nic-od-data");
  const od = radky.indexOf(start);
  const vyrez = radky.slice(od);
  const posledni = vyrez[vyrez.length - 1];

  // Řádek je od středu k okraji buňky zhruba půl rozteče řádků.
  const rozdily = radky.slice(1).map((r, i) => r.y - radky[i].y).filter((d) => d > 0);
  const roztec = rozdily.length ? median(rozdily) : Math.max(0.01, (posledni.yDole - posledni.yHore) * 2);
  const rezerva = 0.1 * roztec;
  return {
    okno: {
      x0: 0,
      x1: 1,
      y0: Math.max(0, start.y - 0.5 * roztec - rezerva),
      y1: Math.min(1, posledni.y + 0.5 * roztec + rezerva),
    },
    duvod: null,
    data,
    datumOkna: start.datum,
    radku: vyrez.length,
  };
}

// ── Čtení buněk (AI) ────────────────────────────────────────────────────

/**
 * Pokyn pro AI. `vyrez` = obrázek je jen výřez řádků (záhlaví sloupců na něm
 * není); jinak je to celá fotka a ke čtení se omezí podle `odData`.
 */
export function promptTabulky(opts: { vyrez: boolean; odData?: string | null }): string {
  const omezeni = !opts.vyrez && opts.odData
    ? `\nČTI JEN řádky od prvního řádku, který má v buňce Datum datum ${opts.odData} nebo POZDĚJŠÍ, až po poslední řádek, který má nějaké číslo. Řádky nad ním vůbec nevracej.`
    : "";
  return `Na obrázku je ${opts.vyrez ? "VÝŘEZ ŘÁDKŮ" : "část"} EXCELOVÉ TABULKY „Zápis stáčení lahví" pivovaru. Záhlaví sloupců na fotce většinou NENÍ vidět.
Sloupce zleva doprava:
 0. číslo řádku excelu (tmavý sloupec s bílými čísly; může chybět),
 1. Datum (např. 13.10.2026) — vyplněné JEN na prvním řádku dne, na dalších řádcích je buňka PRÁZDNÁ,
 2. Pivo (název, např. „12 Světlá", „Desítka", „11° sv.ležák", „12 Tmavá", „Jantar"; buňka může být prázdná),
 pak blok SUDŮ — 5 úzkých sloupců = kolik sudů daného objemu se spotřebovalo: 50 l, 30 l, 20 l, 15 l, 10 l (v tomto pořadí),
 pak tlustá svislá čára a blok LAHVÍ — 4 úzké sloupce = kolik kusů se stočilo: PET 1,5 l, PET 1 l, lahev 0,5 l, lahev 0,33 l (v tomto pořadí),
 pak tlustá čára a vpravo dopočítané sloupce (Spotřeba, Stočeno, Výtrata) — ty NEČTI.
Číslo patří do sloupce podle toho, ve které úzké buňce mřížky stojí (čísla jsou zarovnaná doprava). Prázdná buňka = nic nevracej. Sloupce počítej od tlusté čáry: první sloupec za ní je PET 1,5 l; sloupce sudů počítej od levé tlusté čáry: první úzký sloupec je 50 l.${omezeni}
Datum a pivo opiš z buňky TOHOTO řádku. Je-li buňka prázdná, vrať null — NEDOPLŇUJ ji z řádku nad tím, to dělá aplikace. Řádek bez jediného čísla nevracej (kromě řádku s vyplněným datem).
Vrať JSON: {"radky":[{"radek":555,"datum":"2026-10-13" nebo null,"pivo":"12 Světlá" nebo null,"sudy":{"50":1},"lahve":{"1.5":11,"0.5":20,"0.33":60}}]}
„radek" je číslo řádku excelu z tmavého sloupce vlevo (null, když ho nevidíš). Klíče v "sudy" jsou objemy v litrech (50, 30, 20, 15, 10), klíče v "lahve" objemy (1.5, 1, 0.5, 0.33); hodnoty jsou celá čísla z buněk. Čísla čti PŘESNĚ, nic nepočítej a nedomýšlej.`;
}

/** Řádek tak, jak ho vrátila AI (ještě bez kontroly). */
export type SurovyRadek = {
  radek: number | null;
  datum: string | null;
  pivo: string | null;
  sudy: unknown;
  lahve: unknown;
};

/** Odpověď AI → řádky. Snese ohrádky ```json, obálku { tabulka: … } i holé pole. */
export function parsujOdpovedAi(text: string): SurovyRadek[] | null {
  let t = (text ?? "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const zacatek = Math.min(...["{", "["].map((z) => t.indexOf(z)).filter((i) => i >= 0), Infinity);
  if (!Number.isFinite(zacatek)) return null;
  const konec = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (konec <= zacatek) return null;
  // deno-lint-ignore no-explicit-any
  let data: any;
  try { data = JSON.parse(t.slice(zacatek, konec + 1)); } catch { return null; }
  const pole = Array.isArray(data) ? data : data?.radky ?? data?.tabulka?.radky ?? data?.items;
  if (!Array.isArray(pole)) return null;
  const text0 = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === "" || /^(null|none|-|—|n\/a)$/i.test(s) ? null : s;
  };
  // deno-lint-ignore no-explicit-any
  return pole.filter((r: any) => r && typeof r === "object").map((r: any) => ({
    radek: Number.isFinite(Number(r.radek)) && r.radek !== null && r.radek !== "" ? Number(r.radek) : null,
    datum: text0(r.datum),
    pivo: text0(r.pivo),
    sudy: r.sudy ?? null,
    lahve: r.lahve ?? null,
  }));
}

/** „50", „50 l", „1,5", „0.33l" → číslo v litrech; null, když to není objem. */
function objemZKlice(klic: string): number | null {
  const n = Number(String(klic).trim().toLowerCase().replace(/\s*l(itr[ůu]?)?\.?$/, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const stejnyObjem = (a: number, b: number) => Math.abs(a - b) < 0.001;

/**
 * Buňky ze slovníku {objem: počet} (nebo pole {objem, ks}). Počet musí být
 * celé číslo od 1; cokoli jiného se zahodí a ohlásí. Objem, který patří do
 * druhého bloku (1,5 mezi sudy), se přesune do správného a ohlásí.
 */
function bunky(
  zdroj: unknown,
  druh: "sudy" | "lahve",
  varovani: string[],
): { sudy: Bunka[]; lahve: Bunka[] } {
  const ven = { sudy: [] as Bunka[], lahve: [] as Bunka[] };
  if (zdroj === null || zdroj === undefined) return ven;
  const dvojice: [unknown, unknown][] = Array.isArray(zdroj)
    // deno-lint-ignore no-explicit-any
    ? zdroj.map((z: any) => [z?.objem ?? z?.objemL ?? z?.l, z?.ks ?? z?.pocet ?? z?.hodnota])
    : typeof zdroj === "object" ? Object.entries(zdroj as Record<string, unknown>) : [];
  for (const [klic, hodnota] of dvojice) {
    const objem = objemZKlice(String(klic));
    const jmeno = druh === "sudy" ? "sudů" : "lahví";
    if (objem === null) { varovani.push(`Sloupec „${klic}" mezi ${jmeno} nejde přečíst.`); continue; }
    const doSudu = OBJEMY_SUDU.some((o) => stejnyObjem(o, objem));
    const doLahvi = OBJEMY_LAHVI.some((o) => stejnyObjem(o, objem));
    if (!doSudu && !doLahvi) { varovani.push(`Sloupec ${objem} l neznám — nepřidal jsem ho.`); continue; }
    const cil: "sudy" | "lahve" = doSudu ? "sudy" : "lahve";
    if (cil !== druh) varovani.push(`Sloupec ${objem} l patří mezi ${cil === "sudy" ? "sudy" : "lahve"}, AI ho dala mezi ${jmeno} — přesunul jsem ho.`);
    const ks = typeof hodnota === "number" ? hodnota : Number(String(hodnota ?? "").trim().replace(",", "."));
    if (hodnota === null || hodnota === undefined || String(hodnota).trim() === "" || ks === 0) continue; // prázdná buňka
    if (!Number.isInteger(ks) || ks < 0 || ks > 9999) { varovani.push(`Počet „${hodnota}" ve sloupci ${objem} l není celé číslo — vynechal jsem ho.`); continue; }
    const jiz = ven[cil].find((b) => stejnyObjem(b.objemL, objem));
    if (jiz) { varovani.push(`Sloupec ${objem} l je na řádku dvakrát — vzal jsem první hodnotu.`); continue; }
    ven[cil].push({ objemL: objem, ks });
  }
  const podleObjemu = (a: Bunka, b: Bunka) => b.objemL - a.objemL;
  ven.sudy.sort(podleObjemu);
  ven.lahve.sort(podleObjemu);
  return ven;
}

// ── Výtrata ─────────────────────────────────────────────────────────────

/** Litry v sudech (zdroj), litry v lahvích a výtrata v % (null, když není sud nebo lahve). */
export function bilance(sudy: Bunka[], lahve: Bunka[]): { zdrojL: number; stoceneL: number; vytrataProc: number | null } {
  const litry = (b: Bunka[]) => Math.round(b.reduce((s, x) => s + x.objemL * x.ks, 0) * 100) / 100;
  const zdrojL = litry(sudy);
  const stoceneL = litry(lahve);
  const vytrataProc = zdrojL > 0 && stoceneL > 0 ? Math.round((1 - stoceneL / zdrojL) * 1000) / 10 : null;
  return { zdrojL, stoceneL, vytrataProc };
}

/** Výtrata při lahvování bývá 5–13 %; mimo −2 % až 25 % je skoro jistě špatně přečtené číslo nebo posunutý sloupec. */
const VYTRATA_MIN = -2;
const VYTRATA_MAX = 25;

// ── Poskládání řádků ────────────────────────────────────────────────────

export type VstupSestaveni = {
  radky: SurovyRadek[];
  piva: { id: string; name: string; degree?: string | null; short_name?: string | null }[];
  /** Jen řádky od tohoto dne (ISO). */
  odData?: string | null;
  /** Datum prvního řádku výřezu (z najdiOkno). */
  datumOkna?: string | null;
  /** Přepis výřezu (Vision) — kontrola čísel a dat. */
  prepis?: PrepisTabulky | null;
};

export type VysledekTabulky = {
  radky: RadekTabulky[];
  dny: DenTabulky[];
  varovani: string[];
  /** Kolik řádků se vynechalo, protože jsou před zvoleným dnem. */
  vynechano: number;
  /** Kolik řádků se vynechalo, protože nemají datum (patří k datu nad fotkou). */
  bezData: number;
};

/** Ke každému řádku od AI řádek z přepisu: podle čísla řádku excelu, jinak podle pořadí, když jich je stejně. */
function sparujSPrepisem(radky: SurovyRadek[], prepis: PrepisTabulky | null | undefined): (OcrRadek | null)[] {
  if (!prepis || prepis.radky.length === 0) return radky.map(() => null);
  const ocr = prepis.radky.filter((r) => r.maData);
  const sCislem = radky.filter((r) => r.radek !== null).length;
  if (sCislem >= Math.ceil(radky.length * 0.6) && ocr.some((r) => r.cislo !== null)) {
    const podleCisla = new Map(ocr.filter((r) => r.cislo !== null).map((r) => [r.cislo as number, r]));
    return radky.map((r) => (r.radek !== null ? podleCisla.get(r.radek) ?? null : null));
  }
  return ocr.length === radky.length ? radky.map((_, i) => ocr[i]) : radky.map(() => null);
}

/**
 * Z řádků od AI poskládá výsledek: buňky podle sloupců, datum dědí z řádku
 * nad tím, vynechá řádky před `odData`, spáruje pivo s katalogem a ke každému
 * řádku přidá varování (čísla proti přepisu, výtrata, data).
 */
export function sestavRadky(vstup: VstupSestaveni): VysledekTabulky {
  const varovani: string[] = [];
  const radky: RadekTabulky[] = [];
  const odData = vstup.odData || null;
  const sparene = sparujSPrepisem(vstup.radky, vstup.prepis);
  const ocrData = new Set((vstup.prepis?.radky ?? []).map((r) => r.datum).filter((d): d is string => !!d));
  const bezAlias = { beer: new Map<string, string>(), package: new Map<string, string>() };

  let posledniDatum: string | null = null;
  let vynechano = 0;
  let bezData = 0;

  vstup.radky.forEach((surovy, i) => {
    const rVarovani: string[] = [];
    const ocr = sparene[i];

    // Datum buňky: AI, a když ho nepřečetla, ale přepis ho u téhož řádku vidí, přepis
    // (jinak by celý den zdědil datum z předchozího).
    let datumVBunce = datumZTextu(surovy.datum);
    if (surovy.datum && !datumVBunce) rVarovani.push(`Datum „${surovy.datum}" nejde přečíst.`);
    if (!datumVBunce && ocr?.datum) {
      datumVBunce = ocr.datum;
      rVarovani.push(`Datum ${datumCesky(ocr.datum)} doplněno z přepisu fotky (AI ho u tohohle řádku nepřečetla).`);
    } else if (datumVBunce && ocr?.datum && ocr.datum !== datumVBunce) {
      rVarovani.push(`Datum ${datumCesky(datumVBunce)} nesedí s přepisem fotky (${datumCesky(ocr.datum)}) — zkontroluj.`);
    } else if (datumVBunce && ocr && !ocr.datum && ocrData.size > 0 && !ocrData.has(datumVBunce)) {
      rVarovani.push(`Datum ${datumCesky(datumVBunce)} přepis fotky nenašel — zkontroluj.`);
    }
    if (datumVBunce && posledniDatum && datumVBunce < posledniDatum) {
      rVarovani.push(`Datum ${datumCesky(datumVBunce)} je dřívější než předchozí řádek (${datumCesky(posledniDatum)}) — zkontroluj.`);
    }

    let datum = datumVBunce;
    if (datum) {
      posledniDatum = datum;
    } else if (posledniDatum) {
      datum = posledniDatum;
    } else if (i === 0 && vstup.datumOkna) {
      // Výřez začíná řádkem s datem; kdyby ho AI nepřečetla, je to datum výřezu.
      datum = vstup.datumOkna;
      posledniDatum = datum;
    }

    const sudy: Bunka[] = [];
    const lahve: Bunka[] = [];
    const zSudu = bunky(surovy.sudy, "sudy", rVarovani);
    const zLahvi = bunky(surovy.lahve, "lahve", rVarovani);
    sudy.push(...zSudu.sudy, ...zLahvi.sudy);
    lahve.push(...zSudu.lahve, ...zLahvi.lahve);
    sudy.sort((a, b) => b.objemL - a.objemL);
    lahve.sort((a, b) => b.objemL - a.objemL);

    // Řádek bez jediného čísla se nevrací (jen jeho datum se už započetlo výš).
    if (sudy.length === 0 && lahve.length === 0) return;

    // Před zvoleným dnem / bez data se řádek vynechá.
    if (odData) {
      if (datum === null) { bezData++; return; }
      if (datum < odData) { vynechano++; return; }
    }

    // Čísla proti přepisu fotky: každé číslo z buněk musí být mezi čísly téhož
    // řádku v přepisu. Jen u zřetelného písma, a jedničky se nekontrolují — OCR
    // tenkou jedničku v osamocené buňce často vynechá.
    if (ocr && ocr.cisla.length > 0 && (vstup.prepis?.pismo ?? 0) >= SPOLEHLIVE_PISMO_PX) {
      const zbyva = [...ocr.cisla];
      const chybi: number[] = [];
      for (const ks of [...sudy, ...lahve].map((b) => b.ks).filter((ks) => ks > 1)) {
        const k = zbyva.indexOf(ks);
        if (k >= 0) zbyva.splice(k, 1);
        else chybi.push(ks);
      }
      if (chybi.length > 0) {
        rVarovani.push(`Číslo ${chybi.join(", ")} přepis fotky u tohohle řádku nevidí (vidí: ${ocr.cisla.join(", ")}) — zkontroluj podle fotky.`);
      }
    }

    // Výtrata: litry v lahvích proti litrům sudu.
    const b = bilance(sudy, lahve);
    if (b.vytrataProc !== null && (b.vytrataProc < VYTRATA_MIN || b.vytrataProc > VYTRATA_MAX)) {
      const popis = b.vytrataProc < VYTRATA_MIN
        ? `Stočeno ${b.stoceneL} l z ${b.zdrojL} l ze sudů — víc, než v sudech bylo`
        : `Stočeno ${b.stoceneL} l z ${b.zdrojL} l ze sudů — výtrata ${b.vytrataProc} % je moc velká`;
      rVarovani.push(`${popis}. Zkontroluj čísla a sloupce (nejčastěji posunutý sloupec).`);
    }

    const pivo = surovy.pivo;
    radky.push({
      cislo: surovy.radek,
      datumVBunce,
      datum,
      pivo,
      pivoId: pivo ? matchBeerId({ raw_line: pivo, beer_name: pivo, degree: null }, vstup.piva, bezAlias) : null,
      sudy,
      lahve,
      varovani: rVarovani,
    });
  });

  if (bezData > 0) {
    varovani.push(`Nahoře na fotce ${bezData === 1 ? "je 1 řádek" : bezData < 5 ? `jsou ${bezData} řádky` : `je ${bezData} řádků`} bez data — patří k datu, které je nad fotkou, a nevím, jestli je od ${datumCesky(odData)}. Nečetl jsem ${bezData === 1 ? "ho" : "je"}.`);
  }

  // Kolik řádků je v kterém dni (nejdřív řádky bez data, pak vzestupně).
  const poctyDnu = new Map<string | null, number>();
  for (const r of radky) poctyDnu.set(r.datum, (poctyDnu.get(r.datum) ?? 0) + 1);
  const dny: DenTabulky[] = [...poctyDnu.entries()]
    .map(([datum, radku]) => ({ datum, radku }))
    .sort((a, b) => (a.datum === null ? -1 : b.datum === null ? 1 : a.datum.localeCompare(b.datum)));

  return { radky, dny, varovani, vynechano, bezData };
}
