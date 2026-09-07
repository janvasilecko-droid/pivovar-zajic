/**
 * Zavřená lišta „Nová verze" — jedno místo, kde se to ví.
 *
 * Upozornění na novou verzi jsou dvě: LIŠTA nad obsahem (na každé
 * obrazovce, viz Layout.tsx) a DLAŽDICE mezi upozorněními na Domů. Dokud
 * svítily obě naráz, stálo na ploše dvakrát totéž vedle sebe.
 *
 * Pravidlo je proto: dokud visí lišta, dlaždice se nekreslí. Až lištu někdo
 * zavře, převezme to dlaždice — aktualizace tím nezmizí ze světa, jen
 * přestane zabírat řádek nad každou obrazovkou.
 *
 * Vydrží jen do zavření karty (sessionStorage): po novém otevření aplikace
 * má lišta zase upozornit, jinak by o čekající aktualizaci nikdo nevěděl.
 */

const KLIC = 'verze_lista_zavrena';
export const VERZE_LISTA_EVENT = 'verze_lista_zavrena_zmena';

/** Kterou verzi uživatel na liště odklepl (null = žádnou). */
export function zavrenaVerzeListy(): string | null {
  try { return sessionStorage.getItem(KLIC); } catch { return null; }
}

export function zavriVerziListy(verze: string): void {
  try { sessionStorage.setItem(KLIC, verze); } catch { /* privátní režim — lišta prostě zůstane */ }
  window.dispatchEvent(new CustomEvent(VERZE_LISTA_EVENT, { detail: verze }));
}
