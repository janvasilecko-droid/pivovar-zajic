// ⏱️ Okno „Rychlé odpočty" — co je v liště nahoře na ploše a na jak dlouho.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „jak jsou nahoře odpočty sudů, ať je tam volba různých
// libovolných odpočtů." Výchozí odpočty (kotel, malý a velký sud) jde schovat
// a přepsat jim délku, přibývají vlastní (název + čas) a jde spustit i
// jednorázový odpočet na libovolný čas, který se nikam neukládá.
// Logika je v lib/rychleOdpocty.ts, tohle okno jen skládá ovládací prvky.
import { useState } from 'react';
import { Plus, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Modal } from './ui';
import { toastZpet } from '../lib/toast';
import {
  MAX_DELKA_MS, MAX_POPIS, MAX_VLASTNICH, MIN_DELKA_MS, popisDelky, vsechnyRychle,
  type NastaveniRychlychOdpoctu,
} from '../lib/rychleOdpocty';
import {
  delkaDoPole, maUpravenaVychozi, nastavDelku, nastavViditelnost, parsujDelku, pridejVlastni, prejmenujVlastni,
  smazVlastni, vratVychozi,
} from '../lib/rychleOdpoctyUpravy';

type Props = {
  open: boolean;
  onClose: () => void;
  nastaveni: NastaveniRychlychOdpoctu;
  onZmena: (nastaveni: NastaveniRychlychOdpoctu) => void;
  /** Spustí jednorázový odpočet (nikam se neukládá, jen běží). */
  onSpustJednorazovy: (popis: string, delkaMs: number) => void;
  /** Je zapnuté foukání CO2 (jinak v nabídce vůbec není)? */
  co2: boolean;
};

const NAPOVEDA_CASU = 'Čas: minuty (8, 7,5) nebo s jednotkou (30 s, 2 h)';
const MSG_CAS = 'Čas nerozumím — napiš třeba 8, 7,5, 30 s nebo 2 h (od 10 sekund do 24 hodin).';

