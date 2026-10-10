// 🧾 Uzávěrka z pokladny obchodu („Sumář prodeje") — čtení z fotky a kontrola.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: dlaždice Obchod — uzávěrky z pokladny se čtou z fotky
// a odečítají z vlastního skladu obchodu. Účtenka vypadá takhle:
//
//   Sumar prodeje            Stredisko: 2   Uzaverka: 2/2873
//   Vytisteno: 10.10.2026 10:09
//   10241 A Pivo sud 30l 10° svetla
//            8 x   1275,00 =   10200,00
//   …
//   Celkem: 20675,00
//
// Každá položka zabírá DVA řádky: nahoře kód a název, pod tím „množství x cena
// = částka". Právě tahle účtenka umožňuje číst přesně — čísla se dají
// zkontrolovat sama proti sobě (množství × cena = částka, součet částek =
// Celkem). Čtení, které nesedí, se nezapíše a obsluha ho opraví nad fotkou.
//
// Tenhle soubor je čistý (bez Dena a bez Reactu), aby ho mohla používat edge
// funkce parse-uzaverka-image i aplikace, a dal se otestovat.

export type RadekUzaverky = {
  /** Kód zboží z pokladny — stálý, podle něj se zboží pozná příště. */
  kod: string;
  nazev: string;
  mnozstvi: number;
  cena: number | null;
  celkem: number | null;
};

export type PrectenaUzaverka = {
  /** „2/2873" — číslo uzávěrky; podle něj se pozná, že už je zapsaná. */
  cislo: string | null;
  stredisko: string | null;
  /** Kdy se uzávěrka vytiskla, lokální čas „YYYY-MM-DDTHH:MM". */
  vytisteno: string | null;
  /** „Celkem" dole na účtence. */
  celkem: number | null;
  radky: RadekUzaverky[];
};

export type ProblemUzaverky = {
  /** Index řádku (od 0), nebo null u problému celé účtenky. */
  radek: number | null;
  text: string;
  /** Počet kusů, který by vyšel z částky a ceny — nápověda, ne oprava. */
  navrzeneMnozstvi?: number;
};

/** Haléře a drobné zaokrouhlení pokladny nejsou chyba čtení. */
const TOLERANCE = 0.5;

const zaokr2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Číslo z textu nebo čísla: „1 275,00", „1275.00", „1.275,00", 1275.
 * Cokoli, čemu nejde rozumět, je null — nikdy ne tiché nula.
 */
export function cislo(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/[\s ]/g, '').replace(/kč$/i, '');
  if (!t || !/^-?[\d.,]+$/.test(t)) return null;
  const carka = t.lastIndexOf(',');
  const tecka = t.lastIndexOf('.');
  if (carka >= 0 && tecka >= 0) {
    // Oddělovač tisíců i desetin: ten, který je později, je desetinný.
    t = carka > tecka ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (carka >= 0) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** „10.10.2026 10:09" (i s různými oddělovači) → „2026-10-10T10:09". */
export function datumCasZTextu(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}${iso[4] ? `T${iso[4].padStart(2, '0')}:${iso[5]}` : ''}`;
  const cs = v.match(/(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/);
  if (!cs) return null;
  const [, d, m, r, h, min] = cs;
  const den = `${r}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return h ? `${den}T${h.padStart(2, '0')}:${min}` : den;
}

const text = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

/** Kód zboží: jen číslice a písmena, bez mezer a bez „A" (daňová sazba), které tisknou před názvem. */
export function cistyKod(v: unknown): string {
  const t = text(v) ?? '';
  return t.replace(/\s+/g, '').replace(/[^0-9A-Za-z_-]/g, '');
}

