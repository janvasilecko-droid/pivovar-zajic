// Uzávěrka z pokladny: čtení z přepisu Google Vision po řádcích.
// Data jsou SKUTEČNÉ odpovědi Vision pro fotku účtenky 2/2873 (14. 10. 2026),
// ne ručně psané řádky — právě v jejich pořadí a poloze bylo celé potíž.
import { describe, it, expect, vi } from 'vitest';
import {
  ctiUzaverku, ctiUzaverkuZRadku, kandidatCteni, opravNazev, prepisRadku, radkyZVision, radkyZeSlov, sekceOcrUzaverky,
  slovaZVision, vyberNejlepsi, zkontrolujProtiPrepisu, type ZdrojAi,
} from './uzaverka-ocr';
import { souctRadku, zkontrolujUzaverku } from './uzaverka';
import { UCTENKA_2873 } from './uzaverka.fixture';
import { VISION_UCTENKA_2873, VISION_UCTENKA_2873_VYREZ, visionOdpoved, type SlovoVision } from './uzaverka-vision.fixture';

const cela = () => visionOdpoved(VISION_UCTENKA_2873);
const vyrez = () => visionOdpoved(VISION_UCTENKA_2873_VYREZ);

/** Čísla řádku (název se čte s drobnými rozdíly — ořezaný pokladnou, bez diakritiky). */
const cisla = (r: { kod: string; mnozstvi: number; cena: number | null; celkem: number | null }) =>
  `${r.kod}|${r.mnozstvi}|${r.cena}|${r.celkem}`;
const ocekavanaCisla = UCTENKA_2873.radky.map(cisla);

/** Otočí, přiblíží a posune všechny rohy slov (jako by byla fotka jinak držená). */
function transformuj(slova: SlovoVision[], f: (x: number, y: number) => [number, number]): SlovoVision[] {
  return slova.map(([t, ...v]) => {
    const out: number[] = [];
    for (let i = 0; i < 8; i += 2) out.push(...f(v[i], v[i + 1]));
    return [t, ...out] as unknown as SlovoVision;
  });
}
const otoc = (stupne: number) => (x: number, y: number): [number, number] => {
  const a = (stupne * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a) + 1500, x * Math.sin(a) + y * Math.cos(a) + 1500];
};

describe('slovaZVision', () => {
  it('vezme text a rohy každého slova', () => {
    const slova = slovaZVision(cela());
    expect(slova).toHaveLength(VISION_UCTENKA_2873.length);
    expect(slova[0].t).toBe('Sumar');
    expect(slova[0].v).toHaveLength(4);
  });

  it('prázdná nebo poškozená odpověď = žádná slova, ne výjimka', () => {
    expect(slovaZVision(null)).toEqual([]);
    expect(slovaZVision({ responses: [{}] })).toEqual([]);
    expect(slovaZVision({ responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [{ symbols: [{ text: 'a' }] }] }] }] }] } }] })).toEqual([]);
  });

  it('Vision vynechává souřadnici 0', () => {
    const slova = slovaZVision({ responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [{
      symbols: [{ text: '4' }, { text: '2' }],
      boundingBox: { vertices: [{}, { x: 10 }, { x: 10, y: 5 }, { y: 5 }] },
    }] }] }] }] } }] });
    expect(slova).toEqual([{ t: '42', v: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }] }]);
  });
});

