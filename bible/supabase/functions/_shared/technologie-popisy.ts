// 🏭 Technologie pivovaru (etapa 7) — druhy zařízení, zdroje parametrů,
// šablony parametrů a text profilu pro Clauda. Bez závislostí: sdílí je appka
// (formulář), bible-api (kontrola vstupu) i konektor bible-mcp.
//
// Architektura § 8: „AI odliší obecné znalosti od parametrů konkrétního
// provozu" — proto má každý parametr ZDROJ a text pro Clauda ho říká.

export const DRUHY_ZARIZENI = [
  { id: 'varna', nazev: 'Varna', mnozne: 'Varna' },
  { id: 'nadoba_varny', nazev: 'Nádoba varny', mnozne: 'Nádoby varny' },
  { id: 'tank_kvasny', nazev: 'Kvasný tank / spilka', mnozne: 'Kvasné tanky a spilky' },
  { id: 'tank_lezacky', nazev: 'Ležácký tank', mnozne: 'Ležácké tanky' },
  { id: 'tank_jiny', nazev: 'Jiný tank', mnozne: 'Jiné tanky' },
  { id: 'cerpadlo', nazev: 'Čerpadlo', mnozne: 'Čerpadla' },
  { id: 'potrubi', nazev: 'Potrubí a ventily', mnozne: 'Potrubí a ventily' },
  { id: 'vymenik', nazev: 'Výměník tepla', mnozne: 'Výměníky tepla' },
  { id: 'chlazeni', nazev: 'Chlazení', mnozne: 'Chlazení' },
  { id: 'filtr', nazev: 'Filtrace', mnozne: 'Filtrace' },
  { id: 'staceni', nazev: 'Stáčení', mnozne: 'Stáčení' },
  { id: 'cip', nazev: 'CIP a sanitace', mnozne: 'CIP a sanitace' },
  { id: 'jine', nazev: 'Jiné zařízení', mnozne: 'Jiná zařízení' },
] as const;

export type DruhZarizeni = (typeof DRUHY_ZARIZENI)[number]['id'];

export const ZDROJE_PARAMETRU = [
  { id: 'stitek', nazev: 'štítek zařízení' },
  { id: 'dokumentace', nazev: 'dokumentace výrobce' },
  { id: 'zmereno', nazev: 'změřeno' },
  { id: 'sklep', nazev: 'ze Sklepa v appce' },
  { id: 'odhad', nazev: 'odhad' },
] as const;

export type ZdrojParametru = (typeof ZDROJE_PARAMETRU)[number]['id'];

export type Parametr = { nazev: string; hodnota?: number; text?: string; jednotka?: string; zdroj: ZdrojParametru };

/** Předvyplněné parametry podle druhu (jen názvy a jednotky — hodnotu zadá člověk). */
export const SABLONY_PARAMETRU: Record<DruhZarizeni, { nazev: string; jednotka?: string; text?: true }[]> = {
  varna: [{ nazev: 'Objem várky (vyrážená mladina)', jednotka: 'hl' }, { nazev: 'Počet nádob', jednotka: 'ks' }, { nazev: 'Ohřev', text: true }, { nazev: 'Rmutování', text: true }],
  nadoba_varny: [{ nazev: 'Objem užitný', jednotka: 'hl' }, { nazev: 'Ohřev', text: true }, { nazev: 'Míchadlo', text: true }],
  tank_kvasny: [{ nazev: 'Objem užitný', jednotka: 'hl' }, { nazev: 'Max. přetlak', jednotka: 'bar' }, { nazev: 'Chlazení', text: true }, { nazev: 'Materiál', text: true }],
  tank_lezacky: [{ nazev: 'Objem užitný', jednotka: 'hl' }, { nazev: 'Max. přetlak', jednotka: 'bar' }, { nazev: 'Chlazení', text: true }, { nazev: 'Materiál', text: true }],
  tank_jiny: [{ nazev: 'Objem užitný', jednotka: 'hl' }, { nazev: 'Účel', text: true }],
  cerpadlo: [{ nazev: 'Průtok', jednotka: 'm³/h' }, { nazev: 'Dopravní výška', jednotka: 'm' }, { nazev: 'Příkon motoru', jednotka: 'kW' }, { nazev: 'Typ', text: true }],
  potrubi: [{ nazev: 'Vnitřní průměr', jednotka: 'mm' }, { nazev: 'Délka', jednotka: 'm' }, { nazev: 'Materiál', text: true }, { nazev: 'Ventily a armatury', text: true }],
  vymenik: [{ nazev: 'Výkon', jednotka: 'kW' }, { nazev: 'Plocha', jednotka: 'm²' }, { nazev: 'Počet desek', jednotka: 'ks' }, { nazev: 'Médium (chladí čím)', text: true }],
  chlazeni: [{ nazev: 'Chladicí výkon', jednotka: 'kW' }, { nazev: 'Teplota média', jednotka: '°C' }, { nazev: 'Médium', text: true }],
  filtr: [{ nazev: 'Výkon', jednotka: 'hl/h' }, { nazev: 'Typ (křemelina, desky, svíčky…)', text: true }],
  staceni: [{ nazev: 'Výkon', jednotka: 'ks/h' }, { nazev: 'Obaly', text: true }],
  cip: [{ nazev: 'Objem nádrže louhu', jednotka: 'L' }, { nazev: 'Objem nádrže kyseliny', jednotka: 'L' }, { nazev: 'Okruhy', text: true }],
  jine: [],
};

