// 📴 Je telefon připravený na práci bez signálu? — jedna odpověď pro kartu v Nastavení.
// ---------------------------------------------------------------------------
// Bez signálu appka potřebuje dvě věci, které si stahuje na pozadí: kopii dat (lib/offlineKopie.ts) a obrazovky
// aplikace (service worker, lib/offlineObrazovky.ts). Majitel 27. 11. 2026: „furt to nefunguje offline" — a nebylo
// jak zjistit, jestli telefon všechno má, dokud signál nezmizel. Tady se z uložených stavů poskládá věta, kterou
// jde přečíst předem (a kterou jde poslat, když něco nefunguje). Nehádá se: co nevíme, to se řekne.
import { popisCasuKopie, type StavKopie } from './offlineKopieSklad';
import type { StavObrazovek } from './offlineObrazovky';

export type Pripravenost = {
  /** Data i obrazovky jsou v telefonu celé. */
  pripraveno: boolean;
  nadpis: string;
  data: string;
  obrazovky: string;
};

export function pripravenostBezSignalu(
  kopie: Pick<StavKopie, 'uplneT' | 'posledniT' | 'tabulek' | 'nestazene'>,
  obrazovky: StavObrazovek | null,
  ted: number = Date.now(),
): Pripravenost {
  const uplne = popisCasuKopie(kopie.uplneT, ted);
  const cast = popisCasuKopie(kopie.posledniT, ted);
  const dataOk = uplne !== null;
  const data = dataOk
    ? `Data: v telefonu, stažená ${uplne} (${kopie.tabulek} tabulek).`
    : cast
      ? `Data: zatím jen část (${kopie.tabulek} tabulek, stažená ${cast})${kopie.nestazene.length > 0 ? ` — nestáhlo se ${kopie.nestazene.length}` : ''}.`
      : 'Data: v telefonu zatím nejsou.';
  const obrOk = !!obrazovky && obrazovky.celkem > 0 && obrazovky.ulozeno >= obrazovky.celkem;
  const obr = !obrazovky
    ? 'Obrazovky: zatím nezjištěno — zjistí se chvíli po spuštění se signálem.'
    : obrOk
      ? `Obrazovky: všechny v telefonu (${obrazovky.celkem}).`
      : `Obrazovky: ${obrazovky.ulozeno} ze ${obrazovky.celkem} — zbytek se stáhne, až bude signál.`;
  const pripraveno = dataOk && obrOk;
  return {
    pripraveno,
    nadpis: pripraveno
      ? 'Telefon je připravený — bez signálu uvidíš data i všechny obrazovky.'
      : 'Telefon ještě není úplně připravený — nech aplikaci chvíli otevřenou se signálem.',
    data,
    obrazovky: obr,
  };
}