describe('řádky podle polohy', () => {
  it('každá položka je na dvou řádcích: kód a název, pod nimi „množství x cena = částka"', () => {
    const radky = radkyZVision(cela()).map((r) => r.text);
    expect(radky).toContain('10242 A Pivo sud 301 12e svetla');
    expect(radky).toContain('1 x 1455.00 = 1455.00');
    expect(radky).toContain('Celkem: 20675,00');
  });

  it('pořadí z Vision je u téhle fotky rozházené, řádky podle polohy ne', () => {
    // 10242: „1 x" stojí v odpovědi před názvem a částka až za dalším zbožím.
    const texty = VISION_UCTENKA_2873.map((s) => s[0]);
    const iNazev = texty.indexOf('10242');
    const iHodnoty = texty.findIndex((t, i) => t === '1455.00' && i > 0);
    expect(iNazev).toBeGreaterThan(-1);
    expect(iHodnoty).toBeGreaterThan(-1);
    const radky = radkyZVision(cela()).map((r) => r.text);
    const iR = radky.findIndex((r) => r.startsWith('10242 '));
    expect(radky[iR + 1]).toBe('1 x 1455.00 = 1455.00');
  });

  it('cizí text z druhé účtenky za první („1536", „disko: 2") ve čtení nepřekáží', () => {
    // Za řádky 11146–11148 trčí text druhé účtenky; v odpovědi Vision se přimíchal doprostřed.
    const radky = radkyZVision(cela()).map((r) => r.text);
    expect(radky.find((x) => x.startsWith('14 x 119,00'))).toMatch(/^14 x 119,00 = 1666,00/);
    expect(radky.find((x) => x.startsWith('2 x 106,00'))).toMatch(/^2 x 106,00 = 212,00/);
    // Řádek zboží nepřevezme cizí text do názvu.
    expect(radky.find((x) => x.startsWith('11147 '))).toBe('11147 A Pivo PET 1,51 12é svetla');
    expect(radky.find((x) => x.startsWith('11146 '))).toBe('11146 A Pivo PET 1,51 10é svetla');
  });
});

describe('čtení celé účtenky 2/2873', () => {
  const { uzaverka, nesparovano } = ctiUzaverkuZRadku(radkyZVision(cela()));

  it('všech 26 položek, čísla přesně jako na účtence', () => {
    expect(uzaverka.radky.map(cisla)).toEqual(ocekavanaCisla);
    expect(nesparovano).toEqual([]);
  });

  it('30l sud 12° je jen 1× za 1455 Kč a má kód 10242', () => {
    const sud = uzaverka.radky.find((r) => r.kod === '10242');
    expect(sud).toMatchObject({ mnozstvi: 1, cena: 1455, celkem: 1455 });
    expect(sud?.nazev).toBe('Pivo sud 30l 12° světlá');
    expect(uzaverka.radky.find((r) => r.kod === '11000')).toMatchObject({ mnozstvi: 1, cena: 35, celkem: 35, nazev: 'Pivo sklo 12° světlá 0,33l' });
  });

  it('hlavička a Celkem', () => {
    expect(uzaverka).toMatchObject({ cislo: '2/2873', stredisko: '2', vytisteno: '2026-10-10T10:09', celkem: 20675 });
  });

  it('čísla sedí sama se sebou — žádný problém, součet 20 675 Kč', () => {
    expect(souctRadku(uzaverka.radky)).toBe(20675);
    expect(zkontrolujUzaverku(uzaverka)).toEqual({ problemy: [], skore: 0 });
  });

  it('názvy jsou ve tvaru, který appka zná (objem s „l", stupeň s „°", diakritika)', () => {
    const nazvy = Object.fromEntries(uzaverka.radky.map((r) => [r.kod, r.nazev]));
    expect(nazvy['393']).toBe('Půllitr Mannheim 0,5l');
    expect(nazvy['1106']).toBe('Saponát 1l');
    expect(nazvy['10241']).toBe('Pivo sud 30l 10° světlá');
    expect(nazvy['11001']).toBe('Pivo sklo 12° světlá 0,5l');
    expect(nazvy['11004']).toBe('Pivo sklo 12° tmavá 0,5l');
    expect(nazvy['11009']).toBe('Pivo sklo 10° sv. 0,5l');
    expect(nazvy['11140']).toBe('Pivo PET 1l 10° světlá');
    expect(nazvy['11142']).toBe('Pivo PET 1l 12° jantarový ležák');
    expect(nazvy['11144']).toBe('Pivo PET 1l 11° světlý ležák');
    expect(nazvy['11147']).toBe('Pivo PET 1,5l 12° světlá');
    expect(nazvy['15117']).toBe('Limo PET 1l (ks)');
    expect(nazvy['15160']).toBe('0,5l limo sklo');
  });
});

