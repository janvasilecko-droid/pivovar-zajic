// 🧺 Obchod → Přidat zboží: výběr dlaždicemi.
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „přidat zboží udělej jako dlaždice: jednotlivý piva,
// půllitry, kosmetika — zatím ty, co jsou na té výdejce". Skupiny jsou dlaždice,
// v nich dlaždice zboží; volí se jich víc najednou a přidají se jedním klepnutím.
// Co v nabídce není, jde přidat ručně (PridatZbozi).
import { useMemo, useState } from 'react';
import { ArrowLeft, Beer, Check, GlassWater, Plus, ShoppingBasket, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from '../ui';
import { chyba as toastChyba, uspech } from '../../lib/toast';
import { pridejZboziZDlazdic, type DataObchodu } from '../../lib/obchodData';
import {
  SKUPINY, dlazdiceSkupiny, jeVolitelna, zapisZDlazdic, type Dlazdice, type SkupinaZbozi,
} from '../../lib/obchodKatalog';

const IKONY: Record<SkupinaZbozi, LucideIcon> = {
  piva: Beer,
  pullitry: GlassWater,
  kosmetika: Sparkles,
  ostatni: ShoppingBasket,
};
/** Barva okraje podle skupiny — ať se na první pohled liší (jako dlaždice na ploše). */
const OKRAJ: Record<SkupinaZbozi, string> = {
  piva: '!border-amber-400',
  pullitry: '!border-sky-400',
  kosmetika: '!border-rose-300',
  ostatni: '!border-neutral-400',
};

const kc = (n: number) => `${n} Kč`;

function popisDlazdice(d: Dlazdice): { titulek: string; podtitulek: string; poznamka?: string } {
  const { polozka, stav } = d;
  const kod = `kód ${polozka.kod} · ${kc(polozka.cena)}`;
  if (d.pivo && d.obal && (stav === 'nove' || stav === 'obsazeno')) {
    return {
      titulek: d.pivo.name,
      podtitulek: `${d.obal.label} · ${kod}`,
      poznamka: stav === 'obsazeno' ? `Už je v obchodě jako: ${d.obsazenoKym}` : undefined,
    };
  }
  switch (stav) {
    case 'v_obchode': return { titulek: polozka.nazev, podtitulek: kod, poznamka: '✓ už v obchodě' };
    case 'vypnute': return { titulek: polozka.nazev, podtitulek: kod, poznamka: 'vypnuté — zvolením se zase zapne' };
    case 'chybi_katalog': return { titulek: polozka.nazev, podtitulek: kod, poznamka: 'V katalogu chybí pivo nebo obal — přidej ručně' };
    case 'obsazeno': return { titulek: polozka.nazev, podtitulek: kod, poznamka: `Už je v obchodě jako: ${d.obsazenoKym}` };
    default: return { titulek: polozka.nazev, podtitulek: kod };
  }
}

export function PridatZboziDlazdice({ data, zapsal, onClose, onUlozeno, onRucne }: {
  data: DataObchodu;
  zapsal: string | null;
  onClose: () => void;
  onUlozeno: () => void;
  /** Otevře ruční zadání zboží, které v nabídce není. */
  onRucne: () => void;
}) {
  const dlazdice = useMemo(() => dlazdiceSkupiny(data.zbozi, data.piva, data.obaly), [data.zbozi, data.piva, data.obaly]);
  const [skupina, setSkupina] = useState<SkupinaZbozi | null>(null);
  const [vybrano, setVybrano] = useState<Set<string>>(new Set());
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);

  const vsechny = useMemo(() => SKUPINY.flatMap((s) => dlazdice[s.id]), [dlazdice]);
  const zvolene = vsechny.filter((d) => vybrano.has(d.polozka.kod) && jeVolitelna(d));

  function prepni(kod: string) {
    setVybrano((v) => {
      const n = new Set(v);
      if (n.has(kod)) n.delete(kod); else n.add(kod);
      return n;
    });
  }
  function vyberVseNove(s: SkupinaZbozi) {
    setVybrano((v) => {
      const n = new Set(v);
      for (const d of dlazdice[s]) if (jeVolitelna(d)) n.add(d.polozka.kod);
      return n;
    });
  }
  function zrusVyber(s: SkupinaZbozi) {
    setVybrano((v) => {
      const n = new Set(v);
      for (const d of dlazdice[s]) n.delete(d.polozka.kod);
      return n;
    });
  }

  async function pridej() {
    if (zvolene.length === 0) return;
    setUklada(true);
    setChyba(null);
    try {
      const zapis = zapisZDlazdic(zvolene);
      const e = await pridejZboziZDlazdic(zapis, zapsal);
      if (e) { setChyba(e); return; }
      uspech(`Přidáno do obchodu: ${zapis.nove.length + zapis.zapnout.length} zboží.`);
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  const aktualni = skupina ? SKUPINY.find((s) => s.id === skupina)! : null;

  return (
    <Modal open onClose={onClose} title="Přidat zboží do obchodu">
      <div className="space-y-3">
        {!aktualni && (
          <>
            <div className="text-sm font-semibold text-neutral-700">
              Vyber skupinu a klepni na zboží, které se v obchodě prodává. Je tu připravené zboží z účtenky „Sumář prodeje" z pokladny.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SKUPINY.map((s) => {
                const Ikona = IKONY[s.id];
                const nove = dlazdice[s.id].filter(jeVolitelna).length;
                const zvoleno = dlazdice[s.id].filter((d) => vybrano.has(d.polozka.kod) && jeVolitelna(d)).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn-ghost !rounded-xl !border-2 ${OKRAJ[s.id]} !min-h-[104px] flex flex-col items-center justify-center gap-1 text-center`}
                    onClick={() => setSkupina(s.id)}
                  >
                    <Ikona size={28} />
                    <span className="text-base font-black text-neutral-950">{s.nazev}</span>
                    <span className="text-[11px] font-semibold text-neutral-600">{s.popis}</span>
                    <span className="text-xs font-black text-neutral-800">
                      {zvoleno > 0 ? `✓ zvoleno ${zvoleno}` : nove > 0 ? `${nove} k přidání` : 'vše už je v obchodě'}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {aktualni && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" onClick={() => setSkupina(null)}>
                <ArrowLeft size={14} /> Skupiny
              </button>
              <h3 className="text-base font-black text-neutral-950">{aktualni.nazev}</h3>
              <div className="flex gap-1.5">
                <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => vyberVseNove(aktualni.id)}>Vybrat všechno nové</button>
                <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => zrusVyber(aktualni.id)}>Zrušit výběr</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {dlazdice[aktualni.id].map((d) => {
                const p = popisDlazdice(d);
                const volitelna = jeVolitelna(d);
                const zvolena = vybrano.has(d.polozka.kod) && volitelna;
                return (
                  <button
                    key={d.polozka.kod}
                    type="button"
                    disabled={!volitelna}
                    aria-pressed={volitelna ? zvolena : undefined}
                    className={`btn-ghost !rounded-xl !border-2 ${zvolena ? '!border-primary-600 !bg-primary-50' : OKRAJ[aktualni.id]} !min-h-[88px] !items-start flex flex-col justify-between gap-1 text-left relative ${volitelna ? '' : 'opacity-60'}`}
                    onClick={() => prepni(d.polozka.kod)}
                  >
                    {zvolena && <Check size={18} className="absolute top-2 right-2 text-primary-700" />}
                    <span className="text-sm font-black text-neutral-950 leading-tight pr-5">{p.titulek}</span>
                    <span className="text-[11px] font-semibold text-neutral-700">{p.podtitulek}</span>
                    {p.poznamka && <span className="text-[11px] font-bold text-neutral-800">{p.poznamka}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {chyba && <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">{chyba}</div>}

        <div className="sticky -bottom-6 -mx-6 -mb-6 px-6 pt-3 pb-6 bg-white border-t border-neutral-100 space-y-2">
          <button type="button" className="btn-primary !rounded min-h-[48px] w-full" disabled={zvolene.length === 0 || uklada} onClick={() => void pridej()}>
            {uklada ? 'Ukládám…' : zvolene.length === 0 ? 'Přidat vybrané' : `Přidat vybrané (${zvolene.length})`}
          </button>
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" onClick={onRucne}>
              <Plus size={13} /> Jiné zboží — zadat ručně
            </button>
            <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={onClose}>Zrušit</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
