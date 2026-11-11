// 💬 AI sládek — smyčka Claude ↔ nástroje (testy: chat-smycka.test.ts).
// ---------------------------------------------------------------------------
// Bez sítě a bez SDK: volání Claude dodá bible-chat/index.ts (stream přes
// Anthropic SDK), testy ho nahradí. Tady je všechno, co rozhoduje o odpovědi:
// kola nástrojů, hlídání času a měsíčního stropu, záložní model, citace,
// poznámky k nedokončené odpovědi a cena.
import { ChybaNastroje, orizni } from './mcp.ts';
import type { VysledekChatu } from './nastroje.ts';
import {
  CAS_NA_NASTROJE_MS, cenaVolani, chybaApi, MAX_KOL, nastrojeKProvedeni, NULOVA_CENA, obsahKOdeslani, popisKroku, sectiCeny,
  textSCitacemi, type CenaVolani, type Cenik, type SpotrebaApi, type ZdrojKnihy, type ZdrojOdpovedi,
} from './chat.ts';

/** Výsledek textového nástroje (várky, výpočty, profil…) nejvýš takhle dlouhý. */
export const MAX_VYSLEDKU = 60_000;

export type ZpravaClauda = { model?: string | null; stop_reason: string | null; content: readonly unknown[]; usage: SpotrebaApi | null };
export type ZpravaApi = { role: 'user' | 'assistant'; content: unknown };

/**
 * Jedno volání Claude: `posledni` = už bez nástrojů (tool_choice none).
 * Průběžný text hlásí přes `text`, začátek webového hledání přes `hledaniNaWebu`.
 */
export type VolaniClauda = (
  p: { zpravy: readonly ZpravaApi[]; posledni: boolean },
  udalosti: { text: (kus: string) => void; hledaniNaWebu: () => void },
) => Promise<ZpravaClauda>;

export type Krok = { nastroj: string; popis: string; chyba?: true };
export type Udalost = Record<string, unknown> & { typ: string };

/** Rozpoznání chyb SDK (bez importu SDK): přerušení (čas), chyba API, nebo cizí chyba (null). */
export type RozpoznejChybu = (e: unknown) => { druh: 'preruseni' } | { druh: 'api'; status: number | undefined; typ: string | null | undefined } | null;

export type VysledekSmycky = {
  text: string;
  zdroje: ZdrojOdpovedi[];
  kroky: Krok[];
  neuplna: boolean;
  /** Proč je odpověď nedokončená (pro zprávu appce); null = dokončená. */
  duvod: 'delka' | 'odmitnuto' | 'cas' | 'strop' | 'kola' | 'api' | null;
  chybaClauda: { kod: string; zprava: string } | null;
  /** Dostal Claude odpověď až do konce (end_turn, max_tokens, refusal)? */
  dokoncena: boolean;
  cena: CenaVolani;
  volani: number;
  modelOdpovedi: string;
};

export const POZNAMKY = {
  delka: '(Odpověď je zkrácená — narazila na limit délky. Zeptej se užeji.)',
  odmitnuto: 'Claude na tuhle otázku odmítl odpovědět (bezpečnostní pravidla Anthropicu). Zkus ji položit jinak.',
  cas: '(Odpověď se nestihla dokončit v časovém limitu — zeptej se znovu nebo užeji.)',
  strop: '(Měsíční strop útraty za AI je vyčerpaný — zvýšit ho může správce ve Správě znalostí.)',
  kola: '(Došel počet kroků hledání — odpověď je z toho, co se stihlo najít.)',
} as const;

const textZpravy = (obsah: readonly unknown[]) => (obsah as { type?: unknown; text?: unknown }[])
  .filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('').trim();

