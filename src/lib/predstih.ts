/**
 * 🏃 Přednačtení obrazovek, na které se stejně klikne.
 *
 * Z provozu: „dlouhé otevírání obrazovky." Appka je rozdělená na 24 kusů,
 * které se stahují až při prvním otevření obrazovky (`lazy()` v App.tsx) —
 * to je správně, jinak by start trval věčnost. Jenže na mobilních datech
 * ve sklepě znamená každé PRVNÍ otevření čekání: Objednávky mají 120 kB
 * a při 240 kB/s je to půl vteřiny, než se vůbec začne kreslit.
 *
 * Nic se přitom neděje, když člověk kouká na plochu. Tenhle modul ten čas
 * využije: potichu, po jednom, s odstupem stáhne kusy obrazovek, které se
 * v pivovaru otevírají každý den. Když se pak na dlaždici klepne, je kus
 * už v telefonu a obrazovka naskočí hned.
 *
 * (Druhou půlku toho problému řeší service worker: do 6. 9. 2026 stahoval
 * kusy aplikace ze sítě při KAŽDÉM spuštění, s vynuceným dotazem na server,
 * i když se nikdy nemění. Teď se berou z telefonu — takže tohle přednačtení
 * platí jen jednou, ne pořád dokola.)
 *
 * Zásady:
 *  • Až po startu a jen v nečinnosti — přednačítání nikdy nesmí konkurovat
 *    tomu, na co se člověk zrovna dívá.
 *  • Nikdy při zapnutém spořiči dat nebo na pomalém připojení. Stahovat
 *    někomu 400 kB, o které si neřekl, je drzost.
 *  • Po jednom a s pauzou, ne všechno naráz.
 *  • Selhání se tiše ignoruje. Je to zrychlení, ne funkce — když se to
 *    nepovede, obrazovka se stáhne později jako dřív.
 */

/**
 * Pořadí podle toho, co se v pivovaru otevírá nejčastěji. Objednávky první:
 * je to nejtěžší kus (120 kB) a zároveň ten, na který se klepne nejdřív.
 */
export const OBRAZOVKY_V_PREDSTIHU: (() => Promise<unknown>)[] = [
  () => import('../screens/OrdersTabbed'),
  () => import('../screens/Kegging'),
  () => import('../screens/BottlingScreen'),
  () => import('../screens/ProdejnaScreen'),
  () => import('../screens/Zavoz'),
];

/** Smí se teď stahovat něco, o co si uživatel neřekl? */
export function smiSePredstih(): boolean {
  if (typeof navigator === 'undefined') return false;
  const site = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!site) return true; // prohlížeč to neumí říct — chováme se jako dřív
  if (site.saveData) return false;
  return !(site.effectiveType === 'slow-2g' || site.effectiveType === '2g');
}

/** Chvilka nečinnosti; když ji prohlížeč neumí, obyčejná pauza. */
function azNebudeCoDelat(cekej: number): Promise<void> {
  return new Promise((hotovo) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(() => hotovo(), { timeout: cekej + 2000 });
    else setTimeout(hotovo, cekej);
  });
}

/**
 * Spustí přednačítání. Vrací počet skutečně stažených kusů (pro testy).
 * `odklad` je pauza po startu, `mezi` pauza mezi jednotlivými kusy.
 */
export async function nactiVPredstihu(
  seznam: (() => Promise<unknown>)[] = OBRAZOVKY_V_PREDSTIHU,
  { odklad = 4000, mezi = 1500 }: { odklad?: number; mezi?: number } = {}
): Promise<number> {
  if (!smiSePredstih()) return 0;
  await new Promise((r) => setTimeout(r, odklad));
  let stazeno = 0;
  for (const nacti of seznam) {
    if (typeof document !== 'undefined' && document.hidden) break;
    await azNebudeCoDelat(mezi);
    try { await nacti(); stazeno++; } catch { /* stáhne se pak normálně */ }
  }
  return stazeno;
}