export function RychleOdpoctyModal({ open, onClose, nastaveni, onZmena, onSpustJednorazovy, co2 }: Props) {
  const [novyNazev, setNovyNazev] = useState('');
  const [novyCas, setNovyCas] = useState('');
  const [jednoNazev, setJednoNazev] = useState('');
  const [jednoCas, setJednoCas] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);

  const radky = vsechnyRychle(nastaveni, { co2 });

  /** Uloží změnu délky z pole „minuty" — při špatném zápisu pole vrátí a řekne proč. */
  function zmenDelku(id: string, pole: HTMLInputElement, puvodniMs: number) {
    const ms = parsujDelku(pole.value);
    if (ms === null) {
      setChyba(MSG_CAS);
      pole.value = delkaDoPole(puvodniMs);
      return;
    }
    const v = nastavDelku(nastaveni, id, ms);
    if (v.chyba) {
      setChyba(v.chyba);
      pole.value = delkaDoPole(puvodniMs);
      return;
    }
    setChyba(null);
    onZmena(v.nastaveni);
  }

  function zmenNazev(id: string, pole: HTMLInputElement, puvodni: string) {
    if (pole.value.trim() === puvodni) return;
    const v = prejmenujVlastni(nastaveni, id, pole.value);
    if (v.chyba) {
      setChyba(v.chyba);
      pole.value = puvodni;
      return;
    }
    setChyba(null);
    onZmena(v.nastaveni);
  }

  function pridej() {
    const ms = parsujDelku(novyCas);
    if (ms === null) { setChyba(MSG_CAS); return; }
    const v = pridejVlastni(nastaveni, novyNazev, ms);
    if (v.chyba) { setChyba(v.chyba); return; }
    setChyba(null);
    setNovyNazev('');
    setNovyCas('');
    onZmena(v.nastaveni);
  }

  function smaz(id: string, popis: string) {
    const predtim = nastaveni;
    onZmena(smazVlastni(nastaveni, id));
    toastZpet(`Odpočet „${popis}“ smazán.`, () => onZmena(predtim));
  }

  function spust() {
    const ms = parsujDelku(jednoCas);
    if (ms === null || ms < MIN_DELKA_MS || ms > MAX_DELKA_MS) { setChyba(MSG_CAS); return; }
    setChyba(null);
    onSpustJednorazovy(jednoNazev, ms);
    setJednoNazev('');
    setJednoCas('');
  }

  return (
    <Modal open={open} onClose={onClose} title="Rychlé odpočty">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-neutral-600">
          Kulaté ikony nahoře na ploše: klepnutím odpočet spustíš, dalším klepnutím ho zastavíš.
          Zaškrtnuté jsou v liště vidět.
        </p>

        <div className="flex flex-col gap-2" role="list" aria-label="Odpočty v liště">
          {radky.map((r) => (
            <div key={r.id} role="listitem" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0 flex-1 basis-40">
                <input
                  id={`rychly-viditelny-${r.id}`}
                  type="checkbox"
                  className="w-5 h-5 shrink-0 accent-amber-500"
                  checked={r.viditelny}
                  aria-label={`V liště: ${r.popis}`}
                  onChange={(e) => onZmena(nastavViditelnost(nastaveni, r.id, e.target.checked))}
                />
                {r.vychozi ? (
                  <label htmlFor={`rychly-viditelny-${r.id}`} className="font-bold text-sm text-neutral-800 truncate">{r.popis}</label>
                ) : (
                  <input
                    key={`${r.id}-${r.popis}`}
                    type="text"
                    className="input !min-h-[38px] flex-1 min-w-0 font-bold"
                    maxLength={MAX_POPIS}
                    defaultValue={r.popis}
                    aria-label={`Název: ${r.popis}`}
                    onBlur={(e) => zmenNazev(r.id, e.currentTarget, r.popis)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.delkaFixni ? (
                  <span className="text-sm font-bold text-neutral-600 px-2">{popisDelky(r.delkaMs)}</span>
                ) : (
                  <>
                    <input
                      key={`${r.id}-${r.delkaMs}`}
                      type="text"
                      inputMode="decimal"
                      className="input !min-h-[38px] w-20 text-center"
                      defaultValue={delkaDoPole(r.delkaMs)}
                      aria-label={`Délka v minutách: ${r.popis}`}
                      onBlur={(e) => zmenDelku(r.id, e.currentTarget, r.delkaMs)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    />
                    <span className="text-sm text-neutral-500">min</span>
                  </>
                )}
                {!r.vychozi && (
                  <button
                    type="button"
                    className="tap w-9 h-9 grid place-items-center rounded text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Smazat odpočet"
                    aria-label={`Smazat ${r.popis}`}
                    onClick={() => smaz(r.id, r.popis)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {maUpravenaVychozi(nastaveni) && (
          <button type="button" className="btn-secondary btn-sm self-start" onClick={() => onZmena(vratVychozi(nastaveni))}>
            <RotateCcw size={14} /> Vrátit výchozí odpočty
          </button>
        )}

        <form
          className="flex flex-col gap-2 border-t border-neutral-100 pt-4"
          onSubmit={(e) => { e.preventDefault(); pridej(); }}
        >
          <h4 className="font-display font-bold text-sm text-neutral-900">Přidat vlastní odpočet do lišty</h4>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className="input flex-1 basis-40 min-w-0"
              placeholder="Název (třeba Chmel)"
              maxLength={MAX_POPIS}
              value={novyNazev}
              onChange={(e) => setNovyNazev(e.target.value)}
              aria-label="Název nového odpočtu"
            />
            <input
              type="text"
              inputMode="decimal"
              className="input w-28"
              placeholder="Čas (min)"
              value={novyCas}
              onChange={(e) => setNovyCas(e.target.value)}
              aria-label="Délka nového odpočtu"
              title={NAPOVEDA_CASU}
            />
            <button type="submit" className="btn-primary" disabled={nastaveni.vlastni.length >= MAX_VLASTNICH}>
              <Plus size={16} /> Přidat do lišty
            </button>
          </div>
          {nastaveni.vlastni.length >= MAX_VLASTNICH && (
            <p className="text-xs text-neutral-500">Vlastních odpočtů může být nejvíc {MAX_VLASTNICH} — jeden napřed smaž.</p>
          )}
        </form>

        <form
          className="flex flex-col gap-2 border-t border-neutral-100 pt-4"
          onSubmit={(e) => { e.preventDefault(); spust(); }}
        >
          <h4 className="font-display font-bold text-sm text-neutral-900">Spustit jednorázově</h4>
          <p className="text-xs text-neutral-500">Odpočet na libovolný čas, který se nikam neukládá — jen poběží a ozve se.</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className="input flex-1 basis-40 min-w-0"
              placeholder="Název (nepovinné)"
              maxLength={MAX_POPIS}
              value={jednoNazev}
              onChange={(e) => setJednoNazev(e.target.value)}
              aria-label="Jednorázový odpočet: název"
            />
            <input
              type="text"
              inputMode="decimal"
              className="input w-28"
              placeholder="Čas (min)"
              value={jednoCas}
              onChange={(e) => setJednoCas(e.target.value)}
              aria-label="Jednorázový odpočet: délka"
              title={NAPOVEDA_CASU}
            />
            <button type="submit" className="btn-secondary">
              <Play size={16} /> Spustit
            </button>
          </div>
        </form>

        {chyba && (
          <p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{chyba}</p>
        )}

        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <button type="button" className="btn-emerald" onClick={onClose}>
            Hotovo
          </button>
        </div>
      </div>
    </Modal>
  );
}
