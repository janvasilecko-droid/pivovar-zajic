/**
 * 🔢 Hledání víček lahví na fotce palety shora.
 *
 * Proč to není AI: čtení fotky přes AI vrací jedno číslo, které nejde
 * zkontrolovat — u plné palety se splete o pár kusů a nikdo neví, o které.
 * Tady se každá nalezená lahev vrátí jako bod, obrazovka ho nakreslí na fotku
 * a obsluha chybějící doplní a přebytečné odebere ťuknutím. Počet je pak
 * ověřený okem, ne odhadnutý.
 *
 * Jak se víčko pozná: je to malá světlá skvrna zhruba kulatého tvaru, kolem
 * které je tmavá lahev. Dřevo ohrádky a barevné etikety se vyřadí podle barvy,
 * zeď a podlaha podle velikosti, odlesky na lahvích podle tvaru a nakonec
 * všechno, co velikostí nesedí k ostatním víčkům.
 *
 * Co nenajde (a obsluha doplní ťuknutím): ležící lahve, víčka splývající se
 * světlým pozadím a lahve ve spodní vrstvě.
 *
 * Čistá funkce bez DOM — počítá se z pixelů, takže běží i na starém telefonu
 * a jde testovat bez prohlížeče.
 */

/** Střed a poloměr víčka v podílech šířky fotky (x, r) a výšky (y), tedy 0–1. */
export type Vicko = { x: number; y: number; r: number };

/** Nejdelší strana, na kterou se fotka před hledáním zmenší. */
export const STRANA_PRO_HLEDANI = 1200;

const JAS_VICKA = 0.3;
const JAS_LAHVE = 0.22;
/** Nejmenší plocha skvrny v pixelech, menší je šum. */
const MIN_PLOCHA = 14;
/** Skvrna širší než tenhle podíl kratší strany fotky už víčko není. */
const MAX_PODIL_STRANY = 0.09;

/**
 * Najde víčka v pixelech RGBA (tak je vrací `getImageData`).
 * Pořadí výsledku je shora dolů a zleva doprava.
 */
