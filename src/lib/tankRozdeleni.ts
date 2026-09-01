// 🛢️ Ze kterých tanků vzít pivo — a co když jeden dojde.
// ---------------------------------------------------------------------------
// Doplněné kegování z inventury dřív tank vůbec neodečítalo (cellar_tank_id
// null). Bylo to schválně — u dodatečně dohledaného stáčení nikdo neví, ze
// kterého tanku se stáčelo. Jenže důsledek byl horší než ten odhad: pivo z
// tanků odteklo, zápis chyběl, a tanky zůstaly nafouklé. Přesně z toho jsou
// rozdíly na Tanku 6 (−5400 l) a Spilce 1 (−2000 l).
//
// Tady se sudy rozpustí do tanků se STEJNÝM pivem. Když jeden dojde, plynule
// se pokračuje dalším — jako v provozu, kde se dostáčí z dalšího ležáku.
//
// Počítá se v CELÝCH sudech, ne v litrech: kegování se zapisuje po kusech a
// tank se 120 l dá dvě padesátky, ne dva a půl. Zbylých 20 l v tanku zůstane
// a další sud se načne z dalšího tanku.
//
// Žádný tank se nepřetáhne do záporu: co se nevejde, vrátí se jako
// `nepokrytoSudu`, ať je vidět, že na to pivo ve sklepě nebylo, místo aby si
// program tiše vymyslel zápornou ležáckou zásobu.

import { ZIVE_STAVY } from './tankKontrola';

/** Tank tak, jak ho potřebuje rozdělení. Odpovídá výřezu z CellarTank. */
export type TankProRozdeleni = {
  id: string;
  label: string;
  current_beer_id: string | null;
  current_volume_l: number | null;
  status?: string | null;
  started_at?: string | null;
  kegging_active?: boolean | null;
};

/** Kolik sudů vzít z konkrétního tanku. */
export type DilTanku = { tankId: string; label: string; sudy: number; litry: number };

export type RozdeleniSudu = {
  /** Odkud brát, v pořadí. Prázdné = ve sklepě není z čeho. */
  dily: DilTanku[];
  /** Sudy, na které tanky nestačily. 0 = pokryto celé. */
  nepokrytoSudu: number;
};

/**
 * Pořadí, ve kterém se tanky načínají.
 *
 * 1. Tank, ze kterého se právě stáčí (kegging_active) — v něm se pokračuje.
 * 2. Rozstáčené (`emptying`) před netknutými (`active`).
 * 3. Pak nejstarší napuštěný první: pivo, které leží nejdél, jde ven dřív.
 *    Prohodit to by znamenalo nechat starší ležák stát a to se v provozu
 *    nedělá.
 */
function poradi(a: TankProRozdeleni, b: TankProRozdeleni): number {
  const akt = (t: TankProRozdeleni) => (t.kegging_active ? 0 : 1);
  if (akt(a) !== akt(b)) return akt(a) - akt(b);
  const roz = (t: TankProRozdeleni) => (t.status === 'emptying' ? 0 : 1);
  if (roz(a) !== roz(b)) return roz(a) - roz(b);
  const st = (t: TankProRozdeleni) => t.started_at || '9999-12-31';
  if (st(a) !== st(b)) return st(a) < st(b) ? -1 : 1;
  return a.label.localeCompare(b.label, 'cs');
}

/** Živé tanky s daným pivem a nenulovým obsahem, v pořadí načínání. */
function vhodneTanky(tanky: TankProRozdeleni[], beerId: string): TankProRozdeleni[] {
  return tanky
    .filter((t) => t.current_beer_id === beerId)
    .filter((t) => t.status == null || ZIVE_STAVY.includes(t.status))
    .filter((t) => Number(t.current_volume_l) > 0)
    .sort(poradi);
}

/**
 * Rozdělí sudy mezi tanky se stejným pivem. Když tank dojde, pokračuje dalším.
 *
 * @param pocetSudu  kolik sudů se má zapsat
 * @param objemSuduL objem jednoho sudu (50, 30, …)
 */
export function rozdelSudyDoTanku(
  tanky: TankProRozdeleni[],
  beerId: string,
  pocetSudu: number,
  objemSuduL: number,
): RozdeleniSudu {
  if (!(pocetSudu > 0) || !(objemSuduL > 0) || !beerId) {
    return { dily: [], nepokrytoSudu: 0 };
  }

  const dily: DilTanku[] = [];
  let zbyva = Math.floor(pocetSudu);
  for (const t of vhodneTanky(tanky, beerId)) {
    if (zbyva <= 0) break;
    const vejdeSe = Math.floor(Number(t.current_volume_l) / objemSuduL);
    const sudy = Math.min(vejdeSe, zbyva);
    if (sudy <= 0) continue;
    dily.push({ tankId: t.id, label: t.label, sudy, litry: sudy * objemSuduL });
    zbyva -= sudy;
  }

  return { dily, nepokrytoSudu: zbyva };
}

/** Co udělat se stáčecím příznakem tanků po odečtu. */
export type ZmenaOtevreni = {
  /** Tanky, které odečtem došly — stáčení se na nich ukončí. */
  dojely: { tankId: string; label: string }[];
  /** Tank, na kterém se má stáčení otevřít. null = není z čeho. */
  otevrit: { tankId: string; label: string } | null;
};

/**
 * Když tank dojde, otevři nejbližší se stejným pivem.
 *
 * Stáčecí příznak (`kegging_active`) smí mít na jedno pivo jen jeden tank —
 * je to zdroj, ze kterého se odečítá běžné stáčení. Po odečtu tedy dojeté
 * tanky zavřeme a otevřeme první další v pořadí, který ještě něco má. Bez
 * toho by po vyprázdnění zůstal otevřený prázdný tank a stáčeč by musel ručně
 * hledat, ze kterého pokračovat.
 */
export function zmenaOtevreni(
  tanky: TankProRozdeleni[],
  beerId: string,
  rozdeleni: RozdeleniSudu,
): ZmenaOtevreni {
  const odecteno = new Map(rozdeleni.dily.map((d) => [d.tankId, d.litry]));
  const zbytek = (t: TankProRozdeleni) => Number(t.current_volume_l ?? 0) - (odecteno.get(t.id) ?? 0);

  const dojely = rozdeleni.dily
    .filter((d) => {
      const t = tanky.find((x) => x.id === d.tankId);
      return !!t && zbytek(t) <= 0.05;
    })
    .map((d) => ({ tankId: d.tankId, label: d.label }));

  // Pokud se žádného tanku netýkal odečet, není co přepínat — běžný stav
  // sklepa se nemá měnit jen proto, že se otevřela inventura.
  if (rozdeleni.dily.length === 0) return { dojely: [], otevrit: null };

  const zbyva = vhodneTanky(tanky, beerId).filter((t) => zbytek(t) > 0.05);
  const dalsi = zbyva[0];
  return {
    dojely,
    otevrit: dalsi ? { tankId: dalsi.id, label: dalsi.label } : null,
  };
}

/** Krátký popis do potvrzovacího dialogu: „Tank 3 — 28 ks (1 400 l)". */
export function popisRozdeleni(r: RozdeleniSudu): string {
  const cast = r.dily
    .map((d) => `${d.label} — ${d.sudy} ks (${d.litry.toLocaleString('cs-CZ')} l)`)
    .join('\n');
  if (r.nepokrytoSudu > 0) {
    const chybi = `${r.nepokrytoSudu} ks se zapíše bez tanku — na tolik piva sklep nestačí`;
    return cast ? `${cast}\n${chybi}` : chybi;
  }
  return cast;
}