describe('výřez fotky (jen část účtenky)', () => {
  it('přečte celé řádky, utržený poslední a chybějící Celkem ohlásí', () => {
    const { uzaverka } = ctiUzaverkuZRadku(radkyZVision(vyrez()));
    expect(uzaverka.radky.slice(0, 12).map(cisla)).toEqual(ocekavanaCisla.slice(0, 12));
    expect(uzaverka.cislo).toBeNull();
    const t = zkontrolujUzaverku(uzaverka).problemy.map((p) => p.text).join(' | ');
    expect(t).toContain('11142');            // řádek s utrženým koncem
    expect(t).toContain('Celkem');           // dole není
  });
});

describe('fotka držená jinak', () => {
  const ocekavane = ocekavanaCisla;

  it.each([[-25], [7], [45], [90], [180], [270]])('otočená o %i°', (stupne) => {
    const slova = transformuj(VISION_UCTENKA_2873, otoc(stupne));
    const { uzaverka } = ctiUzaverkuZRadku(radkyZVision(visionOdpoved(slova)));
    expect(uzaverka.radky.map(cisla)).toEqual(ocekavane);
    expect(uzaverka.celkem).toBe(20675);
  });

  it('přiblížená dvakrát i zmenšená na polovinu', () => {
    for (const k of [0.5, 2, 3.3]) {
      const slova = transformuj(VISION_UCTENKA_2873, (x, y) => [x * k, y * k]);
      expect(ctiUzaverkuZRadku(radkyZVision(visionOdpoved(slova))).uzaverka.radky.map(cisla)).toEqual(ocekavane);
    }
  });

  it('pořadí slov v odpovědi je jedno', () => {
    // Vision vrací odstavce, jak je najde; čtení se opírá jen o polohu.
    const zamichana = [...VISION_UCTENKA_2873];
    let seed = 7;
    for (let i = zamichana.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [zamichana[i], zamichana[j]] = [zamichana[j], zamichana[i]];
    }
    const { uzaverka } = ctiUzaverkuZRadku(radkyZVision(visionOdpoved(zamichana)));
    expect(uzaverka.radky.map(cisla)).toEqual(ocekavane);
    expect(zkontrolujUzaverku(uzaverka).problemy).toEqual([]);
  });

  it('fotka pod úhlem: náklon se mění od horního okraje k dolnímu', () => {
    // Perspektiva — dole je text nakloněný o dva stupně víc než nahoře.
    const slova = transformuj(VISION_UCTENKA_2873, (x, y) => [x, y + x * (0.01 + (y / 3000) * 0.025)]);
    const { uzaverka } = ctiUzaverkuZRadku(radkyZVision(visionOdpoved(slova)));
    expect(uzaverka.radky.map(cisla)).toEqual(ocekavane);
  });

  it('cizí slova vpravo za účtenkou (druhá účtenka, která z ní trčí) se ignorují', () => {
    const maxX = Math.max(...VISION_UCTENKA_2873.flatMap((s) => [s[1], s[3], s[5], s[7]]));
    const sum: SlovoVision[] = [];
    for (let y = 300; y < 2700; y += 90) {
      sum.push(['4711', maxX + 20, y, maxX + 100, y - 1, maxX + 100, y + 25, maxX + 20, y + 26]);
      sum.push(['disko:', maxX + 130, y - 1, maxX + 230, y - 2, maxX + 230, y + 24, maxX + 130, y + 25]);
    }
    const { uzaverka } = ctiUzaverkuZRadku(radkyZVision(visionOdpoved([...VISION_UCTENKA_2873, ...sum])));
    expect(uzaverka.radky.map(cisla)).toEqual(ocekavanaCisla);
    expect(zkontrolujUzaverku(uzaverka).problemy).toEqual([]);
  });
});

