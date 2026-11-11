// 🍺 Porovnání várek jako tabulka (etapy 8 a 10): hodnoty po fázích, cíl
// receptury s odchylkou, odvozené hodnoty z výpočetního modulu a co chybí.
// Stejný výpočet (porovnejVarky) dává Claudovi nástroj porovnej_varky.
import {
  cislo, datumCesky, FAZE_VARKY, odchylka, porovnejVarky, type RecepturaZaznam, type VarkaZaznam,
} from '../../../bible/supabase/functions/_shared/varky-popisy.ts';

const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';

export function TabulkaPorovnani({ varky, receptury }: { varky: readonly VarkaZaznam[]; receptury: readonly RecepturaZaznam[] }) {
  const p = porovnejVarky(varky, receptury);
  const skupiny = [...FAZE_VARKY.map((f) => ({ id: f.id as string, nazev: f.nazev })), { id: 'odvozene', nazev: 'Spočítáno z hodnot (výpočetní modul)' }];
  return (
    <section className={`${KARTA} space-y-3`} aria-label="Porovnání várek">
      <h3 className="text-base font-black text-neutral-50">{p.varky.length === 1 ? 'Hodnoty várky' : `Porovnání ${p.varky.length} várek (od nejstarší)`}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-black text-neutral-300">
              <th scope="col" className="py-1 pr-3">Hodnota</th>
              {p.varky.map((v) => (
                <th key={v.id} scope="col" className="py-1 pr-3 align-bottom">
                  <span className="block text-neutral-50">{v.cislo ? `č. ${v.cislo}` : v.pivo}</span>
                  <span className="block font-semibold">{datumCesky(v.datum_varu)}</span>
                </th>
              ))}
            </tr>
          </thead>
          {skupiny.map((s) => {
            const radky = p.radky.filter((r) => r.faze === s.id);
            if (radky.length === 0) return null;
            return (
              <tbody key={s.id}>
                <tr><th colSpan={p.varky.length + 1} scope="rowgroup" className="pt-3 pb-1 text-left text-xs font-black uppercase tracking-wide text-amber-300">{s.nazev}</th></tr>
                {radky.map((r) => (
                  <tr key={r.klic} className="border-t border-neutral-800">
                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-neutral-300">{r.nazev}{r.jednotka ? ` (${r.jednotka})` : ''}</th>
                    {r.hodnoty.map((h, i) => {
                      const o = odchylka(h, r.cile[i], r.mist);
                      return (
                        <td key={i} className="py-1 pr-3 tabular-nums">
                          {h === null ? <span className="text-neutral-400" title="nezapsáno">—</span> : <span className="font-bold text-neutral-50">{cislo(h, r.mist)}</span>}
                          {o !== null && <span className="block text-xs font-semibold text-amber-300">cíl {cislo(r.cile[i]!, r.mist)} · {o}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {p.chybi.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wide text-neutral-300">Chybí (nezapsáno — nic se nedomýšlí)</h4>
          <ul className="list-disc pl-5 text-sm text-neutral-100 space-y-0.5">
            {p.chybi.map((c) => <li key={c.varka}><span className="font-bold">{c.varka}:</span> {c.polozky.join('; ')}</li>)}
          </ul>
        </div>
      )}
      {p.nespocitano.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-neutral-100 space-y-0.5" aria-label="Nejde spočítat">
          {p.nespocitano.map((n) => <li key={n.nazev}><span className="font-bold">{n.nazev}:</span> {n.duvod}</li>)}
        </ul>
      )}
      {p.poznamky.length > 0 && (
        <ul className="list-disc pl-5 text-xs font-semibold text-neutral-300 space-y-0.5" aria-label="Jak se počítalo">
          {p.poznamky.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <p className="text-xs font-semibold text-neutral-300">
        Příčiny odchylek: v aplikaci Claude s konektorem Pivovarská bible napiš třeba „porovnej posledních 5 várek a najdi, proč se liší výtěžek" — Claude vezme tyhle údaje, profil pivovaru a knihy a příčiny označí jako hypotézy.
      </p>
    </section>
  );
}
