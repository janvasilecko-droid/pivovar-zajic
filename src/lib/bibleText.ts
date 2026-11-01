// 📖 Text listu knihy → bloky pro čtečku (nadpisy, odstavce, tabulky, vzorce).
// ---------------------------------------------------------------------------
// Přepis skenu (Claude) a převod DOCX/EPUB/XLSX/CSV dávají jednoduchý markdown
// podle promptu workeru (scripts/bible/ocr.py): „# nadpis", „## podkapitola",
// tabulka ze svislých čar s oddělovacím řádkem, vzorec v LaTeXu mezi $$ a $$
// na samostatném řádku, ve větě mezi $ a $, a [nečitelné]. Textová vrstva PDF
// je syrový text — znaky „|", „#" a „$" v ní platí doslova, proto se nerozebírá.
//
// Výsledek jsou data, ne HTML: čtečka z nich skládá React elementy, žádné
// innerHTML (text knihy může obsahovat cokoli). Vzorce zatím ukazuje jako
// LaTeX v neproporcionálním písmu — poctivě a bez knihovny navíc.

export type ZdrojTextu = 'vrstva' | 'ocr' | 'soubor';

export type CastTextu =
  | { typ: 'text'; text: string }
  | { typ: 'vzorec'; tex: string }
  | { typ: 'necitelne' };

export type BlokTextu =
  | { typ: 'nadpis'; uroven: 1 | 2 | 3; casti: CastTextu[] }
  | { typ: 'odstavec'; casti: CastTextu[] }
  | { typ: 'tabulka'; hlavicka: string[]; radky: string[][] }
  | { typ: 'vzorec'; tex: string }
  | { typ: 'prosty'; text: string };

/** Oddělovací řádek tabulky — stejný vzor jako _ODDELOVAC_TABULKY ve workeru. */
const ODDELOVAC_TABULKY = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const NADPIS = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const NECITELNE = '[nečitelné]';
/**
 * Vzorec ve větě: $…$ bez mezery hned za a před dolarem (jinak „stojí $5 a $10"
 * není vzorec) a bez $$ kolem. Bez lookbehindu — starší Safari by kus appky
 * vůbec nenačetl; dolar těsně před se kontroluje v cyklu.
 */
const VZOREC_VE_VETE = /\$(?!\$)([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\$)/g;

/** Buňky řádku tabulky bez krajních svislých čar. */
export function bunkyRadku(radek: string): string[] {
  let r = radek.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|') && !r.endsWith('\\|')) r = r.slice(0, -1);
  return r.split('|').map((b) => b.trim());
}

/** Text řádku → části: obyčejný text, vzorce ve větě a [nečitelné]. */
export function castiRadku(text: string): CastTextu[] {
  const casti: CastTextu[] = [];
  const pridejText = (t: string) => {
    if (!t) return;
    const kusy = t.split(NECITELNE);
    kusy.forEach((kus, i) => {
      if (i > 0) casti.push({ typ: 'necitelne' });
      if (!kus) return;
      const posledni = casti[casti.length - 1];
      if (posledni?.typ === 'text') posledni.text += kus;
      else casti.push({ typ: 'text', text: kus });
    });
  };
  let od = 0;
  for (const m of text.matchAll(VZOREC_VE_VETE)) {
    const i = m.index ?? 0;
    if (i > 0 && text[i - 1] === '$') continue;
    pridejText(text.slice(od, i));
    casti.push({ typ: 'vzorec', tex: m[1] });
    od = i + m[0].length;
  }
  pridejText(text.slice(od));
  return casti;
}

/**
 * Text listu → bloky. Textová vrstva PDF zůstane jeden prostý blok
 * (zalomení řádků se zachová); přepis skenu a převedené soubory se rozeberou.
 */
export function rozlozText(text: string, zdroj: ZdrojTextu): BlokTextu[] {
  const cisty = (text ?? '').replace(/\r\n?/g, '\n');
  if (!cisty.trim()) return [];
  if (zdroj === 'vrstva') return [{ typ: 'prosty', text: cisty.trim() }];

  const radky = cisty.split('\n');
  const bloky: BlokTextu[] = [];
  let odstavec: string[] = [];
  const ukonciOdstavec = () => {
    if (odstavec.length) bloky.push({ typ: 'odstavec', casti: castiRadku(odstavec.join('\n')) });
    odstavec = [];
  };

  for (let i = 0; i < radky.length; i += 1) {
    const radek = radky[i];
    const orez = radek.trim();
    if (!orez) {
      ukonciOdstavec();
      continue;
    }

    // Vzorec na samostatném řádku: $$…$$ na jednom řádku, nebo přes víc řádků.
    if (orez.startsWith('$$')) {
      const zbytek = orez.slice(2);
      const konecNaRadku = zbytek.indexOf('$$');
      if (konecNaRadku >= 0) {
        const tex = zbytek.slice(0, konecNaRadku).trim();
        const za = zbytek.slice(konecNaRadku + 2).trim();
        if (tex) {
          ukonciOdstavec();
          bloky.push({ typ: 'vzorec', tex });
          if (za) odstavec.push(za);
          continue;
        }
      } else {
        let konec = -1;
        for (let j = i + 1; j < radky.length; j += 1) {
          if (radky[j].includes('$$')) { konec = j; break; }
        }
        if (konec >= 0) {
          const posledni = radky[konec];
          const kz = posledni.indexOf('$$');
          const tex = [zbytek, ...radky.slice(i + 1, konec), posledni.slice(0, kz)].join('\n').trim();
          const za = posledni.slice(kz + 2).trim();
          if (tex) {
            ukonciOdstavec();
            bloky.push({ typ: 'vzorec', tex });
            if (za) odstavec.push(za);
            i = konec;
            continue;
          }
        }
      }
      // Neuzavřený nebo prázdný vzorec: řádek zůstane textem, nic se neztratí.
    }

    const nadpis = NADPIS.exec(orez);
    if (nadpis) {
      ukonciOdstavec();
      const uroven = Math.min(3, nadpis[1].length) as 1 | 2 | 3;
      bloky.push({ typ: 'nadpis', uroven, casti: castiRadku(nadpis[2]) });
      continue;
    }

    if (orez.startsWith('|') && i + 1 < radky.length && ODDELOVAC_TABULKY.test(radky[i + 1].trim())) {
      ukonciOdstavec();
      const hlavicka = bunkyRadku(orez);
      const telo: string[][] = [];
      let j = i + 2;
      while (j < radky.length && radky[j].trim().startsWith('|')) {
        telo.push(bunkyRadku(radky[j]));
        j += 1;
      }
      const sirka = Math.max(hlavicka.length, ...telo.map((r) => r.length));
      const dopln = (r: string[]) => (r.length < sirka ? [...r, ...Array(sirka - r.length).fill('')] : r);
      bloky.push({ typ: 'tabulka', hlavicka: dopln(hlavicka), radky: telo.map(dopln) });
      i = j - 1;
      continue;
    }

    odstavec.push(radek.trimEnd());
  }
  ukonciOdstavec();
  return bloky;
}