describe('čtení řádků: okrajové případy', () => {
  const radek = (text: string, y: number) => ({ text, y, slova: [] });

  it('částka, která se kvůli náklonu ocitla na vlastním řádku před řádkem hodnot', () => {
    const { uzaverka } = ctiUzaverkuZRadku([
      radek('393 A Pullitr Mannheim 0,51', 1),
      radek('140,00', 2),
      radek('1 x 140,00 =', 3),
    ]);
    expect(uzaverka.radky.map(cisla)).toEqual(['393|1|140|140']);
  });

  it('částka na vlastním řádku pod řádkem hodnot', () => {
    const { uzaverka } = ctiUzaverkuZRadku([
      radek('393 A Pullitr Mannheim 0,51', 1),
      radek('1 x 140,00 =', 2),
      radek('140,00', 3),
      radek('1106 A Saponat 11', 4),
      radek('1 x 25,00 = 25,00', 5),
    ]);
    expect(uzaverka.radky.map(cisla)).toEqual(['393|1|140|140', '1106|1|25|25']);
  });

  it('řádek zboží, na kterém zůstaly i hodnoty (hodně natočená fotka)', () => {
    const { uzaverka } = ctiUzaverkuZRadku([radek('393 A Pullitr Mannheim 0,51 1 x 140,00 = 140,00', 1)]);
    expect(uzaverka.radky).toHaveLength(1);
    expect(cisla(uzaverka.radky[0])).toBe('393|1|140|140');
    expect(uzaverka.radky[0].nazev).toBe('Půllitr Mannheim 0,5l');
  });

  it('znak × místo x, tisíce s mezerou, cena bez „="', () => {
    const { uzaverka } = ctiUzaverkuZRadku([
      radek('10241 A Pivo sud 301 10e svetla', 1),
      radek('8 × 1 275,00 = 10 200,00', 2),
      radek('11000 A Pivo sklo 12e svetla 0,331', 3),
      radek('1 x 35,00', 4),
    ]);
    expect(uzaverka.radky.map(cisla)).toEqual(['10241|8|1275|10200', '11000|1|35|null']);
  });

  it('zboží bez řádku hodnot a řádek hodnot bez zboží se neztratí tiše', () => {
    const { uzaverka, nesparovano } = ctiUzaverkuZRadku([
      radek('3 x 30,00 = 90,00', 1),
      radek('393 A Pullitr Mannheim 0,51', 2),
      radek('1106 A Saponat 11', 3),
      radek('1 x 25,00 = 25,00', 4),
    ]);
    expect(nesparovano).toEqual(['3 x 30,00 = 90,00']);
    expect(uzaverka.radky).toHaveLength(2);
    expect(Number.isNaN(uzaverka.radky[0].mnozstvi)).toBe(true);
    expect(zkontrolujUzaverku(uzaverka).problemy.map((p) => p.text).join(' ')).toContain('množství chybí');
  });

  it('bez sazby daně a s písmenem navíc před názvem', () => {
    const { uzaverka } = ctiUzaverkuZRadku([
      radek('393 Pullitr Mannheim 0,51', 1),
      radek('1 x 140,00 = 140,00', 2),
      radek('15160 A 0,51 limo sklo', 3),
      radek('7 x 31,00 = 217,00', 4),
    ]);
    expect(uzaverka.radky.map((r) => [r.kod, r.nazev])).toEqual([['393', 'Půllitr Mannheim 0,5l'], ['15160', '0,5l limo sklo']]);
  });

  it('Celkem a hlavička z řádků, i s drobnou chybou čtení', () => {
    const { uzaverka } = ctiUzaverkuZRadku([
      radek('Stredisko: 2', 1), radek('Uzaverka: 2/2873', 2), radek('Vytisteno: 10.10.2026 10:09', 3),
      radek('Ceikem: 140,00', 4),
    ]);
    expect(uzaverka).toMatchObject({ stredisko: '2', cislo: '2/2873', vytisteno: '2026-10-10T10:09' });
  });

  it('prázdný přepis = prázdná uzávěrka', () => {
    expect(ctiUzaverkuZRadku([]).uzaverka.radky).toEqual([]);
    expect(radkyZeSlov([])).toEqual([]);
  });
});

