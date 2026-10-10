// 🏪 Obchod → Sklad: co je v obchodě, co dochází, co chybí zapsat.
// ---------------------------------------------------------------------------
// Sklad obchodu se počítá (lib/obchodSklad.ts): poslední inventura + fasování
// a příjmy − prodej z uzávěrek. Tady se ukazuje a hlídá — záporný stav
// a stav pod nastaveným minimem svítí nahoře.
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardCheck, PackageMinus, PackagePlus, Plus, Receipt } from 'lucide-react';
import { EmptyState } from '../ui';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, potvrd, uspech } from '../../lib/toast';
import {
  dnyZasoby, fasovaniBezZbozi, pohybyZbozi, prumernyDenniProdej, stavySkladu, varovaniZasob, type StavZbozi,
} from '../../lib/obchodSklad';
import { inventuraObchoduChybi } from '../../lib/obchodInventura';
import { smazOdpis, smazPrijem, upravZbozi, type DataObchodu } from '../../lib/obchodData';
import { OdpisZbozi, PrijemZbozi, PridatZbozi } from './ZboziOkna';
import { UpozorneniMezery, UpozorneniPresInventuru, useMezery, usePresInventuru } from './ObchodMezery';
import type { ObchodTab } from '../../screens/ObchodScreen';