export function najdiVicka(rgba: ArrayLike<number>, sirka: number, vyska: number): Vicko[] {
  const n = sirka * vyska;
  if (n === 0 || rgba.length < n * 4) return [];

  const svetly = new Uint8Array(n);
  // Součtová tabulka tmavých pixelů: podíl tmavé v obdélníku pak stojí čtyři čtení.
  const W = sirka + 1;
  const tmaveSoucet = new Int32Array(W * (vyska + 1));

  for (let y = 0; y < vyska; y++) {
    let radek = 0;
    for (let x = 0; x < sirka; x++) {
      const i = y * sirka + x;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const jas = max / 255;
      const sytost = max === 0 ? 0 : (max - min) / max;
      if (jas < JAS_LAHVE) radek++;
      else if (jas >= JAS_VICKA && !jeDrevoNeboEtiketa(r, g, b, max, min, sytost)) svetly[i] = 1;
      tmaveSoucet[(y + 1) * W + x + 1] = tmaveSoucet[y * W + x + 1] + radek;
    }
  }

  const tmavych = (x0: number, y0: number, x1: number, y1: number) =>
    tmaveSoucet[y1 * W + x1] - tmaveSoucet[y0 * W + x1] - tmaveSoucet[y1 * W + x0] + tmaveSoucet[y0 * W + x0];

  const maxRozmer = Math.max(6, Math.min(sirka, vyska) * MAX_PODIL_STRANY);
  type Kandidat = { cx: number; cy: number; r: number };
  const kandidati: Kandidat[] = [];
  const zasobnik = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (!svetly[start]) continue;
    // Vyplnění souvislé skvrny (sousedé nahoře, dole, vlevo, vpravo).
    let vrchol = 0;
    zasobnik[vrchol++] = start;
    svetly[start] = 0;
    let plocha = 0, sx = 0, sy = 0;
    let x0 = sirka, x1 = 0, y0 = vyska, y1 = 0;
    while (vrchol > 0) {
      const i = zasobnik[--vrchol];
      const x = i % sirka, y = (i - x) / sirka;
      plocha++; sx += x; sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && svetly[i - 1]) { svetly[i - 1] = 0; zasobnik[vrchol++] = i - 1; }
      if (x < sirka - 1 && svetly[i + 1]) { svetly[i + 1] = 0; zasobnik[vrchol++] = i + 1; }
      if (y > 0 && svetly[i - sirka]) { svetly[i - sirka] = 0; zasobnik[vrchol++] = i - sirka; }
      if (y < vyska - 1 && svetly[i + sirka]) { svetly[i + sirka] = 0; zasobnik[vrchol++] = i + sirka; }
    }

    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (plocha < MIN_PLOCHA || bw > maxRozmer || bh > maxRozmer) continue;
    const pomer = bw / bh;
    if (pomer < 0.55 || pomer > 1.8) continue;
    if (plocha / (bw * bh) < 0.5) continue;

    // Vedle skvrny musí být tmavá lahev. Při pohledu shora je kolem dokola,
    // při pohledu ze strany jen z jedné strany (hrdlo pod víčkem) — proto
    // stačí jedna hodně tmavá strana a trocha tmavé celkem.
    const okraj = Math.ceil(Math.max(bw, bh) * 0.9);
    const ox0 = Math.max(0, x0 - okraj), oy0 = Math.max(0, y0 - okraj);
    const ox1 = Math.min(sirka, x1 + 1 + okraj), oy1 = Math.min(vyska, y1 + 1 + okraj);
    const plochaOkoli = (ox1 - ox0) * (oy1 - oy0) - bw * bh;
    if (plochaOkoli <= 0) continue;
    const tmaveOkoli = tmavych(ox0, oy0, ox1, oy1) - tmavych(x0, y0, x1 + 1, y1 + 1);
    if (tmaveOkoli / plochaOkoli < 0.15) continue;
    const podil = (ax0: number, ay0: number, ax1: number, ay1: number) => {
      const p = (ax1 - ax0) * (ay1 - ay0);
      return p > 0 ? tmavych(ax0, ay0, ax1, ay1) / p : 0;
    };
    const nejtmavsiStrana = Math.max(
      podil(ox0, y0, x0, y1 + 1), podil(x1 + 1, y0, ox1, y1 + 1),
      podil(x0, oy0, x1 + 1, y0), podil(x0, y1 + 1, x1 + 1, oy1),
    );
    if (nejtmavsiStrana < 0.5) continue;

    kandidati.push({ cx: sx / plocha + 0.5, cy: sy / plocha + 0.5, r: Math.sqrt(plocha / Math.PI) });
  }

  if (kandidati.length === 0) return [];

  // Víčka na jedné paletě jsou podobně velká; co se od nich liší moc, je
  // odlesk na lahvi (menší) nebo kus pozadí (větší). Měří se proti horní
  // čtvrtině velikostí, protože odlesků bývá na poloprázdné paletě víc než víček.
  const polomery = kandidati.map((k) => k.r).sort((a, b) => a - b);
  const beznyPolomer = polomery[Math.floor(polomery.length * 0.75)];
  return kandidati
    .filter((k) => kandidati.length < 4 || (k.r >= beznyPolomer * 0.45 && k.r <= beznyPolomer * 1.7))
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
    .map((k) => ({ x: k.cx / sirka, y: k.cy / vyska, r: k.r / sirka }));
}

/** Syté hnědé a oranžové (dřevo ohrádky) a syté barvy mimo žlutou (etikety) víčko nejsou. */
function jeDrevoNeboEtiketa(r: number, g: number, b: number, max: number, min: number, sytost: number): boolean {
  if (sytost <= 0.3) return false;
  const rozsah = max - min;
  let odstin: number;
  if (max === r) odstin = ((g - b) / rozsah) * 60;
  else if (max === g) odstin = 120 + ((b - r) / rozsah) * 60;
  else odstin = 240 + ((r - g) / rozsah) * 60;
  if (odstin < 0) odstin += 360;
  // Žlutá víčka mají odstín 42–75°; pod tím je dřevo, nad tím a kolem dokola etikety.
  return odstin < 42 || odstin > 75;
}

/** Tečka na fotce = jedna lahev. `rucni` je tečka přidaná ťuknutím, ne nalezená programem. */
export type Tecka = { id: number; x: number; y: number; rucni: boolean };

/**
 * Co udělá ťuknutí do fotky v bodě (x, y): tečku v dosahu odebere (nejbližší),
 * jinak přidá novou. Souřadnice i dosah jsou v podílech šířky a výšky fotky,
 * dosah zvlášť pro každou osu — fotka není čtverec a prst má na obrazovce
 * stejný dosah v pixelech oběma směry.
 */
export function poKlepnuti(tecky: Tecka[], x: number, y: number, dosahX: number, dosahY: number): Tecka[] {
  let nejblizsi = -1;
  let nejmensi = 1;
  tecky.forEach((t, i) => {
    const dx = (t.x - x) / dosahX, dy = (t.y - y) / dosahY;
    const d = dx * dx + dy * dy;
    if (d <= nejmensi) { nejmensi = d; nejblizsi = i; }
  });
  if (nejblizsi >= 0) return tecky.filter((_, i) => i !== nejblizsi);
  const id = tecky.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  return [...tecky, { id, x, y, rucni: true }];
}
