// 🧾 Uzávěrka z pokladny: čtení z přepisu Google Vision po ŘÁDCÍCH.
// ---------------------------------------------------------------------------
// 14. 10. 2026, majitel: „Špatně to čte, ta 30ka je jen 1×." Uzávěrka se do té
// doby četla jen umělou inteligencí přímo z fotky — a ta kódy a čísla občas
// domýšlí: u účtenky 2/2873 přečetla kód 10242 jako 11024 a „1 × 1455" jako
// „3 × 1360 = 4080". Součet řádků pak nesedí a obsluha hledá, kde je chyba.
//
// Google Vision tutéž fotku přečte bez jediné chyby v číslech. Má jen jednu
// vadu: text vrací po odstavcích a u fotky pod úhlem se pořadí rozhází — u
// řádku 10242 šlo „1 x" před názvem a částka až za dalším zbožím, u řádků
// 11146–11148 se do toho přimíchal text druhé účtenky, která leží za první.
//
// Proto se řádky účtenky skládají podle POLOHY slov: zjistí se úhel písma,
// slova se otočí do vodorovné polohy a ta, která leží ve stejné výšce, tvoří
// jeden řádek. Účtenka má na každou položku dva řádky — „KÓD A NÁZEV" a pod
// ním „MNOŽSTVÍ x CENA = ČÁSTKA" — takže se čte přímo, bez hádání. Čísla se
// pak zkontrolují proti sobě (uzaverka.ts, zkontrolujUzaverku: množství × cena
// = částka u každého řádku, součet částek = Celkem). Co nesedí, se nezapíše
// a čte to AI jako záloha — s tímto přepisem po ruce a s kontrolou, že žádné
// její číslo na účtence není vymyšlené (zkontrolujProtiPrepisu).
//
// Soubor je čistý (bez Dena a bez Reactu), aby šel testovat a používat
// v edge funkci parse-uzaverka-image.

import {
  cislo,
  datumCasZTextu,
  uzaverkaZTextu,
  zkontrolujUzaverku,
  type PrectenaUzaverka,
  type ProblemUzaverky,
  type RadekUzaverky,
} from "./uzaverka.ts";

/** Slovo z přepisu: text a čtyři rohy (levý horní, pravý horní, pravý dolní, levý dolní — vzhledem k písmu). */
export type SlovoOcr = { t: string; v: { x: number; y: number }[] };

/** Jeden řádek účtenky složený podle polohy slov. */
export type RadekOcr = {
  text: string;
  /** Výška řádku v otočených souřadnicích (jen pro pořadí a ladění). */
  y: number;
  slova: { t: string; l: number; r: number }[];
};

/** Slova z odpovědi Google Vision (DOCUMENT_TEXT_DETECTION) i s polohou. Slovo bez polohy vypadne. */
// deno-lint-ignore no-explicit-any
export function slovaZVision(data: any): SlovoOcr[] {
  const slova: SlovoOcr[] = [];
  const stranky = data?.responses?.[0]?.fullTextAnnotation?.pages;
  if (!Array.isArray(stranky)) return slova;
  for (const stranka of stranky) {
    for (const blok of stranka?.blocks ?? []) {
      for (const odstavec of blok?.paragraphs ?? []) {
        for (const w of odstavec?.words ?? []) {
          // deno-lint-ignore no-explicit-any
          const t = (w?.symbols ?? []).map((s: any) => s?.text ?? "").join("").trim();
          const v = w?.boundingBox?.vertices;
          if (!t || !Array.isArray(v) || v.length < 4) continue;
          // Vision vynechává souřadnici, která je 0.
          // deno-lint-ignore no-explicit-any
          slova.push({ t, v: v.slice(0, 4).map((p: any) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 })) });
        }
      }
    }
  }
  return slova;
}

