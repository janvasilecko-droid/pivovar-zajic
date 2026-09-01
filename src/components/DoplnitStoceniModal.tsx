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
import { normalizujCislo } from '../lib/cisloVstup';
import { nazevMesice } from '../lib/inventoryFix';
import type { Package } from '../lib/supabase';
import { IkonaSud } from './ikony';

export type DoplnitStoceniVysledek = {
  /** Sudy, ze kterých se stáčelo. Prázdné = neodečítat nic. */
  sudy: { kegPkgId: string; kegQty: number; kegVolumeL: number }[];
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
  // Sudy se zadávají po velikostech — jedno stáčení běžně načne padesátky
  // i třicítky dohromady, takže to není volba jedné velikosti, ale počty
  // u každé.
  const sudoveObaly = useMemo(
    () => [...kegPackages].sort((a, z) => Number(z.volume_l) - Number(a.volume_l)),
    [kegPackages],
  );

  // Počet sudů zadává ČLOVĚK. Dopočet je jen ORIENTACE: kolik sudů se opravdu
  // načalo ví jenom stáčeč a program to nemá čím zjistit. Pole proto začínají
  // prázdná a nic se nepředvyplňuje.
  const [pocty, setPocty] = useState<Record<string, string>>({});
  const pocet = (id: string) => Math.max(0, Math.floor(Number(pocty[id]) || 0));

  const sudy = sudoveObaly
    .map((p) => ({ kegPkgId: p.id, kegQty: pocet(p.id), kegVolumeL: Number(p.volume_l ?? 0) }))
    .filter((z) => z.kegQty > 0 && z.kegVolumeL > 0);
  const zadanoL = sudy.reduce((s, z) => s + z.kegQty * z.kegVolumeL, 0);

  // Orientační dopočet z celkového objemu lahví a ~10% ztráty — kolik by to
  // zhruba mělo být, kdyby se to stáčelo jen z jedné velikosti.
  const orientace = useMemo(
    () => navrhSudu([{ volumeL: objemLahveL, qty: kusy }], 50),
    [objemLahveL, kusy],
  );

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

          {/* Orientace, ne rozhodnutí. Dopočet neví, kolik sudů se opravdu
              načalo, a když se stáčí víc velikostí lahví z jedněch sudů,
              nadsazuje. Počty proto zadává člověk. */}
          {orientace && (
            <p className="text-[11px] font-bold text-sky-800">
              Orientačně: {kusy} ks × {objemLahveL} l = {orientace.nalahvovanoL} l,
              {' '}+ 10 % ztráta = {orientace.zdrojL} l ≈ <strong>{orientace.sudy}×50</strong>.
              {' '}Kolik sudů se opravdu načalo víš jenom ty — zadej to níž.
            </p>
          )}

          {sudoveObaly.length === 0 ? (
            <p className="text-[11px] font-bold text-neutral-600">Žádné sudové obaly k výběru.</p>
          ) : (
            <div className="space-y-1.5">
              {sudoveObaly.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pocty[p.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setPocty((v) => ({ ...v, [p.id]: normalizujCislo(e.target.value, false) }))}
                    className="w-20 px-2.5 py-2 rounded border-2 border-sky-300 bg-white text-center font-black text-base text-sky-900 focus:border-sky-500 focus:outline-hidden"
                    aria-label={`Počet sudů ${p.volume_l} l`}
                  />
                  <span className="font-black text-sm text-sky-900">× {p.volume_l} l</span>
                  {pocet(p.id) > 0 && (
                    <span className="text-[11px] font-bold text-sky-700">
                      = {(pocet(p.id) * Number(p.volume_l)).toLocaleString('cs-CZ')} l
                    </span>
                  )}
                </div>
              ))}
              <div className="text-xs font-black text-sky-900 border-t border-sky-200 pt-1.5">
                {zadanoL > 0
                  ? `Odečte se ${sudy.map((z) => `${z.kegQty}×${z.kegVolumeL}`).join(' + ')} = ${zadanoL.toLocaleString('cs-CZ')} l`
                  : 'Zatím nic — prázdné znamená, že se sudy neodečtou.'}
              </div>
            </div>
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
            onClick={() => onConfirm({ sudy })}
            disabled={ukladaSe}
            className="px-4 py-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition disabled:opacity-50"
          >
            {ukladaSe
              ? 'Zapisuji…'
              : sudy.length === 0
                ? `Zapsat ${kusy} ks lahví`
                : `Zapsat a odečíst ${sudy.reduce((s, z) => s + z.kegQty, 0)} sudů`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
