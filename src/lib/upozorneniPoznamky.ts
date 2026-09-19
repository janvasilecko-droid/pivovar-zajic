// 🔔 Upozornění u poznámky — spojení mezi „Poznámky" a „Připomínky".
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „ty poznámky udělej líp — když jsem zadal poznámku,
// tak ať k ní můžu přidat upozornění a jednodušeji to ukládat."
//
// Dosud to byly dvě úplně oddělené obrazovky: poznámku jste napsal v Poznámkách
// a když jste chtěl, aby vám o ní appka dala vědět, musel jste ji celou znovu
// opsat do Připomínek. Odtud tenhle modul — poznámka umí sama založit
// připomínku a ví, jestli u ní nějaká visí.
//
// ⚠️ PROČ SE PÁRUJE PODLE TEXTU, A NE PODLE ID: tabulka `notes` ani `reminders`
// nemá sloupec na odkaz a nová migrace se na produkci pouští ručně — feature by
// do té doby byla rozbitá. Párování podle jména a textu je tady dost dobré:
// když se poznámka upraví, appka upraví i její připomínku (viz Notes.tsx), tak
// že vazba drží. A i kdyby se rozpadla, nic se neztratí — připomínka platí dál,
// jen u poznámky zmizí odznáček.

import type { ReminderItem } from './reminders';

/** Nejdelší název připomínky, ať se vejde do notifikace i do modálu. */
const MAX_NAZEV = 60;

export type PoznamkaProUpozorneni = {
  title: string | null;
  body: string;
};

/**
 * Název připomínky odvozený z poznámky: nadpis, a když není, první řádek textu.
 * Prázdný řetězec znamená, že není z čeho název udělat.
 */
export function nazevUpozorneni(poznamka: PoznamkaProUpozorneni): string {
  const nadpis = (poznamka.title ?? '').trim();
  if (nadpis) return nadpis.slice(0, MAX_NAZEV);
  const prvniRadek = (poznamka.body ?? '').split('\n').map((r) => r.trim()).find(Boolean) ?? '';
  return prvniRadek.slice(0, MAX_NAZEV);
}

/** Dvě poznámky/připomínky považujeme za tutéž, když sedí název i text. */
function stejny(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

/**
 * Připomínka, která u téhle poznámky visí — nebo `null`. Hotové (odbavené)
 * se přeskakují: odznáček má ukazovat, na co se ČEKÁ, ne co už proběhlo.
 */
export function upozorneniKPoznamce(
  poznamka: PoznamkaProUpozorneni,
  upozorneni: ReminderItem[],
): ReminderItem | null {
  const nazev = nazevUpozorneni(poznamka);
  if (!nazev) return null;
  return (
    upozorneni.find(
      (u) => !u.is_completed && stejny(u.title, nazev) && stejny(u.note, poznamka.body),
    ) ?? null
  );
}

/** `YYYY-MM-DDTHH:mm` v MÍSTNÍM čase — `toISOString()` by ujel o časové pásmo. */
export function proVstupDatumCas(d: Date): string {
  const dvojmisto = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dvojmisto(d.getMonth() + 1)}-${dvojmisto(d.getDate())}`
    + `T${dvojmisto(d.getHours())}:${dvojmisto(d.getMinutes())}`;
}

/**
 * Rychlé termíny — ať se nemusí klikat v kalendáři kvůli „zítra ráno".
 * Ranní čas je 7:00 (začátek směny), odpolední 14:00.
 */
export type RychlyTermin = 'za-hodinu' | 'dnes-odpoledne' | 'zitra-rano' | 'za-tyden';

export const RYCHLE_TERMINY: { klic: RychlyTermin; popis: string }[] = [
  { klic: 'za-hodinu', popis: 'Za hodinu' },
  { klic: 'dnes-odpoledne', popis: 'Dnes odpoledne' },
  { klic: 'zitra-rano', popis: 'Zítra ráno' },
  { klic: 'za-tyden', popis: 'Za týden' },
];

export function terminKdy(klic: RychlyTermin, ted: Date = new Date()): string {
  const d = new Date(ted.getTime());
  d.setSeconds(0, 0);
  switch (klic) {
    case 'za-hodinu':
      d.setHours(d.getHours() + 1);
      break;
    case 'dnes-odpoledne':
      d.setHours(14, 0);
      // Už je po druhé? Pak „dnes odpoledne" nedává smysl — posuň na zítra.
      if (d.getTime() <= ted.getTime()) d.setDate(d.getDate() + 1);
      break;
    case 'zitra-rano':
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0);
      break;
    case 'za-tyden':
      d.setDate(d.getDate() + 7);
      d.setHours(7, 0);
      break;
  }
  return proVstupDatumCas(d);
}

/** „19. 9. 7:00" — krátký zápis do odznáčku u poznámky. */
export function kdyCesky(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
