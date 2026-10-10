// 🧾 Obchod → Uzávěrky: zadání uzávěrky z pokladny a seznam už zapsaných.
// ---------------------------------------------------------------------------
// Volba typu (denní / týdenní / měsíční) je hned u tlačítka — z provozu
// 10. 10. 2026: „volba zadat uzávěrku denní, týdenní, měsíční". Smazání
// uzávěrky vrátí kusy do skladu obchodu (stav se počítá, neukládá).
import { useMemo, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, Receipt, Trash2 } from 'lucide-react';
import { EmptyState } from '../ui';
import { chyba as toastChyba, potvrd, uspech } from '../../lib/toast';
import { castkaRadku } from '../../lib/obchodStatistika';
import { NAZVY_TYPU, type TypUzaverky } from '../../lib/obchodSklad';
import { smazUzaverku, type DataObchodu } from '../../lib/obchodData';
import { UzaverkaImport } from './UzaverkaImport';
import { MezeryUzaverek, ZavrenoDny, typProMezeru, useMezery } from './ObchodMezery';

const kc = (n: number) => `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(n)} Kč`;
const dat = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;
const bezRoku = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
// Ve stejném roce se rok píše jen jednou („1. 10. – 7. 10. 2026"), ať se období vejde na telefon.
const obdobi = (od: string, do_: string) => {
  if (od === do_) return dat(od);
  return od.slice(0, 4) === do_.slice(0, 4) ? `${bezRoku(od)} – ${dat(do_)}` : `${dat(od)} – ${dat(do_)}`;
};

export function ObchodUzaverky({ data, zapsal }: { data: DataObchodu; zapsal: string | null }) {
  const [import_, setImport] = useState<{ typ: TypUzaverky | null; obdobi?: { od: string; do: string } } | null>(null);
  const mezery = useMezery(data);
  const [otevreno, setOtevreno] = useState<string | null>(null);
  const zbozi = useMemo(() => new Map(data.zbozi.map((z) => [z.kod, z])), [data.zbozi]);

  async function smaz(id: string, popis: string) {
    if (!(await potvrd(`Smazat uzávěrku ${popis}? Prodané kusy se vrátí do skladu obchodu.`, { titulek: 'Smazat uzávěrku', potvrdit: 'Smazat' }))) return;
    const e = await smazUzaverku(id);
    if (e) { toastChyba(e); return; }
    uspech('Uzávěrka smazána, sklad obchodu se přepočítal.');
    data.znovu();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-neutral-200 bg-white p-3 space-y-2">
        <div className="text-sm font-black text-neutral-900">Zadat uzávěrku z pokladny</div>
        <div className="flex flex-wrap gap-2">
          {(['denni', 'tydenni', 'mesicni'] as TypUzaverky[]).map((t) => (
            <button
              key={t}
              type="button"
              className="btn-primary !rounded flex items-center gap-1.5 min-h-[48px]"
              onClick={() => setImport({ typ: t })}
            >
              <Camera size={16} /> {NAZVY_TYPU[t]}
            </button>
          ))}
        </div>
        <div className="text-[11px] font-semibold text-neutral-600">
          Vyfoť účtenku „Sumář prodeje" — appka přečte zboží a množství, zkontroluje čísla a odečte prodej ze skladu obchodu.
        </div>
      </div>

      <MezeryUzaverek
        data={data}
        zapsal={zapsal}
        mezery={mezery}
        zadejUzaverku={(m) => setImport({ typ: typProMezeru(m), obdobi: { od: m.od, do: m.do } })}
      />

      {data.uzaverky.length === 0 ? (
        <EmptyState icon={Receipt} text="Zatím tu není žádná uzávěrka. Vyfoť první — zboží z ní se založí v obchodě." />
      ) : (
        <ul className="space-y-2">
          {data.uzaverky.map((u) => {
            const radky = data.radky.filter((r) => r.uzaverka_id === u.id);
            const trzba = radky.length ? radky.reduce((a, r) => a + castkaRadku(r), 0) : Number(u.trzba ?? 0);
            const popis = `${u.cislo ? `č. ${u.cislo}, ` : ''}${obdobi(u.datum_od, u.datum_do)}`;
            const rozbalena = otevreno === u.id;
            return (
              <li key={u.id} className="rounded-xl border-2 border-neutral-200 bg-white">
                <button type="button" className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOtevreno(rozbalena ? null : u.id)} aria-expanded={rozbalena}>
                  <span className="chip bg-primary-100 text-primary-900 font-black shrink-0">{NAZVY_TYPU[u.typ] ?? u.typ}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-neutral-950 break-words">{obdobi(u.datum_od, u.datum_do)}</div>
                    <div className="text-[11px] font-semibold text-neutral-600">
                      {u.cislo ? `č. ${u.cislo} · ` : ''}{radky.length} položek{u.zapsal ? ` · zapsal ${u.zapsal}` : ''}
                    </div>
                  </div>
                  <div className="text-base font-black tabular-nums text-neutral-950">{kc(trzba)}</div>
                  {rozbalena ? <ChevronUp size={18} className="shrink-0 text-neutral-500" /> : <ChevronDown size={18} className="shrink-0 text-neutral-500" />}
                </button>
                {rozbalena && (
                  <div className="border-t border-neutral-200 p-3 space-y-2">
                    <ul className="space-y-0.5">
                      {radky.map((r, i) => (
                        <li key={`${r.kod}-${i}`} className="flex justify-between gap-2 text-xs font-semibold text-neutral-800">
                          <span className="truncate">
                            <span className="text-neutral-500">{r.kod}</span> {zbozi.get(r.kod)?.nazev ?? r.nazev}
                          </span>
                          <span className="font-black tabular-nums shrink-0">{String(r.mnozstvi).replace('.', ',')}× · {kc(castkaRadku(r))}</span>
                        </li>
                      ))}
                    </ul>
                    {u.poznamka && <div className="text-xs text-neutral-600">Poznámka: {u.poznamka}</div>}
                    <button type="button" className="btn-danger !rounded !py-1.5 text-xs font-bold flex items-center gap-1" onClick={() => void smaz(u.id, popis)}>
                      <Trash2 size={13} /> Smazat uzávěrku
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ZavrenoDny data={data} />

      {import_ && (
        <UzaverkaImport
          data={data}
          zapsal={zapsal}
          vychoziTyp={import_.typ}
          vychoziObdobi={import_.obdobi}
          onClose={() => setImport(null)}
          onUlozeno={data.znovu}
        />
      )}
    </div>
  );
}