/** Odpověď modelu (nebo cokoli JSON) → pevný tvar. Chybějící věci jsou null, ne vymyšlené. */
export function normalizujUzaverku(raw: unknown): PrectenaUzaverka {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const radkyRaw = Array.isArray(o.radky) ? o.radky : Array.isArray(o.items) ? o.items : [];
  const radky: RadekUzaverky[] = [];
  for (const r of radkyRaw) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    const kod = cistyKod(x.kod ?? x.code);
    const nazev = text(x.nazev ?? x.name) ?? '';
    const mnozstvi = cislo(x.mnozstvi ?? x.quantity);
    if (!kod && !nazev && mnozstvi == null) continue;
    radky.push({
      kod,
      nazev,
      // Chybějící množství se NEdosazuje (nula by tiše zmizela) — kontrola ho ohlásí.
      mnozstvi: mnozstvi ?? Number.NaN,
      cena: cislo(x.cena ?? x.price),
      celkem: cislo(x.celkem ?? x.total),
    });
  }
  return {
    cislo: text(o.cislo ?? o.cislo_uzaverky),
    stredisko: text(o.stredisko),
    vytisteno: datumCasZTextu(o.vytisteno ?? o.datum),
    celkem: cislo(o.celkem ?? o.total),
    radky,
  };
}

/**
 * Součet částek řádků. Řádek bez částky se počítá množství × cena, když je
 * obojí; jinak 0 (a kontrola ho ohlásí zvlášť).
 */
export function souctRadku(radky: RadekUzaverky[]): number {
  let s = 0;
  for (const r of radky) {
    if (r.celkem != null) s += r.celkem;
    else if (r.cena != null && Number.isFinite(r.mnozstvi)) s += r.cena * r.mnozstvi;
  }
  return zaokr2(s);
}

/** Všechno, co na přečtené účtence nesedí. Prázdný seznam = čísla jsou sama v pořadí. */
export function zkontrolujUzaverku(u: PrectenaUzaverka): { problemy: ProblemUzaverky[]; skore: number } {
  const problemy: ProblemUzaverky[] = [];
  const videno = new Map<string, number>();

  u.radky.forEach((r, i) => {
    const kdo = r.kod ? `${r.kod} ${r.nazev}`.trim() : r.nazev || `řádek ${i + 1}`;
    if (!r.kod) problemy.push({ radek: i, text: `${kdo}: chybí kód zboží.` });
    if (!Number.isFinite(r.mnozstvi) || r.mnozstvi <= 0) {
      problemy.push({ radek: i, text: `${kdo}: množství chybí nebo není kladné.` });
    }
    if (r.kod) {
      const dalsi = videno.get(r.kod);
      if (dalsi != null) problemy.push({ radek: i, text: `${kdo}: kód ${r.kod} je na účtence dvakrát (řádek ${dalsi + 1}).` });
      else videno.set(r.kod, i);
    }
    if (r.cena == null || r.celkem == null) {
      problemy.push({ radek: i, text: `${kdo}: chybí ${r.cena == null ? 'cena' : 'částka'}.` });
    } else if (Number.isFinite(r.mnozstvi) && Math.abs(r.mnozstvi * r.cena - r.celkem) > TOLERANCE) {
      const navrh = r.cena > 0 ? r.celkem / r.cena : NaN;
      problemy.push({
        radek: i,
        text: `${kdo}: ${r.mnozstvi} × ${r.cena} = ${zaokr2(r.mnozstvi * r.cena)}, ale na účtence je ${r.celkem}.`,
        ...(Number.isInteger(navrh) && navrh > 0 ? { navrzeneMnozstvi: navrh } : {}),
      });
    }
  });

  if (u.radky.length === 0) problemy.push({ radek: null, text: 'Na účtence nejsou žádné řádky.' });

  if (u.celkem == null) {
    problemy.push({ radek: null, text: 'Chybí „Celkem" z konce účtenky.' });
  } else {
    const soucet = souctRadku(u.radky);
    if (Math.abs(soucet - u.celkem) > TOLERANCE) {
      problemy.push({
        radek: null,
        text: `Součet řádků je ${soucet}, ale na účtence je Celkem ${u.celkem} (rozdíl ${zaokr2(u.celkem - soucet)}). Chybí nebo je špatně přečtený řádek.`,
      });
    }
  }
  return { problemy, skore: problemy.length };
}

