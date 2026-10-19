// Malý modul bez závislostí — stačí na zjištění „jsem přepnutý na jiný účet?“ při startu aplikace,
// ať se těžší část (lib/prepinaniUctu.ts) nenatahuje do hlavního kusu.
import { nactiJson } from './uloziste';

export const KLIC_UCTU = 'zajic_ucty_v1';

export type UlozenyUcet = { email: string; access_token: string; refresh_token: string };
export type StavUctu = {
  /** Účet správce, ke kterému je „Zpět“ (první, ze kterého se přidávalo). */
  domaci: string | null;
  ucty: Record<string, UlozenyUcet>;
};

export function nactiUcty(): StavUctu {
  const s = nactiJson<StavUctu>(KLIC_UCTU, { domaci: null, ucty: {} });
  return { domaci: s?.domaci ?? null, ucty: s?.ucty && typeof s.ucty === 'object' ? s.ucty : {} };
}


/** Je u přihlášeného účtu k dispozici „Zpět na správce“? (přepnul jsem se na jiný účet než domácí) */
export function jePrepnutyUcet(userId: string | null | undefined): boolean {
  const s = nactiUcty();
  return !!userId && !!s.domaci && s.domaci !== userId && !!s.ucty[s.domaci];
}