describe('opravNazev', () => {
  it.each([
    ['Pivo sud 301 10e svetla', 'Pivo sud 30l 10° světlá'],
    ['Pivo sklo 12e svetla 0,331', 'Pivo sklo 12° světlá 0,33l'],
    ['Pivo sklo 12e tmava 0.51', 'Pivo sklo 12° tmavá 0,5l'],
    ['Pivo sklo 10 % sv. 0,51', 'Pivo sklo 10° sv. 0,5l'],
    ['Pivo PET 11 12ėjantarovy lezak', 'Pivo PET 1l 12° jantarový ležák'],
    ['Pivo PET 11 11ésvetly lezak', 'Pivo PET 1l 11° světlý ležák'],
    ['Pivo PET 1,51 8ėCyklisticka Vos', 'Pivo PET 1,5l 8° Cyklistička Vos'],
    ['Saponat 11', 'Saponát 1l'],
    ['Limo PET 11 (ks)', 'Limo PET 1l (ks)'],
    ['Kyn-Pivni sprchovy gel 300ml', 'Kyn-Pivní sprchový gel 300ml'],
    ['Kartonek', 'Kartonek'],
  ])('%s → %s', (z, na) => {
    expect(opravNazev(z)).toBe(na);
  });

  it('nesahá na to, co objem ani stupeň není', () => {
    expect(opravNazev('Pivo PET 1l 12° světlá')).toBe('Pivo PET 1l 12° světlá');
    expect(opravNazev('Gel 300ml')).toBe('Gel 300ml');
    expect(opravNazev('Sirup 71')).toBe('Sirup 71');         // 7 l se nevyskytuje
    expect(opravNazev('Pivo 0,5l 4,5%')).toBe('Pivo 0,5l 4,5%');
  });
});

describe('kontrola čtení z AI proti přepisu', () => {
  const radky = radkyZVision(cela());
  const uctenka = () => JSON.parse(JSON.stringify(UCTENKA_2873));

  it('správné čtení projde bez připomínek', () => {
    expect(zkontrolujProtiPrepisu(uctenka(), radky)).toEqual([]);
  });

  it('kód, který na účtence není (11104 místo 11000), se chytí', () => {
    const u = uctenka();
    u.radky[4].kod = '11104';
    const p = zkontrolujProtiPrepisu(u, radky);
    expect(p).toHaveLength(1);
    expect(p[0].radek).toBe(4);
    expect(p[0].text).toContain('kód 11104');
  });

  it('vymyšlené množství, cena i částka (3 × 1360 = 4080 místo 1 × 1455 = 1455) se chytí', () => {
    const u = uctenka();
    Object.assign(u.radky[3], { kod: '11024', mnozstvi: 3, cena: 1360, celkem: 4080 });
    const p = zkontrolujProtiPrepisu(u, radky);
    expect(p).toHaveLength(1);
    expect(p[0].text).toContain('kód 11024');
    expect(p[0].text).toContain('cena 1360');
    expect(p[0].text).toContain('částka 4080');
  });

  it('bez přepisu se nekontroluje nic', () => {
    expect(zkontrolujProtiPrepisu(uctenka(), [])).toEqual([]);
  });
});

