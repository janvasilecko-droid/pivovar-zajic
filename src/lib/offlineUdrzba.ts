// 📴 Údržba práce bez signálu — všechno, co se má rozběhnout po přihlášení, ale nepatří do startu aplikace.
// ---------------------------------------------------------------------------
// Tenhle soubor (a s ním stahování kopie i vyhodnocení dotazů) je v samostatném kusu: App.tsx si ho načte až
// po přihlášení, takže první obrazovka se kvůli offline režimu nenačítá ani o kilobajt déle. Popis celku:
// docs/offline.md.
import { spustUdrzbuKopie } from './offlineKopie';
import { spustDoplnovaniObrazovek } from './offlineObrazovky';
import { nactiVyhodnoceniDotazu } from './supabase';

/** Spustí udržování kopie dat a doplňování obrazovek v telefonu. Vrací úklid (odhlášení, změna účtu). */
export function spustOfflineUdrzbu(): () => void {
  // Kopie tabulek: stáhnout a držet čerstvou, dokud je appka otevřená.
  const konecKopie = spustUdrzbuKopie();
  // Obrazovky samotné (kusy aplikace) — ať jdou bez signálu otevřít i ty, které člověk předtím neotevřel.
  const konecObrazovek = spustDoplnovaniObrazovek();
  // Vyhodnocení dotazů do paměti už teď, se signálem — až signál vypadne, je po ruce bez čtení z disku.
  void nactiVyhodnoceniDotazu();
  return () => { konecKopie(); konecObrazovek(); };
}
