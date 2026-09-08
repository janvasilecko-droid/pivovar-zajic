/**
 * ⚡ Méně efektů — přepínač pro plynulejší chod na starším telefonu.
 *
 * Z provozu přišlo „přijde mi, že se to seká". Nejdražší věc, kterou appka
 * v CSS dělá, je ROZOSTŘENÍ PODKLADU (`backdrop-filter`): prohlížeč musí
 * kus okna pod prvkem ofotit, rozostřit a složit zpátky — a dělá to pro
 * KAŽDÝ takový prvek zvlášť, při každém překreslení. Plocha jich má jeden
 * na každé dlaždici (naměřeno 15 na jediné stránce dlaždic) a skleněná
 * hlavička se spodní lištou jsou na VŠECH obrazovkách. K tomu blikající
 * upozornění, která animují barvu pozadí, tedy se překreslují donekonečna.
 *
 * Proč přepínač a ne prostě smazat: je to záměrný vzhled, ne nedopatření.
 * Změřeno pixelově — rozostření pod 86% závojem lišty JE vidět (nejvíc
 * o 17 z 255), takže „stejně to není poznat" by nebyla pravda. Kdo má
 * výkonný telefon, ať si sklo nechá; kdo má sekání, ať ho vypne.
 *
 * Vypnuté zůstávají i blikající upozornění — proto to POTVRDÍ jinak: místo
 * blikání dostanou stálý barevný rámeček, ať se nepřehlédnou (upozornění,
 * které není vidět, je horší než sekání).
 *
 * Ovlivňuje jen vzhled, nic se neposílá do databáze — nastavuje se na
 * každém telefonu zvlášť, protože sekání je vlastnost telefonu.
 */
import { nacti, uloz } from './uloziste';

const KLIC = 'minipivovar_mene_efektu';

export function mensiEfekty(): boolean {
  if (typeof window === 'undefined') return false;
  return nacti(KLIC) === '1';
}

export function nastavEfekty(mene: boolean) {
  if (typeof window === 'undefined') return;
  uloz(KLIC, mene ? '1' : '0');
  document.documentElement.classList.toggle('mene-efektu', mene);
}

export function initEfekty() {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.toggle('mene-efektu', mensiEfekty());
}