describe('výběr čtení', () => {
  const radky = radkyZVision(cela());
  const spravne = ctiUzaverkuZRadku(radky).uzaverka;
  const spatne = () => {
    const u = JSON.parse(JSON.stringify(UCTENKA_2873));
    Object.assign(u.radky[3], { kod: '11024', nazev: 'Pivo sud 12° světlá', mnozstvi: 3, cena: 1360, celkem: 4080 });
    return u;
  };

  it('přepis z Vision je bez problémů, AI s vymyšleným řádkem má problémy navíc', () => {
    const ocr = kandidatCteni(spravne, 'ocr', radky);
    const ai = kandidatCteni(spatne(), 'gemini', radky);
    expect(ocr.problemy).toEqual([]);
    // Součet řádků nesedí s Celkem a čísla jsou vymyšlená.
    expect(ai.problemy.length).toBeGreaterThanOrEqual(2);
    expect(vyberNejlepsi([ai, ocr])?.poskytovatel).toBe('ocr');
  });

  it('při shodě platí první v pořadí; bez čtení nic', () => {
    const a = kandidatCteni(spravne, 'ocr', radky);
    const b = kandidatCteni(spravne, 'gemini', radky);
    expect(vyberNejlepsi([a, b])?.poskytovatel).toBe('ocr');
    expect(vyberNejlepsi([])).toBeNull();
  });

  it('AI, která přečetla správně a přepis je neúplný (výřez), prohrává jen o skutečné problémy', () => {
    const ocrVyrez = kandidatCteni(ctiUzaverkuZRadku(radkyZVision(vyrez())).uzaverka, 'ocr', radkyZVision(vyrez()));
    expect(ocrVyrez.problemy.length).toBeGreaterThan(0);
    const ai = kandidatCteni(UCTENKA_2873, 'openai', radkyZVision(vyrez()));
    // AI přečetla celou účtenku — řádky mimo výřez v přepisu nejsou, takže mají připomínky,
    // ale kontroluje se jen proti tomu, co přepis vůbec obsahuje.
    expect(ai.problemy.some((p) => p.text.includes('10241'))).toBe(false);
  });
});

describe('pro AI', () => {
  it('přepis po řádcích a pokyn, že čísla se berou z něj', () => {
    const prepis = prepisRadku(radkyZVision(cela()));
    expect(prepis.split('\n')).toContain('10242 A Pivo sud 301 12e svetla');
    const sekce = sekceOcrUzaverky(prepis);
    expect(sekce).toContain('PŘEPIS FOTKY');
    expect(sekce).toContain('Číslo, které v přepisu není, do odpovědi NEDÁVEJ');
    expect(sekce).toContain(prepis);
  });
});

