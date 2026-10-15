// ✏️ Úpravy stáčení lahví z tabulky přehledu — provedení plánu zápisu.
// ---------------------------------------------------------------------------
// Co se má zapsat, když se v tabulce přepíše číslo, říkají čisté funkce
// z lib/prehledStaceniTabulka.ts (`plan…`). Tady se plán jen provede proti
// databázi, upraví se seznam na obrazovce a u mazání se nabídne „Vrátit zpět".
//
// Každá změna je JEDEN příkaz do databáze (update / insert / delete přes
// `in('id', …)`), takže se nikdy nezapíše napůl: buď se změní všechny záznamy
// šarže, nebo žádný.
import type { Dispatch, SetStateAction } from 'react';
import { supabase, type Beer, type EntryRow, type Package } from './supabase';
import { chyba, potvrd, toastZpet } from './toast';
import { zavibruj } from './haptika';
import { podezreleMnozstvi } from './kontrolaZadani';
import {
  celeCislo, klicObjemu, planDatumPivo, planLahve, planSmazaniRadku, planSudy, popisObjemu,
  type KontextPlanu, type Plan, type RadekTabulky,
} from './prehledStaceniTabulka';

/** Přidá záznamy, které v seznamu ještě nejsou (po přenačtení tam mohly být dřív). */
const pridej = (rs: EntryRow[], nove: EntryRow[], nazacatek = false): EntryRow[] => {
  const mam = new Set(rs.map((r) => r.id));
  const doplnit = nove.filter((n) => !mam.has(n.id));
  return nazacatek ? [...doplnit, ...rs] : [...rs, ...doplnit];
};

export function upravyStaceni({ rows, setRows, packages, beers, getBatchId, nacti }: {
  rows: EntryRow[];
  setRows: Dispatch<SetStateAction<EntryRow[]>>;
  packages: Package[];
  beers: Beer[];
  getBatchId: (r: EntryRow) => string;
  /** Přenačíst seznam z databáze (tiše). */
  nacti: (tise?: boolean) => unknown;
}) {
  const ctx = (): KontextPlanu => ({ zaznamy: rows, obaly: packages, getBatchId });

  /** Provede plán. Vrací true, když je hotovo (i když nebylo co měnit). */
  async function proved(plan: Plan): Promise<boolean> {
    if (!plan.ok) { chyba(plan.zprava); return false; }
    const op = plan.operace;
    if (!op) return true;

    if (op.typ === 'update') {
      const { error } = await supabase.from('bottling').update(op.zmena).in('id', op.ids);
      if (error) { chyba('Uložení se nepovedlo: ' + error.message); return false; }
      setRows((rs) => rs.map((r) => (op.ids.includes(r.id) ? { ...r, ...op.zmena } : r)));
      return true;
    }

    if (op.typ === 'insert') {
      const { data, error } = await supabase.from('bottling').insert(op.radky).select('*');
      if (error) { chyba('Uložení se nepovedlo: ' + error.message); return false; }
      if (Array.isArray(data) && data.length) setRows((rs) => pridej(rs, data as EntryRow[]));
      nacti(true);
      return true;
    }

    // Smazání: záznamy se vrátí zpět stejným insertem, i s původním id.
    const ids = op.zaznamy.map((z) => z.id);
    const { error } = await supabase.from('bottling').delete().in('id', ids);
    if (error) { chyba('Smazání se nepovedlo: ' + error.message); return false; }
    setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
    zavibruj('odskrtnuto');
    toastZpet(plan.popis, async () => {
      const { error: chybaVraceni } = await supabase.from('bottling').insert(op.zaznamy);
      if (chybaVraceni) throw chybaVraceni;
      setRows((rs) => pridej(rs, op.zaznamy, true));
      nacti(true);
    });
    return true;
  }

  /** Přepsané číslo v buňce lahví. */
  async function upravLahve(radek: RadekTabulky, objem: number, text: string): Promise<boolean> {
    const plan = planLahve(radek, objem, text, ctx());
    // Přehmat o řád (44 → 440) se jinak najde až u inventury — stejná kontrola
    // jako při zápisu stáčení. Neblokuje, jen se zeptá.
    if (plan.ok && plan.operace && plan.operace.typ !== 'delete') {
      const obal = packages.find((p) => p.kind === 'bottle' && klicObjemu(p.volume_l) === klicObjemu(objem));
      const historie = rows
        .filter((x) => x.beer_id === radek.beerId && !!obal && x.package_id === obal.id)
        .map((x) => Number(x.quantity || 0));
      const dotaz = podezreleMnozstvi(celeCislo(text) ?? 0, historie, `${radek.beerName} · ${popisObjemu(objem)}`);
      if (dotaz && !(await potvrd(dotaz, { titulek: 'Zkontrolujte množství', potvrdit: 'Ano, uložit' }))) return false;
    }
    return proved(plan);
  }

  /** Přepsané číslo v buňce sudů. */
  async function upravSudy(radek: RadekTabulky, objem: number, text: string): Promise<boolean> {
    return proved(planSudy(radek, objem, text, ctx()));
  }

  function smazRadek(radek: RadekTabulky): Promise<boolean> {
    return proved(planSmazaniRadku(radek));
  }

  function upravDatumPivo(radek: RadekTabulky, zmena: { datum: string; beerId: string }): Promise<boolean> {
    return proved(planDatumPivo(radek, zmena, beers, ctx()));
  }

  return { upravLahve, upravSudy, smazRadek, upravDatumPivo };
}
