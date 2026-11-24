// 🌐 Zdroj z internetu v odpovědi AI sládka → záznam v bibli.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: chatbot „může sbírat věci i z internetu". Nález z webu
// (web_search v chatu, nebo odkaz v odpovědi z aplikace Claude) se do bible
// neukládá sám — zapíše ho člověk jedním klepnutím a vždy jako neověřený
// (důvěra 5), stejně jako zdroje z konektoru (R27); ověřuje správce. Shrnutí je
// věta z odpovědi AI sládka (jeho vlastní slova), ne text cizí stránky —
// kvůli autorským právům a proto, že citovaný úryvek stránky se neukládá.
import type { ZdrojOdpovedi } from './bibleChatApi';
import type { WebZdrojVstup } from './bibleWebApi';

const ADRESA = /^https?:\/\/[^\s]+$/i;
const MAX_ADRESA = 2000;
const MAX_TITULEK = 300;
const MAX_SHRNUTI = 600;
const NAJEDNOU_VET = 2;

/** Když se v odpovědi věta s citací nenajde: neutrální poznámka, ať shrnutí není prázdné. */
export const SHRNUTI_NENALEZENO = 'Zdroj z internetu použitý v odpovědi AI sládka (shrnutí doplň ve Správě znalostí).';

/** Zdroje z webu, které jde uložit: jen http(s) s rozumnou adresou, každá adresa jednou (bez ohledu na velikost písmen). */
export function webZdrojeOdpovedi(citace: readonly ZdrojOdpovedi[]): ZdrojOdpovedi[] {
  const videno = new Set<string>();
  const vysledek: ZdrojOdpovedi[] = [];
  for (const z of citace) {
    const url = z.zdroj === 'web' ? z.url?.trim() ?? '' : '';
    if (!ADRESA.test(url) || url.length > MAX_ADRESA) continue;
    const klic = url.toLowerCase();
    if (videno.has(klic)) continue;
    videno.add(klic);
    vysledek.push(z);
  }
  return vysledek;
}

/** Věta bez značek Markdownu, bez čísel citací [n] a se sjednocenými mezerami. */
function ocistiVetu(veta: string): string {
  return veta
    .replace(/\[\d{1,3}\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim();
}

/**
 * Věty odpovědi, které nesou citaci [n] — shrnutí zdroje jeho vlastními slovy AI sládka.
 * Nejvýš dvě věty a ~600 znaků; bez věty s citací vrací ''. Věty se dělí jen tam, kde po tečce
 * následuje mezera (desetinná tečka „5.4" větu nedělí).
 */
export function shrnutiZOdpovedi(text: string, n: number): string {
  const znacka = `[${n}]`;
  const vety: string[] = [];
  for (const radek of text.split('\n')) {
    if (!radek.includes(znacka)) continue;
    const bezOdrazky = radek.replace(/^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '');
    // Citace za tečkou („… vyšší. [3] Další věta") patří k větě před ní: přesune se před tečku.
    const sCitacemiPredTeckou = bezOdrazky.replace(/([.!?…])\s*((?:\[\d{1,3}\]\s*)+)/g, (_, tecka: string, citace: string) => `${citace.replace(/\s+/g, '')}${tecka} `);
    for (const veta of sCitacemiPredTeckou.replace(/([.!?…])\s+/g, '$1\u0001').split('\u0001')) {
      if (!veta.includes(znacka)) continue;
      const cista = ocistiVetu(veta);
      if (cista && !vety.includes(cista)) vety.push(cista);
    }
  }
  const text2 = vety.slice(0, NAJEDNOU_VET).join(' ');
  if (text2.length <= MAX_SHRNUTI) return text2;
  const rez = text2.slice(0, MAX_SHRNUTI - 1);
  const mezera = rez.lastIndexOf(' ');
  return `${(mezera > MAX_SHRNUTI / 2 ? rez.slice(0, mezera) : rez).replace(/[\s,;:]+$/, '')}…`;
}

function jmenoServeru(adresa: string): string {
  try {
    return new URL(adresa).hostname;
  } catch {
    return adresa;
  }
}

/**
 * Vstup pro bible-api (web_zdroj_ulozit): vždy neověřený zdroj (důvěra 5), bez vydavatele a data
 * publikace (z odpovědi se nezjistí — doplní správce). Null = adresa není uložitelná.
 */
export function webZdrojZOdpovedi(z: ZdrojOdpovedi, text: string): WebZdrojVstup | null {
  if (z.zdroj !== 'web') return null;
  const url = z.url?.trim() ?? '';
  if (!ADRESA.test(url) || url.length > MAX_ADRESA) return null;
  return {
    url,
    titulek: (z.nazev.trim() || jmenoServeru(url)).slice(0, MAX_TITULEK),
    vydavatel: '',
    datumPublikace: '',
    shrnuti: shrnutiZOdpovedi(text, z.n) || SHRNUTI_NENALEZENO,
    oblasti: [],
    duvera: 5,
  };
}
