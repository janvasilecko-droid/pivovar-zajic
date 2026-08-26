// 📳 Krátká odezva do prstu. Na telefonu je to rozdíl mezi „asi to prošlo"
// a „vím, že to prošlo" — člověk nemusí kontrolovat očima, že se odškrtnutí
// zapsalo, což se při počítání inventury nebo nakládání závozu počítá.
//
// Bez knihovny: navigator.vibrate funguje v Chrome i v Android WebView (APK).
// Na iOS ho Safari nemá — tam se nic nestane, což je v pořádku.
const KLIC = 'pivovar_haptika';

export type Vzorec = 'klik' | 'odskrtnuto' | 'hotovo' | 'varovani' | 'chyba';

// Krátké a nenápadné. Delší vibrace v ruce spíš ruší, než pomáhá.
const VZORCE: Record<Vzorec, number | number[]> = {
  klik: 8,
  odskrtnuto: 15,
  hotovo: [12, 40, 20],
  varovani: [20, 50],
  chyba: [30, 60, 30],
};

export function haptikaZapnuta(): boolean {
  try {
    return localStorage.getItem(KLIC) !== 'off';
  } catch {
    return true;
  }
}

export function nastavHaptiku(zapnuto: boolean) {
  try {
    localStorage.setItem(KLIC, zapnuto ? 'on' : 'off');
  } catch {}
}

export function zavibruj(vzorec: Vzorec = 'klik') {
  if (!haptikaZapnuta()) return;
  try {
    navigator.vibrate?.(VZORCE[vzorec]);
  } catch {}
}