export async function smyckaChatu(k: {
  zpravy: ZpravaApi[];
  volej: VolaniClauda;
  zavolej: (jmeno: string, args: Record<string, unknown>) => Promise<VysledekChatu>;
  posli: (u: Udalost) => void;
  rozpoznej: RozpoznejChybu;
  model: string;
  cenik: Cenik;
  strop: number;
  utraceno: number;
  ted?: () => number;
  /** Do logu jen druh chyby nástroje — nikdy text. */
  logChyby?: (nastroj: string, druh: string) => void;
}): Promise<VysledekSmycky> {
  const ted = k.ted ?? Date.now;
  const zacatek = ted();
  const zpravy = k.zpravy;
  const knihy = new Map<string, ZdrojKnihy>();
  const kroky: Krok[] = [];
  const mezitexty: string[] = [];
  let cena = NULOVA_CENA;
  let volani = 0;
  let modelOdpovedi = k.model;
  let konecna: ZpravaClauda | null = null;
  let rozpracovano = '';
  let duvod: VysledekSmycky['duvod'] = null;
  let chybaClauda: VysledekSmycky['chybaClauda'] = null;

  try {
    for (let kolo = 0; kolo < MAX_KOL && !konecna; kolo++) {
      if (k.utraceno + cena.cena >= k.strop) { duvod = 'strop'; break; }
      const posledni = kolo === MAX_KOL - 1 || ted() - zacatek > CAS_NA_NASTROJE_MS;
      rozpracovano = '';
      k.posli({ typ: 'premysli', kolo: kolo + 1 });
      const zprava = await k.volej({ zpravy, posledni }, {
        text: (kus) => { rozpracovano += kus; k.posli({ typ: 'text', text: kus }); },
        hledaniNaWebu: () => {
          const popis = popisKroku('web_search', {});
          kroky.push({ nastroj: 'web_search', popis });
          k.posli({ typ: 'krok', popis });
        },
      });
      volani += 1;
      modelOdpovedi = zprava.model || k.model;
      cena = sectiCeny(cena, cenaVolani(zprava.usage, modelOdpovedi, k.model, k.cenik));

      if (zprava.stop_reason === 'pause_turn') {
        // Webové hledání běží na straně API ve vlastní smyčce — pokračuje se stejnou zprávou.
        zpravy.push({ role: 'assistant', content: obsahKOdeslani(zprava.content) });
        continue;
      }
      if (zprava.stop_reason !== 'tool_use') {
        konecna = zprava;
        if (zprava.stop_reason === 'max_tokens') duvod = 'delka';
        if (zprava.stop_reason === 'refusal') duvod = 'odmitnuto';
        break;
      }

      // Kolo nástrojů: průběžný text byl jen úvod — appka ho schová do kroků.
      const uvod = textZpravy(zprava.content);
      if (uvod) mezitexty.push(uvod);
      k.posli({ typ: 'mezikrok' });
      const volaniNastroju = nastrojeKProvedeni(zprava.content) as { id: string; name: string; input?: unknown }[];
      if (volaniNastroju.length === 0) { konecna = zprava; break; }
      zpravy.push({ role: 'assistant', content: obsahKOdeslani(zprava.content) });
      const vysledky: Record<string, unknown>[] = [];
      for (const v of volaniNastroju) {
        const vstup = (v.input && typeof v.input === 'object' ? v.input : {}) as Record<string, unknown>;
        const krok: Krok = { nastroj: v.name, popis: popisKroku(v.name, vstup) };
        kroky.push(krok);
        k.posli({ typ: 'krok', popis: krok.popis });
        if (posledni) {
          vysledky.push({ type: 'tool_result', tool_use_id: v.id, is_error: true, content: 'Čas na hledání vypršel — odpověz z toho, co už máš.' });
          continue;
        }
        try {
          const vysledek = await k.zavolej(v.name, vstup);
          if ('text' in vysledek) {
            vysledky.push({ type: 'tool_result', tool_use_id: v.id, content: orizni(vysledek.text, MAX_VYSLEDKU) });
          } else {
            for (const z of vysledek.zdroje) if (!knihy.has(z.source)) knihy.set(z.source, z);
            vysledky.push({ type: 'tool_result', tool_use_id: v.id, content: vysledek.bloky });
          }
        } catch (e) {
          krok.chyba = true;
          if (!(e instanceof ChybaNastroje)) k.logChyby?.(v.name, e instanceof Error ? e.name : typeof e);
          vysledky.push({
            type: 'tool_result', tool_use_id: v.id, is_error: true,
            content: e instanceof ChybaNastroje ? e.message : 'Nástroj selhal (chyba databáze). Zkus jiný postup.',
          });
        }
      }
      if (ted() - zacatek > CAS_NA_NASTROJE_MS || kolo + 1 >= MAX_KOL - 1) {
        vysledky.push({ type: 'text', text: '(Čas na hledání vypršel — teď už napiš celou odpověď z toho, co máš.)' });
      }
      zpravy.push({ role: 'user', content: vysledky });
    }
    if (!konecna && !duvod) duvod = 'kola';
  } catch (e) {
    const druh = k.rozpoznej(e);
    if (!druh) throw e;
    if (druh.druh === 'preruseni') duvod = 'cas';
    else { chybaClauda = chybaApi(druh.status, druh.typ); duvod = 'api'; }
  }

  // Odpověď s citacemi [n] a zdroji; jinak aspoň to, co Claude stihl napsat.
  let { text, zdroje } = konecna ? textSCitacemi(konecna.content, knihy) : { text: '', zdroje: [] as ZdrojOdpovedi[] };
  if (!text && rozpracovano.trim()) text = rozpracovano.trim();
  if (!text && mezitexty.length > 0) text = mezitexty.join('\n\n');
  if (duvod === 'odmitnuto') { text = POZNAMKY.odmitnuto; zdroje = []; } else if (duvod && duvod !== 'api') text = text ? `${text}\n\n${POZNAMKY[duvod]}` : POZNAMKY[duvod];
  if (chybaClauda) text = text ? `${text}\n\n(${chybaClauda.zprava})` : chybaClauda.zprava;

  return {
    text, zdroje, kroky, neuplna: duvod !== null, duvod, chybaClauda, dokoncena: konecna !== null,
    cena, volani, modelOdpovedi,
  };
}
