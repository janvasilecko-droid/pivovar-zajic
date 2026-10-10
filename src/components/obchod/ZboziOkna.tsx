// Dvě malá okna obchodu: příjem zboží a nové zboží.
// ---------------------------------------------------------------------------
// Pivo se do skladu obchodu dostává Fasováním (Obchod → Fasování), ostatní
// zboží (limo, saponát, kartonek…) příjmem. Nové zboží vzniká samo z první
// uzávěrky; tady jde založit ručně — třeba zboží, které se ještě neprodalo,
// nebo pivo, které bylo nafasované dřív, než se prodalo.
import { useState } from 'react';
import { Modal } from '../ui';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, uspech } from '../../lib/toast';
import { zalozZbozi, zapisOdpis, zapisPrijem, type DataObchodu } from '../../lib/obchodData';
import { NAZVY_DUVODU, stavySkladu, type DuvodOdpisu } from '../../lib/obchodSklad';

export function PrijemZbozi({ data, zapsal, kodVychozi, onClose, onUlozeno }: {
  data: DataObchodu;
  zapsal: string | null;
  kodVychozi?: string;
  onClose: () => void;
  onUlozeno: () => void;
}) {
  const [kod, setKod] = useState(kodVychozi ?? '');
  const [mnozstvi, setMnozstvi] = useState('');
  const [datum, setDatum] = useState(businessDateISO());
  const [poznamka, setPoznamka] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);
  const zbozi = data.zbozi.filter((z) => z.aktivni).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
  const ks = Number(mnozstvi.replace(',', '.'));
  const platne = !!kod && Number.isFinite(ks) && ks !== 0;
  const jePivo = !!data.zbozi.find((z) => z.kod === kod)?.beer_id;

  async function uloz() {
    if (!platne) return;
    setUklada(true);
    setChyba(null);
    try {
      const e = await zapisPrijem({ datum, kod, mnozstvi: ks, poznamka: poznamka.trim() || null, zapsal });
      if (e) { setChyba(e); return; }
      uspech('Příjem zapsán do skladu obchodu.');
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Příjem zboží do obchodu">
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="prijem-zbozi">Zboží</label>
          <select id="prijem-zbozi" className="input font-bold" value={kod} onChange={(e) => setKod(e.target.value)}>
            <option value="">— vyber zboží —</option>
            {zbozi.map((z) => <option key={z.kod} value={z.kod}>{z.nazev} ({z.kod})</option>)}
          </select>
        </div>
        {jePivo && (
          <div role="note" className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2">
            Pivo se do obchodu naskladňuje Fasováním (záložka Fasování) — jen tak se odečte ze skladu pivovaru.
            Tady zapisuj jen opravy a ostatní zboží.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="prijem-ks">Kusů (− = oprava dolů)</label>
            <input id="prijem-ks" className="input font-black text-center" inputMode="decimal" value={mnozstvi} onChange={(e) => setMnozstvi(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="prijem-datum">Datum</label>
            <input id="prijem-datum" type="date" className="input font-bold" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="prijem-pozn">Poznámka</label>
          <input id="prijem-pozn" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} placeholder="nepovinná (dodavatel, důvod opravy…)" />
        </div>
        {chyba && <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">{chyba}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost !rounded min-h-[48px]" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn-primary !rounded min-h-[48px]" disabled={!platne || uklada} onClick={uloz}>{uklada ? 'Ukládám…' : 'Zapsat příjem'}</button>
        </div>
      </div>
    </Modal>
  );
}

const DUVODY = Object.keys(NAZVY_DUVODU) as DuvodOdpisu[];
const cs = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Odpis zboží ze skladu obchodu: rozbité, prošlé, ztráta. Pivo z pivovaru se tím nevrací — to už se odečetlo Fasováním. */
export function OdpisZbozi({ data, zapsal, kodVychozi, onClose, onUlozeno }: {
  data: DataObchodu;
  zapsal: string | null;
  kodVychozi?: string;
  onClose: () => void;
  onUlozeno: () => void;
}) {
  const dnes = businessDateISO();
  const [kod, setKod] = useState(kodVychozi ?? '');
  const [mnozstvi, setMnozstvi] = useState('');
  const [datum, setDatum] = useState(dnes);
  const [duvod, setDuvod] = useState<DuvodOdpisu | null>(null);
  const [poznamka, setPoznamka] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);
  const zbozi = data.zbozi.filter((z) => z.aktivni).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
  const ks = Number(mnozstvi.replace(',', '.'));
  const platne = !!kod && !!duvod && Number.isFinite(ks) && ks > 0 && datum <= dnes && !data.chybiOdpisAZavreno;
  const stav = kod ? stavySkladu(data.vstup, datum).find((s) => s.kod === kod)?.stav ?? null : null;

  async function uloz() {
    if (!platne || !duvod) return;
    setUklada(true);
    setChyba(null);
    try {
      const e = await zapisOdpis({ datum, kod, mnozstvi: ks, duvod, poznamka: poznamka.trim() || null, zapsal });
      if (e) { setChyba(e); return; }
      uspech('Odpis zapsán, sklad obchodu se přepočítal.');
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Odpis zboží v obchodě">
      <div className="space-y-3">
        {data.chybiOdpisAZavreno && (
          <div role="alert" className="text-sm font-bold text-amber-950 bg-amber-50 border-2 border-amber-400 rounded px-3 py-2">
            Odpis potřebuje druhou migraci obchodu (<strong>20261231280000_obchod_odpis_zavreno</strong>) — spusť ji v Auditu → Databázové migrace.
          </div>
        )}
        <div>
          <label className="label" htmlFor="odpis-zbozi">Zboží</label>
          <select id="odpis-zbozi" className="input font-bold" value={kod} onChange={(e) => setKod(e.target.value)}>
            <option value="">— vyber zboží —</option>
            {zbozi.map((z) => <option key={z.kod} value={z.kod}>{z.nazev} ({z.kod})</option>)}
          </select>
          {kod && (
            <div className="text-[11px] font-semibold text-neutral-600 mt-1">
              {stav == null ? 'Zboží ještě nemá inventuru — odpis se do stavu započte, až bude.' : `Ve skladu obchodu je ${cs(stav)} ks.`}
            </div>
          )}
        </div>
        <div>
          <div className="label">Proč</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Důvod odpisu">
            {DUVODY.map((d) => (
              <button key={d} type="button" className={`btn-zalozka px-3 ${duvod === d ? 'btn-zalozka-aktivni' : ''}`} aria-pressed={duvod === d} onClick={() => setDuvod(d)}>
                {NAZVY_DUVODU[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="odpis-ks">Kusů</label>
            <input id="odpis-ks" className="input font-black text-center" inputMode="decimal" value={mnozstvi} onChange={(e) => setMnozstvi(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="odpis-datum">Datum</label>
            <input id="odpis-datum" type="date" max={dnes} className="input font-bold" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} />
          </div>
        </div>
        {kod && stav != null && Number.isFinite(ks) && ks > stav && (
          <div role="note" className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2">
            Odepisuješ víc, než je ve skladu ({cs(stav)} ks) — stav půjde do mínusu. Zkontroluj, jestli nechybí fasování nebo příjem.
          </div>
        )}
        <div>
          <label className="label" htmlFor="odpis-pozn">Poznámka</label>
          <input id="odpis-pozn" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} placeholder="nepovinná (co se stalo)" />
        </div>
        {chyba && <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">{chyba}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost !rounded min-h-[48px]" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn-primary !rounded min-h-[48px]" disabled={!platne || uklada} onClick={uloz}>{uklada ? 'Ukládám…' : 'Zapsat odpis'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function PridatZbozi({ data, zapsal, vychozi, onClose, onUlozeno }: {
  data: DataObchodu;
  zapsal: string | null;
  vychozi?: { beerId?: string; pkgId?: string };
  onClose: () => void;
  onUlozeno: () => void;
}) {
  const pivoVychozi = data.piva.find((p) => p.id === vychozi?.beerId);
  const obalVychozi = data.obaly.find((o) => o.id === vychozi?.pkgId);
  const [kod, setKod] = useState('');
  const [nazev, setNazev] = useState(pivoVychozi && obalVychozi ? `Pivo ${obalVychozi.label} ${pivoVychozi.name}` : '');
  const [ostatni, setOstatni] = useState(!vychozi?.beerId);
  const [beerId, setBeerId] = useState(vychozi?.beerId ?? '');
  const [pkgId, setPkgId] = useState(vychozi?.pkgId ?? '');
  const [min, setMin] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);
  const platne = kod.trim() !== '' && nazev.trim() !== '' && (ostatni || (!!beerId && !!pkgId));

  async function uloz() {
    if (!platne) return;
    setUklada(true);
    setChyba(null);
    try {
      const minimum = min.trim() === '' ? null : Number(min.replace(',', '.'));
      const e = await zalozZbozi({
        kod: kod.trim(), nazev: nazev.trim(),
        beer_id: ostatni ? null : beerId, package_id: ostatni ? null : pkgId,
        min_ks: minimum != null && Number.isFinite(minimum) ? minimum : null, zapsal,
      });
      if (e) { setChyba(e); return; }
      uspech('Zboží přidáno do obchodu.');
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Přidat zboží do obchodu">
      <div className="space-y-3">
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div>
            <label className="label" htmlFor="zbozi-kod">Kód z pokladny</label>
            <input id="zbozi-kod" className="input font-black" inputMode="numeric" value={kod} onChange={(e) => setKod(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="zbozi-nazev">Název</label>
            <input id="zbozi-nazev" className="input font-bold" value={nazev} onChange={(e) => setNazev(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-neutral-800">
          <input type="checkbox" className="w-5 h-5" checked={ostatni} onChange={(e) => setOstatni(e.target.checked)} />
          Ostatní zboží (limo, saponát… — nenaskladňuje se Fasováním)
        </label>
        {!ostatni && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="zbozi-pivo">Pivo</label>
              <select id="zbozi-pivo" className="input font-bold" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
                <option value="">— pivo —</option>
                {data.piva.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="zbozi-obal">Obal</label>
              <select id="zbozi-obal" className="input font-bold" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                <option value="">— obal —</option>
                {data.obaly.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="zbozi-min">Hlídat minimum (ks)</label>
          <input id="zbozi-min" className="input font-black text-center w-28" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="nepovinné" />
        </div>
        {chyba && <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">{chyba}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost !rounded min-h-[48px]" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn-primary !rounded min-h-[48px]" disabled={!platne || uklada} onClick={uloz}>{uklada ? 'Ukládám…' : 'Přidat zboží'}</button>
        </div>
      </div>
    </Modal>
  );
}