/** Odpověď modelu jako text → uzávěrka. Špatný JSON je prázdná uzávěrka, ne výjimka. */
export function uzaverkaZTextu(odpoved: string): PrectenaUzaverka {
  let t = (odpoved ?? '').trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const od = t.indexOf('{');
  const doKonce = t.lastIndexOf('}');
  if (od >= 0 && doKonce > od) t = t.slice(od, doKonce + 1);
  try {
    return normalizujUzaverku(JSON.parse(t));
  } catch {
    return normalizujUzaverku({});
  }
}

export const PROMPT_UZAVERKA = `Jsi asistent pro obchod pivovaru. Na fotce je účtenka „Sumář prodeje" (uzávěrka z pokladny). Přečti ji PŘESNĚ a vrať strukturovaná data.

JAK ÚČTENKA VYPADÁ:
- Nahoře: „Sumar prodeje", název firmy, „Stredisko: N", „Cisnik: …", „Uzaverka: N/NNNN", „Vytisteno: DD.MM.RRRR HH:MM".
- Pak seznam zboží. KAŽDÁ POLOŽKA MÁ DVA ŘÁDKY: nahoře KÓD, písmeno „A" (sazba daně — NENÍ součást kódu ani názvu) a NÁZEV; pod tím vpravo „MNOŽSTVÍ x CENA = ČÁSTKA" a částka úplně vpravo.
  Příklad: „10241 A Pivo sud 30l 10° svetla" a pod tím „8 x 1275,00 = 10200,00" → kod "10241", nazev "Pivo sud 30l 10° světlá", mnozstvi 8, cena 1275, celkem 10200.
- Dole: „Celkem: …" — součet celé účtenky.

PRAVIDLA PŘESNOSTI (důležitější než cokoli jiného):
1. Přečti VŠECHNY položky od první po poslední, v pořadí z účtenky. Žádnou nevynechej a žádnou nepřidávej.
2. Kód je číslo na začátku řádku (např. 393, 1106, 10241, 11141). Přepiš ho PŘESNĚ — podle kódu se zboží pozná příště.
3. Na účtence se malé písmeno „l" (litr) tiskne jako číslice 1 („30l" vypadá jako „301", „0,5l" jako „0,51", „PET 1l" jako „PET 11", „PET 1,5l" jako „PET 1,51", „0,33l" jako „0,331"). V názvu piš objem správně s písmenem l: „sud 30l", „sklo 0,5l", „PET 1l", „PET 1,5l", „0,33l".
4. Stupeň se tiskne jako „10è" nebo „10%" místo „10°" — piš „10°".
5. Každé číslo čti DVAKRÁT a ověř si, že množství × cena = částka. Když nesedí, čti číslice znovu (časté záměny: 1↔7, 3↔8, 5↔6, 0↔8). Do odpovědi dej to, co je OPRAVDU vytištěné.
6. Čísla piš jako čísla (bez mezer a bez „Kč"), desetinná tečka: 1275.00.
7. Datum a čas „Vytisteno" převeď na RRRR-MM-DDTHH:MM.
8. Pokud je za hlavní účtenkou vidět další, jen částečně zakrytá účtenka, ČTI JEN TU HLAVNÍ, celou viditelnou.
9. NIKDY nevymýšlej hodnoty. Co nejde přečíst, vrať jako null.

Vrať ČISTĚ JSON (bez markdownu a bez \`\`\`), přesně v tomto tvaru:
{"cislo":"2/2873","stredisko":"2","vytisteno":"2026-10-10T10:09","celkem":20675.00,"radky":[{"kod":"10241","nazev":"Pivo sud 30l 10° světlá","mnozstvi":8,"cena":1275.00,"celkem":10200.00}]}`;