export const nazevDruhu = (druh: string): string => DRUHY_ZARIZENI.find((d) => d.id === druh)?.nazev ?? druh;
export const nazevZdroje = (zdroj: string): string => ZDROJE_PARAMETRU.find((z) => z.id === zdroj)?.nazev ?? zdroj;

/** Hodnota parametru pro člověka: „80 hl", „nerez 1.4301". */
export function hodnotaParametru(p: Parametr): string {
  const cislo = typeof p.hodnota === 'number' ? String(p.hodnota).replace('.', ',') : '';
  const sJednotkou = cislo ? `${cislo}${p.jednotka ? ` ${p.jednotka}` : ''}` : '';
  return [sJednotkou, p.text ?? ''].filter(Boolean).join(' — ');
}

export type ProfilPivovaru = {
  pivovary: { id: string; nazev: string; popis: string | null; hlavni: boolean }[];
  pivovar_id: string | null;
  zarizeni: { id: string; druh: string; nazev: string; pocet: number; parametry: Parametr[]; poznamka: string | null }[];
  postupy: { id: string; nazev: string; oblast: string | null; kroky: string; zdroj: string | null }[];
};

/**
 * Profil pivovaru jako text pro Clauda (nástroj profil_pivovaru). Výslovně
 * odděluje parametry provozu od literatury a u každého parametru říká zdroj.
 */
export function technologieText(p: ProfilPivovaru): string {
  if (p.pivovary.length === 0 || !p.pivovar_id) {
    return 'Profil pivovaru zatím není vyplněný (v appce: Pivovarská bible → Technologie pivovaru). Parametry provozu tedy nemám — '
      + 'u obecných rad to řekni a nedomýšlej objemy ani výkony zařízení.';
  }
  const pivovar = p.pivovary.find((x) => x.id === p.pivovar_id);
  const radky: string[] = [
    `# ${pivovar?.nazev ?? 'Pivovar'} — parametry provozu`,
    'Tohle jsou údaje KONKRÉTNÍHO PROVOZU zapsané v appce, ne literatura. V odpovědi je odděl od obecných znalostí z knih a u čísla řekni zdroj (štítek, dokumentace, změřeno, odhad). Co tu chybí, provoz nemá zapsané — nedomýšlej.',
  ];
  if (p.pivovary.length > 1) {
    radky.push(`Další pivovary v bibli: ${p.pivovary.filter((x) => x.id !== p.pivovar_id).map((x) => `${x.nazev} (pivovar_id=${x.id})`).join(', ')}.`);
  }
  if (pivovar?.popis) radky.push('', `Popis provozu: ${pivovar.popis}`);
  if (p.zarizeni.length === 0) {
    radky.push('', 'Zařízení zatím není zapsané.');
  } else {
    for (const druh of DRUHY_ZARIZENI) {
      const toho = p.zarizeni.filter((z) => z.druh === druh.id);
      if (toho.length === 0) continue;
      radky.push('', `## ${druh.mnozne}`);
      for (const z of toho) {
        radky.push(`- ${z.nazev}${z.pocet > 1 ? ` (${z.pocet} ks)` : ''}`);
        for (const par of z.parametry ?? []) radky.push(`  - ${par.nazev}: ${hodnotaParametru(par)} [zdroj: ${nazevZdroje(par.zdroj)}]`);
        if (z.poznamka) radky.push(`  - Poznámka: ${z.poznamka}`);
      }
    }
  }
  if (p.postupy.length > 0) {
    radky.push('', '## Provozní postupy');
    for (const s of p.postupy) {
      radky.push(`### ${s.nazev}${s.oblast ? ` (oblast ${s.oblast})` : ''}${s.zdroj ? ` — zdroj: ${s.zdroj}` : ''}`, s.kroky);
    }
  }
  return radky.join('\n');
}