const nazvyMesicu = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const mesicText = (m: string) => `${nazvyMesicu[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const cs = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const datumKratce = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export function ObchodPrehled({ data, zapsal, jdiNa }: {
  data: DataObchodu;
  zapsal: string | null;
  jdiNa: (tab: ObchodTab) => void;
}) {
  const dnes = businessDateISO();
  const stavy = useMemo(() => stavySkladu(data.vstup, dnes), [data.vstup, dnes]);
  const varovani = useMemo(() => varovaniZasob(stavy), [stavy]);
  const bezZbozi = useMemo(() => fasovaniBezZbozi(data.vstup), [data.vstup]);
  const upozorneniInventury = inventuraObchoduChybi(data.inventury, dnes);
  const bezInventury = stavy.filter((s) => s.stav == null);
  const zboziPodleKodu = useMemo(() => new Map(data.zbozi.map((z) => [z.kod, z])), [data.zbozi]);

  const [otevreno, setOtevreno] = useState<string | null>(null);
  const [prijem, setPrijem] = useState<{ kod?: string } | null>(null);
  const [odpis, setOdpis] = useState<{ kod?: string } | null>(null);
  const mezery = useMezery(data);
  const presInventuru = usePresInventuru(data);
  const [pridat, setPridat] = useState<{ beerId?: string; pkgId?: string } | null>(null);

  const piva = stavy.filter((s) => zboziPodleKodu.get(s.kod)?.beer_id);
  const ostatni = stavy.filter((s) => !zboziPodleKodu.get(s.kod)?.beer_id);

  if (data.zbozi.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={Receipt}
          text="V obchodě zatím není žádné zboží. Vznikne z první uzávěrky z pokladny (zboží se pozná podle kódu), nebo se dá přidat ručně."
          akce={{ popis: 'Zadat uzávěrku', onClick: () => jdiNa('uzaverky') }}
        />
        <div className="text-center">
          <button type="button" className="btn-ghost !rounded text-sm font-bold" onClick={() => setPridat({})}>
            <Plus size={14} className="inline mr-1" /> Přidat zboží ručně
          </button>
        </div>
        {pridat && <PridatZbozi data={data} zapsal={zapsal} vychozi={pridat} onClose={() => setPridat(null)} onUlozeno={data.znovu} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Co je potřeba udělat nebo pohlídat */}
      {bezInventury.length > 0 && (
        <div role="note" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 flex items-start gap-2 text-amber-950">
          <ClipboardCheck size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-bold">
            {bezInventury.length === stavy.length
              ? 'Obchod ještě nemá počáteční stav. Napočítej zboží v Inventuře — od ní se sklad počítá.'
              : `${bezInventury.length} ${bezInventury.length === 1 ? 'zboží nemá' : 'zboží nemá'} napočítaný stav (v seznamu níže „bez inventury").`}
            <div>
              <button type="button" className="btn-primary !rounded !py-1.5 mt-2 text-xs" onClick={() => jdiNa('inventura')}>Udělat inventuru</button>
            </div>
          </div>
        </div>
      )}

      <UpozorneniPresInventuru uzaverky={presInventuru} />

      <UpozorneniMezery mezery={mezery} jdiNaUzaverky={() => jdiNa('uzaverky')} />

      {upozorneniInventury && (
        <div role="alert" className={`rounded-xl border-2 p-3 flex items-start gap-2 ${upozorneniInventury.naleha ? 'border-rose-500 bg-rose-50 text-rose-950' : 'border-amber-400 bg-amber-50 text-amber-950'}`}>
          <ClipboardCheck size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-bold">
            {upozorneniInventury.naleha ? 'Chybí inventura obchodu za' : 'Blíží se konec měsíce — udělej inventuru obchodu za'} {mesicText(upozorneniInventury.mesic)}.
            <div>
              <button type="button" className="btn-primary !rounded !py-1.5 mt-2 text-xs" onClick={() => jdiNa('inventura')}>Udělat inventuru</button>
            </div>
          </div>
        </div>
      )}

      {bezZbozi.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 space-y-2 text-rose-950">
          <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Nafasováno do obchodu, ale zboží tu chybí</div>
          <ul className="space-y-1.5">
            {bezZbozi.map((b) => (
              <li key={`${b.beer_id}|${b.package_id}`} className="flex items-center justify-between gap-2 text-xs font-bold">
                <span>
                  {data.piva.find((p) => p.id === b.beer_id)?.name ?? 'pivo'} · {data.obaly.find((o) => o.id === b.package_id)?.label ?? 'obal'} — {cs(b.ks)} ks (naposledy {datumKratce(b.poslednDatum)})
                </span>
                <button type="button" className="btn-primary !rounded !py-1 text-xs shrink-0" onClick={() => setPridat({ beerId: b.beer_id, pkgId: b.package_id })}>Přidat zboží</button>
              </li>
            ))}
          </ul>
          <div className="text-[11px] font-semibold">Dokud zboží nemá kód z pokladny, kusy se do skladu obchodu nepřipíšou.</div>
        </div>
      )}

      {varovani.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-rose-500 bg-rose-50 p-3 space-y-1.5 text-rose-950">
          <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Hlídání zásob</div>
          <ul className="space-y-1">
            {varovani.map((v) => (
              <li key={v.kod} className="text-xs font-bold flex flex-wrap items-center gap-x-2">
                <span className="font-black">{v.nazev}</span>
                <span>
                  {v.druh === 'zaporny' && `stav ${cs(v.stav)} — prodalo se víc, než se naskladnilo (chybí fasování nebo příjem)`}
                  {v.druh === 'nula' && `vyprodáno (minimum ${cs(v.min ?? 0)})`}
                  {v.druh === 'pod_minimem' && `zbývá ${cs(v.stav)}, minimum ${cs(v.min ?? 0)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost !rounded text-sm font-bold flex items-center gap-1.5" onClick={() => setPrijem({})}>
          <PackagePlus size={15} /> Příjem zboží
        </button>
        <button type="button" className="btn-ghost !rounded text-sm font-bold flex items-center gap-1.5" onClick={() => setOdpis({})}>
          <PackageMinus size={15} /> Odpis
        </button>
        <button type="button" className="btn-ghost !rounded text-sm font-bold flex items-center gap-1.5" onClick={() => setPridat({})}>
          <Plus size={15} /> Přidat zboží
        </button>
        <button type="button" className="btn-ghost !rounded text-sm font-bold flex items-center gap-1.5" onClick={() => jdiNa('fasovani')}>
          Fasovat do obchodu
        </button>
      </div>

      <Sekce nadpis="Piva" polozky={piva} {...{ data, otevreno, setOtevreno, zapsal, dnes, otevriPrijem: (kod) => setPrijem({ kod }), otevriOdpis: (kod) => setOdpis({ kod }) }} />
      <Sekce nadpis="Ostatní zboží" polozky={ostatni} {...{ data, otevreno, setOtevreno, zapsal, dnes, otevriPrijem: (kod) => setPrijem({ kod }), otevriOdpis: (kod) => setOdpis({ kod }) }} />

      {prijem && <PrijemZbozi data={data} zapsal={zapsal} kodVychozi={prijem.kod} onClose={() => setPrijem(null)} onUlozeno={data.znovu} />}
      {odpis && <OdpisZbozi data={data} zapsal={zapsal} kodVychozi={odpis.kod} onClose={() => setOdpis(null)} onUlozeno={data.znovu} />}
      {pridat && <PridatZbozi data={data} zapsal={zapsal} vychozi={pridat} onClose={() => setPridat(null)} onUlozeno={data.znovu} />}
    </div>
  );
}

function Sekce({ nadpis, polozky, data, otevreno, setOtevreno, zapsal, dnes, otevriPrijem, otevriOdpis }: {
  nadpis: string;
  polozky: StavZbozi[];
  data: DataObchodu;
  otevreno: string | null;
  setOtevreno: (k: string | null) => void;
  zapsal: string | null;
  dnes: string;
  otevriPrijem: (kod: string) => void;
  otevriOdpis: (kod: string) => void;
}) {
  if (polozky.length === 0) return null;
  return (
    <section className="space-y-1.5" aria-label={nadpis}>
      <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">{nadpis} ({polozky.length})</h3>
      <ul className="space-y-1.5">
        {polozky.map((s) => (
          <Polozka key={s.kod} s={s} data={data} otevreno={otevreno === s.kod} prepni={() => setOtevreno(otevreno === s.kod ? null : s.kod)} zapsal={zapsal} dnes={dnes} otevriPrijem={otevriPrijem} otevriOdpis={otevriOdpis} />
        ))}
      </ul>
    </section>
  );
}

function Polozka({ s, data, otevreno, prepni, zapsal, dnes, otevriPrijem, otevriOdpis }: {
  s: StavZbozi;
  data: DataObchodu;
  otevreno: boolean;
  prepni: () => void;
  zapsal: string | null;
  dnes: string;
  otevriPrijem: (kod: string) => void;
  otevriOdpis: (kod: string) => void;
}) {
  const zbozi = data.zbozi.find((z) => z.kod === s.kod);
  const [min, setMin] = useState(s.min == null ? '' : String(s.min));
  const [nazev, setNazev] = useState(s.nazev);
  const [uklada, setUklada] = useState(false);

  const prumer = prumernyDenniProdej(s.kod, data.uzaverky, data.radky, dnes);
  const dny = dnyZasoby(s.stav, prumer);
  const pod = s.stav != null && s.min != null && s.min > 0 && s.stav < s.min;
  const spatny = s.stav != null && (s.stav < 0 || pod);

  async function uloz(zmena: Parameters<typeof upravZbozi>[1]) {
    setUklada(true);
    try {
      const e = await upravZbozi(s.kod, zmena, zapsal);
      if (e) toastChyba(e); else { uspech('Uloženo.'); data.znovu(); }
    } finally {
      setUklada(false);
    }
  }

  async function smazZapis(p: { id?: string; druh: string; datum: string; ks: number }) {
    if (!p.id) return;
    const co = p.druh === 'odpis' ? 'odpis' : 'příjem';
    if (!(await potvrd(`Smazat ${co} ${cs(Math.abs(p.ks))} ks z ${datumKratce(p.datum)}? Sklad obchodu se přepočítá.`, { titulek: `Smazat ${co}`, potvrdit: 'Smazat' }))) return;
    const e = p.druh === 'odpis' ? await smazOdpis(p.id) : await smazPrijem(p.id);
    if (e) { toastChyba(e); return; }
    uspech('Smazáno, sklad obchodu se přepočítal.');
    data.znovu();
  }

  return (
    <li className={`rounded-xl border-2 bg-white ${spatny ? 'border-rose-400' : 'border-neutral-200'}`}>
      <button type="button" className="w-full flex items-center gap-3 p-3 text-left" onClick={prepni} aria-expanded={otevreno}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-neutral-950 truncate">{s.nazev}</div>
          <div className="text-[11px] font-semibold text-neutral-600 flex flex-wrap gap-x-2">
            <span>kód {s.kod}</span>
            {s.stav == null && <span className="text-amber-800 font-black">bez inventury</span>}
            {s.min != null && s.min > 0 && <span>minimum {cs(s.min)}</span>}
            {dny != null && <span>vystačí asi {dny} {dny === 1 ? 'den' : dny >= 2 && dny <= 4 ? 'dny' : 'dní'}</span>}
          </div>
        </div>
        <div className={`text-2xl font-black tabular-nums ${s.stav == null ? 'text-neutral-400' : spatny ? 'text-rose-700' : 'text-neutral-950'}`}>
          {s.stav == null ? '—' : cs(s.stav)}
        </div>
        {otevreno ? <ChevronUp size={18} className="shrink-0 text-neutral-500" /> : <ChevronDown size={18} className="shrink-0 text-neutral-500" />}
      </button>

      {otevreno && (
        <div className="border-t border-neutral-200 p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-neutral-600">
            <div>Napočítáno<div className="text-base font-black text-neutral-950">{s.napocitano == null ? '—' : cs(s.napocitano)}</div>{s.odInventury && <div>{datumKratce(s.odInventury)}</div>}</div>
            <div>Naskladněno od té doby<div className="text-base font-black text-emerald-800">+{cs(s.fasovano + s.prijato)}</div></div>
            <div>Prodáno od té doby<div className="text-base font-black text-rose-800">−{cs(s.prodano)}</div></div>
          </div>
          {s.odepsano > 0 && <div className="text-xs font-bold text-rose-800">Odepsáno od té doby: −{cs(s.odepsano)}</div>}

          <div className="grid grid-cols-[1fr_6rem] gap-2 items-end">
            <label className="text-[11px] font-black uppercase text-neutral-500">
              Název
              <input className="input !py-1.5 text-sm font-bold mt-0.5" value={nazev} onChange={(e) => setNazev(e.target.value)} />
            </label>
            <label className="text-[11px] font-black uppercase text-neutral-500">
              Minimum (ks)
              <input className="input !py-1.5 text-sm font-black text-center mt-0.5" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button" className="btn-primary !rounded !py-1.5 text-xs" disabled={uklada}
              onClick={() => {
                const m = min.trim() === '' ? null : Number(min.replace(',', '.'));
                if (m != null && !Number.isFinite(m)) { toastChyba('Minimum musí být číslo.'); return; }
                void uloz({ nazev: nazev.trim() || s.nazev, min_ks: m });
              }}
            >
              Uložit
            </button>
            <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => otevriPrijem(s.kod)}>Příjem</button>
            <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => otevriOdpis(s.kod)}>Odpis</button>
            <button type="button" className="btn-danger !rounded !py-1.5 text-xs font-bold" disabled={uklada} onClick={() => void uloz({ aktivni: false })}>
              Přestat sledovat
            </button>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase text-neutral-500 mb-1">Poslední pohyby</div>
            <ul className="space-y-0.5">
              {pohybyZbozi(s.kod, data.vstup, 10).map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs font-semibold text-neutral-700">
                  <span>{datumKratce(p.datum)} · {p.popis}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={`font-black tabular-nums ${p.druh === 'inventura' ? 'text-neutral-800' : p.ks > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {p.druh === 'inventura' ? `= ${cs(p.ks)}` : `${p.ks > 0 ? '+' : ''}${cs(p.ks)}`}
                    </span>
                    {p.id && (p.druh === 'prijem' || p.druh === 'odpis') && (
                      <button type="button" className="btn-ghost !rounded !py-0.5 !px-2 text-[11px] font-bold" onClick={() => void smazZapis(p)}>Smazat</button>
                    )}
                  </span>
                </li>
              ))}
              {pohybyZbozi(s.kod, data.vstup, 1).length === 0 && <li className="text-xs text-neutral-500">Zatím žádné.</li>}
            </ul>
          </div>
          {zbozi && !zbozi.beer_id && <div className="text-[11px] text-neutral-500">Ostatní zboží — naskladňuje se příjmem.</div>}
        </div>
      )}
    </li>
  );
}
