/**
 * 📱 Jednou za čas upozorní, že je prohlížeč v telefonu starší, a řekne, co s tím.
 *
 * Šéfovi nejde aplikace na starším telefonu s Androidem (25. 11. 2026). Na starém WebView nic nespadne
 * hlasitě — jen se vzhled posune (chybí mezery, tmavý režim) a ve starších než 66 se nespustí vůbec
 * (to řeší záchranná obrazovka v index.html). Člověk se pak dozví jen „mně to nejde“. Tohle upozornění
 * mu řekne, že za to může starý prohlížeč v telefonu, a nabídne Diagnostiku telefonu.
 *
 * Zásady:
 *  • Ukáže se jen na prohlížeči pod doporučenou verzí (lib/podlahaProhlizece.ts). Chromium neznámé verze
 *    a moderní telefon neuvidí nic.
 *  • Jednou za 14 dní, ne při každém startu — upozornění, které otravuje, se přestane číst.
 *  • Nic se neposílá pryč a nic se nemění; jen text a odkaz.
 */
import { stavProhlizece, verzeChromu, DOPORUCENO_CHROME } from './podlahaProhlizece';
import { nacti, uloz } from './uloziste';
import { varovani } from './toast';

const KLIC = 'minipivovar_stary_prohlizec_upozorneno';
/** Jak dlouho se upozornění po zobrazení znovu neukazuje. */
export const ODSTUP_MS = 14 * 24 * 60 * 60 * 1000;

/** Adresa samostatné diagnostiky (public/diagnostika.html). */
export const ADRESA_DIAGNOSTIKY = '/diagnostika.html';

export function textUpozorneni(ua: string): string {
  const v = verzeChromu(ua);
  return `Prohlížeč v tomhle telefonu je starší (Chrome ${v}). Aplikace poběží, ale může vypadat jinak. `
    + `Doporučuju aktualizovat „Android System WebView“ a „Chrome“ v Obchodě Play (od verze ${DOPORUCENO_CHROME}).`;
}

/**
 * Ukáže upozornění, pokud je prohlížeč starší a dlouho se neukazovalo. Vrací `true`, když se ukázalo.
 * `ted` a `ua` jdou předat kvůli testům.
 */
export function upozorniNaStarySystem(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  ted: number = Date.now(),
): boolean {
  if (stavProhlizece(ua) !== 'stary') return false;
  const naposled = Number(nacti(KLIC));
  if (Number.isFinite(naposled) && naposled > 0 && ted - naposled < ODSTUP_MS) return false;
  // Nejdřív zapsat, pak ukázat: kdyby se zápis nepovedl (plné úložiště), upozornění by se jinak ukazovalo
  // při každém startu — to je horší než ho jednou nevidět.
  if (!uloz(KLIC, String(ted))) return false;
  varovani(textUpozorneni(ua), {
    trvani: 20000,
    akce: { label: 'Diagnostika telefonu', onClick: () => { window.location.assign(ADRESA_DIAGNOSTIKY); } },
  });
  return true;
}