describe('celé čtení: přepis z Vision, AI jen jako záloha', () => {
  const vision = (slova: SlovoVision[] = VISION_UCTENKA_2873) => async (chyby: string[]) => {
    chyby.push('ocr: test');
    return { data: visionOdpoved(slova), poradi: ', 5. v měsíci' };
  };
  /** AI, která vrátí dané čtení jako JSON — a zapamatuje si, co dostala v promptu. */
  const ai = (nazev: string, vrat: unknown): ZdrojAi & { cti: ReturnType<typeof vi.fn> } => ({
    nazev,
    cti: vi.fn(async () => (typeof vrat === 'string' ? vrat : JSON.stringify(vrat))),
  });
  /** Čtení „z hlavy" — přesně to, co appka 14. 10. 2026 ukázala: jiný kód a vymyšlené 3 × 1360. */
  const vymyslene = () => {
    const u = JSON.parse(JSON.stringify(UCTENKA_2873));
    Object.assign(u.radky[3], { kod: '11024', nazev: 'Pivo sud 12° světlá', mnozstvi: 3, cena: 1360, celkem: 4080 });
    u.radky[4].kod = '11104';
    return u;
  };
  /** Přepis s jednou špatně přečtenou číslicí (částka 1455 → 1465): řádek 10242 přestane sedět. */
  const sChybou = (): SlovoVision[] => {
    const slova = [...VISION_UCTENKA_2873];
    const posledni = slova.map((w) => w[0]).lastIndexOf('1455.00');   // částka za „=", ne cena
    slova[posledni] = ['1465.00', ...slova[posledni].slice(1)] as unknown as SlovoVision;
    return slova;
  };

  it('čtení z přepisu sedí → je hotovo a AI se vůbec nevolá', async () => {
    const gemini = ai('gemini', vymyslene());
    const { nejlepsi, poznamky } = await ctiUzaverku({ vision: vision(), ai: [gemini] });
    expect(gemini.cti).not.toHaveBeenCalled();
    expect(nejlepsi?.poskytovatel).toBe('ocr');
    expect(nejlepsi?.problemy).toEqual([]);
    expect(nejlepsi?.uzaverka.radky.map(cisla)).toEqual(ocekavanaCisla);
    expect(poznamky).toEqual(['ocr: test', 'ocr: přečteno 26 položek, problémů 0, 5. v měsíci']);
  });

  it('30l sud 12° je jen 1× za 1455 — a ne 3× za 1360 s kódem 11024', async () => {
    const { nejlepsi } = await ctiUzaverku({ vision: vision(), ai: [ai('gemini', vymyslene())] });
    const sud = nejlepsi?.uzaverka.radky.find((r) => r.nazev.includes('sud 30l 12°'));
    expect(sud).toMatchObject({ kod: '10242', mnozstvi: 1, cena: 1455, celkem: 1455 });
    expect(nejlepsi?.uzaverka.radky.some((r) => r.kod === '11024' || r.kod === '11104')).toBe(false);
  });

  it('bez klíče k Vision čte AI; vymyšlená čísla bez přepisu ale nikdo nechytí (proto je Vision první)', async () => {
    const gemini = ai('gemini', UCTENKA_2873);
    const { nejlepsi } = await ctiUzaverku({ vision: null, ai: [gemini] });
    expect(gemini.cti).toHaveBeenCalledWith('');          // bez přepisu
    expect(nejlepsi?.poskytovatel).toBe('gemini');
    expect(nejlepsi?.problemy).toEqual([]);
  });

  it('přepis nesedí (špatná číslice) → čte AI, dostane přepis a vyhraje čtení bez problémů', async () => {
    const gemini = ai('gemini', UCTENKA_2873);
    const { nejlepsi } = await ctiUzaverku({ vision: vision(sChybou()), ai: [gemini] });
    expect(gemini.cti).toHaveBeenCalledTimes(1);
    const sekce = gemini.cti.mock.calls[0][0] as string;
    expect(sekce).toContain('PŘEPIS FOTKY');
    expect(sekce).toContain('10242 A Pivo sud 301 12e svetla');
    expect(sekce).toContain('1 x 1455.00 = 1465.00');   // řádek tak, jak ho Vision přečetla
    // Přepis má dva problémy (řádek 10242 a součet); AI čte celou účtenku bez problému.
    expect(nejlepsi?.poskytovatel).toBe('gemini');
    expect(nejlepsi?.problemy).toEqual([]);
  });

  it('přepis s jednou špatnou číslicí sám o sobě hlásí dva problémy: řádek a součet', async () => {
    const { nejlepsi } = await ctiUzaverku({ vision: vision(sChybou()), ai: [] });
    expect(nejlepsi?.poskytovatel).toBe('ocr');
    const t = nejlepsi?.problemy.map((p) => p.text).join(' | ') ?? '';
    expect(t).toContain('1 × 1455 = 1455, ale na účtence je 1465');
    expect(t).toContain('Součet řádků je 20685, ale na účtence je Celkem 20675');
  });

  it('AI, která si čísla vymyslela, nevyhraje nad přepisem (ten má méně problémů)', async () => {
    const { nejlepsi } = await ctiUzaverku({ vision: vision(sChybou()), ai: [ai('gemini', vymyslene())] });
    expect(nejlepsi?.poskytovatel).toBe('ocr');
    expect(nejlepsi?.uzaverka.radky.some((r) => r.kod === '11024')).toBe(false);
  });

  it('první AI selže (503, bez kreditu), druhá přečte', async () => {
    const spadla: ZdrojAi = { nazev: 'gemini', cti: async () => { throw new Error('Gemini HTTP 503: high demand'); } };
    const varovani: string[] = [];
    const druha = ai('openai', UCTENKA_2873);
    const { nejlepsi, poznamky } = await ctiUzaverku({ vision: null, ai: [spadla, druha], varovani: (t) => varovani.push(t) });
    expect(nejlepsi?.poskytovatel).toBe('openai');
    expect(poznamky).toEqual(['gemini: Gemini HTTP 503: high demand']);
    expect(varovani).toEqual(['gemini: Gemini HTTP 503: high demand']);
  });

  it('nepřečte nic: Vision nenašel zboží a AI selhaly', async () => {
    const prazdne = ai('openai', { radky: [] });
    const spadla: ZdrojAi = { nazev: 'anthropic', cti: async () => { throw new Error('credit balance is too low'); } };
    const { nejlepsi, poznamky } = await ctiUzaverku({ vision: vision([]), ai: [spadla, prazdne] });
    expect(nejlepsi).toBeNull();
    expect(poznamky).toEqual([
      'ocr: test', 'ocr: na fotce nenašel žádné položky, 5. v měsíci',
      'anthropic: credit balance is too low', 'openai: nic nepřečetl',
    ]);
  });

  it('Vision odmítne (limit, chyba) → rovnou AI', async () => {
    const gemini = ai('gemini', UCTENKA_2873);
    const { nejlepsi } = await ctiUzaverku({ vision: async (chyby) => { chyby.push('ocr: HTTP 403'); return null; }, ai: [gemini] });
    expect(gemini.cti).toHaveBeenCalledWith('');
    expect(nejlepsi?.poskytovatel).toBe('gemini');
  });

  it('výřez bez Celkem a se všemi řádky v pořádku: AI se nevolá, chybějící Celkem se ohlásí', async () => {
    const y11142 = VISION_UCTENKA_2873_VYREZ.find((w) => w[0] === '11142')![2];
    const slova = VISION_UCTENKA_2873_VYREZ.filter((w) => w[2] < y11142 - 30);
    const gemini = ai('gemini', UCTENKA_2873);
    const { nejlepsi } = await ctiUzaverku({ vision: vision(slova), ai: [gemini] });
    expect(gemini.cti).not.toHaveBeenCalled();
    expect(nejlepsi?.poskytovatel).toBe('ocr');
    expect(nejlepsi?.uzaverka.radky).toHaveLength(12);
    expect(nejlepsi?.problemy.map((p) => p.chybiCelkem)).toEqual([true]);
  });

  it('„Celkem" na fotce je, jen se číslo nepřečetlo → AI se zkusí', async () => {
    const slova = VISION_UCTENKA_2873.map((w) => (w[0] === '20675,00' ? ['#', ...w.slice(1)] as unknown as SlovoVision : w));
    const gemini = ai('gemini', UCTENKA_2873);
    const { nejlepsi } = await ctiUzaverku({ vision: vision(slova), ai: [gemini] });
    expect(gemini.cti).toHaveBeenCalledTimes(1);
    expect(nejlepsi?.poskytovatel).toBe('gemini');
    expect(nejlepsi?.uzaverka.celkem).toBe(20675);
  });

  it('názvy z AI, která je opsala z přepisu bez diakritiky, se srovnají jako při čtení z přepisu', async () => {
    const opsane = JSON.parse(JSON.stringify(UCTENKA_2873));
    opsane.radky[3].nazev = 'Pivo sud 301 12e svetla';
    opsane.radky[7].nazev = 'Pivo sklo 12° tmavá 0,33l';          // správně napsané zůstává
    const { nejlepsi } = await ctiUzaverku({ vision: null, ai: [ai('openai', opsane)] });
    expect(nejlepsi?.uzaverka.radky[3].nazev).toBe('Pivo sud 30l 12° světlá');
    expect(nejlepsi?.uzaverka.radky[7].nazev).toBe('Pivo sklo 12° tmavá 0,33l');
    expect(nejlepsi?.uzaverka.radky.map((r) => r.nazev)).toEqual(UCTENKA_2873.radky.map((r, i) => (i === 3 ? 'Pivo sud 30l 12° světlá' : opravNazev(r.nazev))));
  });

  it('řádky účtenky přečtené AI si berou první poskytovatele bez problémů a další už nevolají', async () => {
    const a = ai('gemini', UCTENKA_2873);
    const b = ai('openai', UCTENKA_2873);
    await ctiUzaverku({ vision: null, ai: [a, b] });
    expect(a.cti).toHaveBeenCalledTimes(1);
    expect(b.cti).not.toHaveBeenCalled();
  });
});
