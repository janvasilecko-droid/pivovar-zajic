// 🍾 Doplnění chybějícího stočení lahví z inventury.
// ---------------------------------------------------------------------------
// U sudů stačí obyčejné potvrzení — zapíše se počet a hotovo. U LAHVÍ je ale
// potřeba vědět i to, z kolika sudů se stáčelo, jinak by sudy zůstaly ve
// skladu ležet dál, i když se z nich stáčelo. Kolik sudů to bylo se dá
// spočítat z objemu lahví a ~10% ztráty (viz bottlingYield.ts), jen je
// potřeba vědět, jak velké sudy se načaly — proto ten přepínač.
import { useMemo, useState } from 'react';
import { Modal } from './ui';
import { navrhSudu } from '../lib/bottlingYield';
import { nazevMesice } from '../lib/inventoryFix';
import type { Package } from '../lib/supabase';
import { IkonaSud } from './ikony';

export type DoplnitStoceniVysledek = {
  /** Sudy, ze kterých se stáčelo — null = nezapisovat žádný odečet. */
  kegPkgId: string | null;
  kegQty: number;
};

export function DoplnitStoceniModal({
  open, onClose, onConfirm, popis, kusy, objemLahveL, kegPackages, mesic, datum, ukladaSe,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (v: DoplnitStoceniVysledek) => void;
  /** „Ležák 12° · Lahev 0,5 l" */
  popis: string;
  /** Kolik lahví se doplňuje (velikost přebytku). */
  kusy: number;
  objemLahveL: number;
  kegPackages: Package[];
  /** „2026-08" */
  mesic: string;
  /** Datum zápisu, „2026-08-31" */
  datum: string;
  ukladaSe: boolean;
}) {
  // Výchozí je 50l sud — z něj se stáčí nejčastěji. Přepnout jde na kterýkoli
  // jiný (30l a spol.), protože to se případ od případu liší.
  const vychoziKeg = useMemo(() => {
    if (kegPackages.length === 0) return '';
    const padesatka = kegPackages.find((p) => Number(p.volume_l) === 50);
    if (padesatka) return padesatka.id;
    return [...kegPackages].sort((a, z) => Number(z.volume_l) - Number(a.volume_l))[0].id;
  }, [kegPackages]);

  const [kegPkgId, setKegPkgId] = useState<string>(vychoziKeg);
  // Modal se odmountovává mezi otevřeními, ale kdyby se seznam obalů dorovnal
  // později, ať se výchozí volba nezasekne na prázdné.
  const vybranyKeg = kegPkgId || vychoziKeg;

  const navrh = useMemo(() => {
    const keg = kegPackages.find((p) => p.id === vybranyKeg);
    if (!keg) return null;
    return navrhSudu([{ volumeL: objemLahveL, qty: kusy }], Number(keg.volume_l ?? 0));
  }, [vybranyKeg, kegPackages, objemLahveL, kusy]);

  const [bezSudu, setBezSudu] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Doplnit chybějící stočení">
      <div className="space-y-4">
        <div>
          <div className="font-black text-sm text-neutral-900">{popis}</div>
          <p className="text-xs font-bold text-neutral-600 mt-1">
            Napočítáno o <strong>{kusy} ks</strong> víc, než sklad čeká — nejspíš se stočilo a nezapsalo.
            Zapíše se do „Stáčení lahví" k {datum}, tedy do inventury za {nazevMesice(mesic)}.
          </p>
        </div>

        <div className="rounded border border-sky-200 bg-sky-50 p-3 space-y-2.5">
          <div className="text-[11px] font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
            <IkonaSud className="ikona-text" /> Z kolika sudů se stáčelo
          </div>

          <div className="flex flex-wrap gap-1.5">
            {kegPackages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setKegPkgId(p.id); setBezSudu(false); }}
                className={`px-3 py-2 rounded font-black text-xs transition min-h-[40px] ${
                  !bezSudu && vybranyKeg === p.id
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white text-sky-900 border border-sky-300 hover:bg-sky-100'
                }`}
              >
                {p.volume_l} l
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBezSudu(true)}
              className={`px-3 py-2 rounded font-black text-xs transition min-h-[40px] ${
                bezSudu
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100'
              }`}
              title="Sudy se neodečtou — použij, když nevíš, z čeho se stáčelo"
            >
              Neodečítat
            </button>
          </div>

          {bezSudu ? (
            <p className="text-[11px] font-bold text-neutral-600">
              Zapíše se jen {kusy} ks lahví. Sudy zůstanou ve skladu beze změny — použij, jen když
              opravdu nevíš, z čeho se stáčelo.
            </p>
          ) : navrh ? (
            <div className="text-xs font-bold text-sky-900 leading-relaxed">
              {kusy} ks × {objemLahveL} l = <strong>{navrh.nalahvovanoL} l</strong> v lahvích
              <br />
              + 10 % ztráta = <strong>{navrh.zdrojL} l</strong> ze sudů
              <br />
              <span className="text-sky-700">= {navrh.sudyPresne} sudu →</span>{' '}
              <strong className="text-base">odečte se {navrh.sudy} ks</strong>
              {navrh.sudy !== navrh.sudyPresne && (
                <span className="block text-[11px] font-bold text-sky-700 mt-1">
                  Zaokrouhleno nahoru — načatý sud je ze skladu pryč celý.
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] font-bold text-neutral-600">Žádné sudové obaly k výběru.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={ukladaSe}
            className="px-4 py-2.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-black text-xs transition disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => onConfirm(
              bezSudu || !navrh
                ? { kegPkgId: null, kegQty: 0 }
                : { kegPkgId: vybranyKeg, kegQty: navrh.sudy },
            )}
            disabled={ukladaSe}
            className="px-4 py-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition disabled:opacity-50"
          >
            {ukladaSe ? 'Zapisuji…' : 'Ano, zapsat'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