/** Interpunkce, která se k předchozímu slovu lepí bez mezery („Stredisko :" → „Stredisko:", „Kyn -" → „Kyn-"). */
const LEPI_ZA = /^[.,:;)!?-]+$/;
/** Znaky, ke kterým se lepí následující slovo („( ks" → „(ks", „- Pivni" → „-Pivni"). */
const LEPI_PRED = /^[(-]+$/;

/**
 * Řádky účtenky z poloh slov. Úhel písma se bere ze směru horní hrany slov
 * (delší slovo = spolehlivější směr), slova se otočí do vodorovné polohy
 * a seskupí podle výšky; v řádku jdou zleva doprava. Funguje i na fotku
 * natočenou na bok nebo vzhůru nohama (Vision vrací rohy vzhledem k písmu).
 */
export function radkyZeSlov(slova: SlovoOcr[]): RadekOcr[] {
  if (slova.length === 0) return [];

  let sx = 0;
  let sy = 0;
  for (const s of slova) {
    if (s.t.length < 3) continue;
    sx += s.v[1].x - s.v[0].x;
    sy += s.v[1].y - s.v[0].y;
  }
  const uhel = sx === 0 && sy === 0 ? 0 : Math.atan2(sy, sx);
  const cos = Math.cos(uhel);
  const sin = Math.sin(uhel);

  const body = slova.map((s) => {
    const cx = (s.v[0].x + s.v[1].x + s.v[2].x + s.v[3].x) / 4;
    const cy = (s.v[0].y + s.v[1].y + s.v[2].y + s.v[3].y) / 4;
    return {
      t: s.t,
      x: cx * cos + cy * sin,
      y: -cx * sin + cy * cos,
      w: Math.hypot(s.v[1].x - s.v[0].x, s.v[1].y - s.v[0].y),
      h: Math.hypot(s.v[3].x - s.v[0].x, s.v[3].y - s.v[0].y),
    };
  });

  const vysky = body.map((b) => b.h).filter((h) => h > 0).sort((a, b) => a - b);
  const hMed = vysky.length ? vysky[Math.floor(vysky.length / 2)] : 1;

  body.sort((a, b) => a.y - b.y);
  const skupiny: { body: typeof body; soucet: number }[] = [];
  for (const b of body) {
    const posledni = skupiny[skupiny.length - 1];
    // Mezera mezi řádky je zhruba dvojnásobek výšky písma; slova jednoho
    // řádku se od jeho průměru odchylují jen o zlomek výšky.
    if (posledni && Math.abs(b.y - posledni.soucet / posledni.body.length) < 0.55 * hMed) {
      posledni.body.push(b);
      posledni.soucet += b.y;
    } else {
      skupiny.push({ body: [b], soucet: b.y });
    }
  }

  const radky: RadekOcr[] = skupiny.map((s) => {
    const slovaRadku = s.body
      .sort((a, b) => a.x - b.x)
      .map((b) => ({ t: b.t, l: b.x - b.w / 2, r: b.x + b.w / 2 }));
    return { text: "", y: s.soucet / s.body.length, slova: slovaRadku };
  });

  oriznoutVpravo(radky, hMed);
  for (const r of radky) r.text = slozText(r.slova, hMed);
  return radky;
}

/** Odpověď Google Vision → řádky účtenky. */
// deno-lint-ignore no-explicit-any
export function radkyZVision(data: any): RadekOcr[] {
  return radkyZeSlov(slovaZVision(data));
}

function slozText(slova: RadekOcr["slova"], hMed: number): string {
  let text = "";
  slova.forEach((s, i) => {
    if (i === 0) { text = s.t; return; }
    const predchozi = slova[i - 1];
    const mezera = s.l - predchozi.r;
    const lepi = mezera < 0.6 * hMed && (LEPI_ZA.test(s.t) || LEPI_PRED.test(predchozi.t));
    text += (lepi ? "" : " ") + s.t;
  });
  return text;
}

/**
 * Za druhou účtenkou, která leží za první a trčí zpoza ní, zůstává v řádcích
 * cizí text („1536", „disko: 2"). Částky jsou zarovnané vpravo, takže jejich
 * pravý okraj dává hranu účtenky; co leží za ní, se zahodí. Bez dostatku
 * částek (pod tři) se nic neořezává.
 */
function oriznoutVpravo(radky: RadekOcr[], hMed: number): void {
  const okraje: number[] = [];
  for (const r of radky) {
    const i = r.slova.findIndex((s) => s.t === "=" || s.t.endsWith("="));
    const castka = i >= 0 ? r.slova[i + 1] : undefined;
    if (castka && /^\d[\d.,]*$/.test(castka.t)) okraje.push(castka.r);
  }
  if (okraje.length < 3) return;
  okraje.sort((a, b) => a - b);
  const hrana = okraje[Math.floor(okraje.length / 2)] + 1.5 * hMed;
  for (const r of radky) r.slova = r.slova.filter((s) => s.l <= hrana);
}

// ── Čtení řádků ─────────────────────────────────────────────────────────

/** Částka s desetinami: „140,00", „1275.00", „1 275,00". */
const CASTKA = String.raw`(?:\d{1,3}(?: \d{3})+|\d+)[.,]\d{2}`;
/** „množství x cena = částka" (částka i „=" mohou chybět — viz ctiUzaverkuZRadku). */
const RADEK_HODNOT = new RegExp(String.raw`^\s*(\d{1,4})\s*[x×X*]\s*(${CASTKA}|\d+)(?:\s*=\s*(${CASTKA})?)?`);
/** Začátek řádku hodnot — i když se zbytek špatně přečetl. */
const ZACATEK_HODNOT = /^\s*\d{1,4}\s*[x×X*]\s*\d/;
/** „KÓD A NÁZEV" — „A" je sazba daně, OCR ji někdy vynechá. */
const RADEK_ZBOZI = /^\s*(\d{1,6})\s+(?:([A-Za-z])\s+)?(\S.*)$/;
const SAMA_CASTKA = new RegExp(String.raw`^\s*(${CASTKA})\s*$`);
const CELKEM = new RegExp(String.raw`c[eé3][l1I|]k[eé]m\s*[:;.]?\s*(${CASTKA}|\d+)`, "i");

/** Co z přepisu vyšlo + řádky, které vypadaly jako zboží, ale nepodařilo se je spárovat. */
export type CteniZRadku = { uzaverka: PrectenaUzaverka; nesparovano: string[] };

/**
 * Účtenka z řádků: hlavička (číslo, středisko, vytištěno), položky po dvou
 * řádcích a „Celkem". Nic se nedomýšlí — co se nepřečetlo, je prázdné a
 * kontrola (zkontrolujUzaverku) to ohlásí.
 */
export function ctiUzaverkuZRadku(radky: RadekOcr[]): CteniZRadku {
  const polozky: RadekUzaverky[] = [];
  const nesparovano: string[] = [];
  let cisloUz: string | null = null;
  let stredisko: string | null = null;
  let vytisteno: string | null = null;
  let celkem: number | null = null;

  let cekajici: { kod: string; nazev: string } | null = null;
  /** Částka, která se vlivem náklonu fotky ocitla na vlastním řádku před řádkem hodnot. */
  let osamelaCastka: number | null = null;

  const dokonci = (m: number, cena: number | null, castka: number | null) => {
    if (!cekajici) return;
    polozky.push({
      kod: cekajici.kod,
      nazev: opravNazev(cekajici.nazev),
      mnozstvi: m,
      cena,
      celkem: castka,
    });
    cekajici = null;
    osamelaCastka = null;
  };
  const vyprazdni = () => {
    // Zboží bez řádku hodnot: ohlásí se jako položka bez množství.
    if (cekajici) dokonci(Number.NaN, null, osamelaCastka);
  };

  for (let i = 0; i < radky.length; i++) {
    const t = radky[i].text.trim();
    if (!t) continue;

    const mc = t.match(CELKEM);
    if (mc) { vyprazdni(); celkem = cislo(mc[1]); continue; }

    const mu = t.match(/uz[aá]verka\s*[:;.]?\s*(\d+)\s*\/\s*(\d+)/i);
    if (mu) { cisloUz = `${mu[1]}/${mu[2]}`; continue; }
    const ms = t.match(/st[rř]edisko\s*[:;.]?\s*(\d+)/i);
    if (ms) { stredisko = ms[1]; continue; }
    const mv = t.match(/vyti[sš]t[eě]no\s*[:;.]?\s*(.+)$/i);
    if (mv) { vytisteno = datumCasZTextu(mv[1]); continue; }

    const hodnoty = t.match(RADEK_HODNOT);
    if (hodnoty) {
      if (!cekajici) { nesparovano.push(t); continue; }
      let castka = hodnoty[3] != null ? cislo(hodnoty[3]) : null;
      if (castka == null) {
        if (osamelaCastka != null) castka = osamelaCastka;
        else {
          // Částka na samostatném řádku hned pod řádkem hodnot.
          const dalsi = radky[i + 1]?.text.trim().match(SAMA_CASTKA);
          if (dalsi) { castka = cislo(dalsi[1]); i++; }
        }
      }
      dokonci(Number(hodnoty[1]), cislo(hodnoty[2]), castka);
      continue;
    }

    const sama = t.match(SAMA_CASTKA);
    if (sama) {
      // Částka, která se kvůli náklonu dostala nad řádek hodnot svého zboží.
      if (cekajici) osamelaCastka = cislo(sama[1]);
      continue;
    }

    if (ZACATEK_HODNOT.test(t)) { nesparovano.push(t); continue; }

    const zbozi = t.match(RADEK_ZBOZI);
    if (zbozi && /[A-Za-zÀ-ž]/.test(zbozi[3])) {
      vyprazdni();
      // Řádek zboží, na kterém zůstaly i hodnoty (hodně natočená fotka).
      const spolecne = zbozi[3].match(/^(.*?)\s+(\d{1,4}\s*[x×X*]\s*\d.*)$/);
      if (spolecne && /=/.test(spolecne[2])) {
        const h = spolecne[2].match(RADEK_HODNOT);
        if (h) {
          cekajici = { kod: zbozi[1], nazev: spolecne[1] };
          dokonci(Number(h[1]), cislo(h[2]), h[3] != null ? cislo(h[3]) : null);
          continue;
        }
      }
      cekajici = { kod: zbozi[1], nazev: zbozi[3] };
    }
  }
  vyprazdni();

  return {
    uzaverka: { cislo: cisloUz, stredisko, vytisteno, celkem, radky: polozky },
    nesparovano,
  };
}

// ── Názvy ───────────────────────────────────────────────────────────────

/** Objemy, které se na účtence tisknou s „l" přečteným jako „1" („301" = 30l, „0,331" = 0,33l, „11" = 1l). */
const OBJEMY = new Set(["0,25", "0,33", "0,5", "0,75", "1", "1,5", "2", "3", "5", "10", "15", "20", "25", "30", "50"]);

/** Slova, která pokladna tiskne bez diakritiky (účtenka ji nemá vůbec). */
const SLOVNIK: Record<string, string> = {
  svetla: "světlá", svetly: "světlý", svetle: "světlé", tmava: "tmavá", tmavy: "tmavý", tmave: "tmavé",
  lezak: "ležák", jantarovy: "jantarový", jantarova: "jantarová", cyklisticka: "Cyklistička",
  vosmicka: "Vosmička", pullitr: "Půllitr", saponat: "Saponát", sprchovy: "sprchový", pivni: "Pivní",
};

/**
 * Název z účtenky srovnaný do tvaru, v jakém ho appka zná: objem s „l"
 * („301" → „30l"), stupeň s „°" („10e", „10è", „10 %" → „10°"), slova s diakritikou.
 * Pokladna názvy ořezává („12ejantarovy lez") — to se nedoplňuje.
 */
export function opravNazev(nazev: string): string {
  let t = nazev.replace(/\s+/g, " ").trim();
  // Objem: číslo zakončené jedničkou, které je ve skutečnosti „…l".
  t = t.replace(/(?<![\d,.])(\d{1,2}(?:[.,]\d{1,2})?)1(?![\d,.]|\s*[éèêëėe%])/g, (celek, zaklad: string) => {
    const objem = zaklad.replace(".", ",");
    return OBJEMY.has(objem) ? `${objem}l` : celek;
  });
  // (Stupeň „11é" se jako objem nepřevádí — hlídá to záporný náhled v regulárním výrazu výše.)
  // Stupeň: „10e", „12ė", „11é" nebo „10 %" (písmeno místo „°"), i slepené s dalším slovem.
  t = t.replace(/(?<![\d,.])(8|9|1[0-6])\s*(?:[éèêëėe]|%)(?=\s|[A-Za-zÀ-ž]|$)/g, "$1° ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/\s+([.,:;)])/g, "$1").replace(/\(\s+/g, "(");
  // Slova bez diakritiky → s diakritikou (po jednotlivých slovech, i uvnitř „Kyn-Pivni").
  t = t.replace(/[A-Za-z]+/g, (slovo) => SLOVNIK[slovo.toLowerCase()] ?? slovo);
  return t.trim();
}

// ── Kontrola proti přepisu ──────────────────────────────────────────────

/** Všechna čísla, která v přepisu účtenky vůbec jsou (celé skupiny číslic i hodnoty). */
function cislaVPrepisu(radky: RadekOcr[]): { skupiny: Set<string>; hodnoty: Set<number> } {
  const skupiny = new Set<string>();
  const hodnoty = new Set<number>();
  for (const r of radky) {
    for (const m of r.text.matchAll(/\d+(?:[ ]\d{3})*(?:[.,]\d+)?/g)) {
      const bezMezer = m[0].replace(/ /g, "");
      skupiny.add(bezMezer.split(/[.,]/)[0]);
      const n = cislo(bezMezer);
      if (n != null) hodnoty.add(n);
    }
  }
  return { skupiny, hodnoty };
}

/**
 * Čtení z AI se porovná s přepisem: kód, množství, cena i částka každého řádku
 * musí být na účtence k nalezení. Číslo, které v přepisu není, je vymyšlené
 * nebo přečtené špatně (kód 11104 místo 11000) — takové čtení má problém navíc.
 */
export function zkontrolujProtiPrepisu(u: PrectenaUzaverka, radky: RadekOcr[]): ProblemUzaverky[] {
  const problemy: ProblemUzaverky[] = [];
  if (radky.length === 0) return problemy;
  const { skupiny, hodnoty } = cislaVPrepisu(radky);
  u.radky.forEach((r, i) => {
    const kdo = r.kod ? `${r.kod} ${r.nazev}`.trim() : r.nazev || `řádek ${i + 1}`;
    const chybi: string[] = [];
    if (r.kod && !skupiny.has(r.kod)) chybi.push(`kód ${r.kod}`);
    if (Number.isFinite(r.mnozstvi) && !hodnoty.has(r.mnozstvi)) chybi.push(`množství ${r.mnozstvi}`);
    if (r.cena != null && !hodnoty.has(r.cena)) chybi.push(`cena ${r.cena}`);
    if (r.celkem != null && !hodnoty.has(r.celkem)) chybi.push(`částka ${r.celkem}`);
    if (chybi.length > 0) {
      problemy.push({ radek: i, text: `${kdo}: ${chybi.join(", ")} — v přepisu fotky se nevyskytuje, čtení z obrázku se s přepisem liší.` });
    }
  });
  return problemy;
}

// ── Výběr z více čtení ──────────────────────────────────────────────────

export type KandidatCteni = {
  uzaverka: PrectenaUzaverka;
  poskytovatel: string;
  problemy: ProblemUzaverky[];
};

/** Kandidát z přepisu i z AI: problémy účtenky (vč. shody s přepisem, jsou-li řádky). */
export function kandidatCteni(uzaverka: PrectenaUzaverka, poskytovatel: string, prepis: RadekOcr[] = []): KandidatCteni {
  const problemy = [...zkontrolujUzaverku(uzaverka).problemy];
  // Čtení z přepisu je s přepisem shodné samo o sobě; kontrola proti němu dává smysl u AI.
  if (poskytovatel !== "ocr") problemy.push(...zkontrolujProtiPrepisu(uzaverka, prepis));
  return { uzaverka, poskytovatel, problemy };
}

/** Čtení s nejméně problémy; při shodě to první (přepis z Vision je v seznamu vždy první). */
export function vyberNejlepsi(kandidati: KandidatCteni[]): KandidatCteni | null {
  let nejlepsi: KandidatCteni | null = null;
  for (const k of kandidati) {
    if (!nejlepsi || k.problemy.length < nejlepsi.problemy.length) nejlepsi = k;
  }
  return nejlepsi;
}

// ── Pro AI ──────────────────────────────────────────────────────────────

/** Přepis po řádcích (jeden řádek účtenky = jeden řádek textu) pro prompt. */
export function prepisRadku(radky: RadekOcr[]): string {
  return radky.map((r) => r.text.trim()).filter(Boolean).join("\n");
}

/** Část promptu s přepisem: čísla se berou z něj, protože OCR je u číslic spolehlivější než čtení z obrázku. */
export function sekceOcrUzaverky(prepis: string): string {
  return `

PŘEPIS FOTKY (Google Vision, srovnaný po řádcích — jeden řádek účtenky = jeden řádek přepisu):
"""
${prepis}
"""
Jak s ním pracovat:
- ČÍSLA (kódy, množství, ceny, částky, „Celkem", číslo uzávěrky) přepiš z PŘEPISU — OCR čte číslice na tištěném papíru přesněji než ty z obrázku. Číslo, které v přepisu není, do odpovědi NEDÁVEJ.
- Z fotky bereš jen to, co přepis nemá: která dvojice řádků patří k jedné položce, když se pořadí rozhodilo, a správný tvar názvu (diakritika, „l" u objemu, „°" u stupně).
- Každá položka účtenky má v přepisu řádek „KÓD A NÁZEV" a pod ním „MNOŽSTVÍ x CENA = ČÁSTKA". Do přepisu se mohl přimíchat cizí text z druhé účtenky za touto (např. „1536", „disko: 2") — ten ignoruj.`;
}

// ── Celé čtení ──────────────────────────────────────────────────────────

/** Jedna AI, která umí přečíst fotku. `sekcePrepisu` je přepis z Vision pro prompt ("" když není). */
export type ZdrojAi = { nazev: string; cti: (sekcePrepisu: string) => Promise<string> };

export type VstupCteni = {
  /** Přepis fotky přes Google Vision; null = Vision není k dispozici. Důvody selhání zapíše do `chyby`. */
  // deno-lint-ignore no-explicit-any
  vision: ((chyby: string[]) => Promise<{ data: any; poradi: string } | null>) | null;
  /** AI v pořadí, v jakém se zkouší — volají se jen když čtení z přepisu nesedí. */
  ai: ZdrojAi[];
  varovani?: (text: string) => void;
};

/**
 * Přečte uzávěrku: nejdřív z přepisu Vision po řádcích; sedí-li (součty i Celkem),
 * je hotovo a AI se nevolá. Jinak AI jednu po druhé, s přepisem po ruce — první
 * bez problémů vyhrává, jinak čtení s nejméně problémy.
 *
 * Nevolá se AI ani tehdy, když jediný problém je, že „Celkem" na fotce vůbec
 * není (výřez účtenky): řádky sedí a AI by celkovou částku nikde nenašla.
 */
export async function ctiUzaverku(vstup: VstupCteni): Promise<{ nejlepsi: KandidatCteni | null; poznamky: string[] }> {
  const kandidati: KandidatCteni[] = [];
  const poznamky: string[] = [];
  let radkyOcr: RadekOcr[] = [];

  if (vstup.vision) {
    const vision = await vstup.vision(poznamky);
    if (vision) {
      radkyOcr = radkyZVision(vision.data);
      const { uzaverka, nesparovano } = ctiUzaverkuZRadku(radkyOcr);
      if (uzaverka.radky.length > 0) {
        const k = kandidatCteni(uzaverka, "ocr", radkyOcr);
        kandidati.push(k);
        poznamky.push(`ocr: přečteno ${uzaverka.radky.length} položek, problémů ${k.problemy.length}${vision.poradi}`);
        if (nesparovano.length > 0) vstup.varovani?.(`nespárované řádky: ${nesparovano.join(" | ").slice(0, 300)}`);
      } else {
        poznamky.push(`ocr: na fotce nenašel žádné položky${vision.poradi}`);
      }
    }
  }

  const celkemNaFotce = radkyOcr.some((r) => /c[eé3][l1I|]k[eé]m/i.test(r.text));
  const hotovoZPrepisu = kandidati.length > 0 && kandidati[0].problemy.every((p) => p.chybiCelkem === true && !celkemNaFotce);

  if (!hotovoZPrepisu) {
    // AI dostane přepis k fotce: čísla bere z něj, protože ho OCR čte přesněji než obrázek.
    const sekcePrepisu = radkyOcr.length > 0 ? sekceOcrUzaverky(prepisRadku(radkyOcr)) : "";
    for (const p of vstup.ai) {
      try {
        const uzaverka = uzaverkaZTextu(await p.cti(sekcePrepisu));
        if (uzaverka.radky.length === 0) { poznamky.push(`${p.nazev}: nic nepřečetl`); continue; }
        // S přepisem po ruce AI názvy opisuje tak, jak je účtenka tiskne („svetla", „301") —
        // stejná oprava jako u čtení z přepisu (u správně napsaného názvu nic nemění).
        uzaverka.radky = uzaverka.radky.map((r) => ({ ...r, nazev: opravNazev(r.nazev) }));
        const k = kandidatCteni(uzaverka, p.nazev, radkyOcr);
        kandidati.push(k);
        if (k.problemy.length === 0) break;
      } catch (err) {
        poznamky.push(`${p.nazev}: ${err instanceof Error ? err.message : String(err)}`);
        vstup.varovani?.(poznamky[poznamky.length - 1]);
      }
    }
  }

  return { nejlepsi: vyberNejlepsi(kandidati), poznamky };
}
