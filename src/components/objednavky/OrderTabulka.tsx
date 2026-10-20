// 📋 Přehled objednávek jako TABULKA — druhé zobrazení vedle karet.
// ---------------------------------------------------------------------------
// Zadání 17. 10. 2026 (po tabulkách stáčení lahví a KEG): „vyzkoušej takhle
// přehled objednávek nějakým způsobem, abys zanechal všechny funkce."
//
// Karta objednávky (OrderCard.tsx) umí hodně: odškrtnout položky (stočeno,
// připraveno), den a číslo závozu, úprava, vrátit pivo, rozdělit,
// storno, smazání, varování ze skladu, malé sudy… Nic z toho se tu
// neduplikuje a nic neztrácí. Tabulka je jen PŘEHLED k rychlému přejetí očima:
// jeden řádek na objednávku (odběratel, termín, položky, kusy, stav) — a klepnutím
// na řádek se pod ním rozbalí PŮVODNÍ karta (a detail) se všemi funkcemi.
// Rozbalení si hostitel nese sám: `renderKarta` vrací přesně to, co se jinak
// kreslí v seznamu karet.
import { Fragment, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, NotebookPen } from 'lucide-react';
import { poradiPolozekObjednavky } from '../../lib/poradiPolozek';
import { schodkyObjednavky } from '../../lib/tydenniZbytek';
import { bezSuduOdberatele, doSuduOdberatelePolozky } from '../../lib/vlastniSudy';
import { jeVyrizena } from '../../lib/stavyObjednavek';
import { Beer, Package, Place, beerBg, formatPackageLabel } from '../../lib/supabase';
import { StitekStavu } from '../StitekStavu';
import { DAYS } from '../../lib/shared';
import { type Order, type OrderItem, dayColor } from './spolecne';

type Props = {
  objednavky: Order[];
  items: Record<string, OrderItem[]>;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Zbytek skladu ke konci týdne pro konkrétní objednávku (stejně jako karta). */
  stockRemainingForOrder: (o: Order) => Map<string, number>;
  /** Objednávka, jejíž detail je právě otevřený — její řádek je rozbalený. */
  otevrenaId?: string | null;
  /** Původní karta (a detail) objednávky — rozbalí se pod řádkem. */
  renderKarta: (o: Order) => ReactNode;
  /** Filtr piva/obalu z Přehledu: řádky, které mu nevyhoví, se v položkách schovají. */
  itemMatchesFilter?: (item: OrderItem) => boolean;
};

/** Jméno odběratele jako na kartě: kopie na objednávce, jinak z katalogu. */
export function jmenoObjednavky(o: Order, places: Place[]): string {
  return (o.place_name && o.place_name.trim()) || (o.place_id && places.find((p) => p.id === o.place_id)?.name) || '—';
}

const datumCesky = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ');

export function OrderTabulka({
  objednavky, items, beers, packages, places, selectedIds, onToggleSelect, stockRemainingForOrder,
  otevrenaId, renderKarta, itemMatchesFilter,
}: Props) {
  const [rozbalene, setRozbalene] = useState<ReadonlySet<string>>(new Set());
  const jeRozbalena = (id: string) => rozbalene.has(id) || otevrenaId === id;
  const prepni = (id: string) => setRozbalene((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="rounded-xl border-2 border-amber-300/80 bg-white overflow-x-auto" data-testid="objednavky-tabulka">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50">
            <th scope="col" className="text-left px-2 py-1.5 min-w-[9rem]">Odběratel</th>
            <th scope="col" className="text-left px-2 py-1.5">Položky</th>
            <th scope="col" className="text-right px-2 py-1.5">Ks</th>
            <th scope="col" className="text-left px-2 py-1.5">Stav</th>
            <th scope="col" className="px-1 py-1.5 w-10"><span className="sr-only">Rozbalit</span></th>
          </tr>
        </thead>
        <tbody>
          {objednavky.map((o) => {
            const polozky = items[o.id] ?? [];
            const jmeno = jmenoObjednavky(o, places);
            const rozbalena = jeRozbalena(o.id);
            const seradene = poradiPolozekObjednavky(polozky, packages, beers);
            const viditelne = itemMatchesFilter ? seradene.filter(itemMatchesFilter) : seradene;
            const skryto = seradene.length - viditelne.length;
            const celkem = polozky.reduce((s, i) => s + Number(i.quantity), 0);
            const odbaveno = o.is_delivered || jeVyrizena(o.status) || o.status === 'storno';
            const jehoSudy = doSuduOdberatelePolozky(o.place_name, polozky, packages, o.note);
            const schodky = odbaveno ? [] : schodkyObjednavky(bezSuduOdberatele(o.place_name, polozky, packages, o.note), stockRemainingForOrder(o));
            const schodekText = schodky.map((s) => {
              const obal = packages.find((p) => p.id === s.package_id);
              return `${obal ? `${s.beer_name} ${formatPackageLabel(obal.label)}` : s.beer_name} ${s.chybi} ks`;
            }).join(', ');
            const den = o.delivery_day ? DAYS.find((d) => d.v === o.delivery_day)?.label ?? o.delivery_day : null;
            const barva = dayColor(o.delivery_day);
            return (
              <Fragment key={o.id}>
                {/* Rozbalená objednávka se ukazuje JEN jako karta (bez řádku nad ní) — jinak se
                    obsah objednávky zobrazil dvakrát a stránka byla zbytečně dlouhá. */}
                {!rozbalena && (
                <tr
                  data-testid="radek-objednavky"
                  className={`cursor-pointer align-top hover:bg-amber-50/60 ${selectedIds.has(o.id) ? 'bg-primary-50' : ''}`}
                  onClick={() => prepni(o.id)}
                >
                  <td className="px-2 py-1.5 border-t-2 border-neutral-200 min-w-[9rem]">
                    <div className="flex items-start gap-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(o.id)}
                        aria-label={`Vybrat objednávku: ${jmeno}`}
                        className="w-4 h-4 rounded accent-amber-500 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="font-display font-black text-neutral-900 break-words">{jmeno}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <StitekStavu status={o.status} tridy="font-black shrink-0" />
                          {den && barva && <span className={`chip ${barva.chip} shrink-0`}>{den}</span>}
                          <span className="text-udaj font-bold text-neutral-600 tabular-nums">{datumCesky(o.delivery_date || o.order_date)}</span>
                          {o.zavoz_cislo === 2 && <span className="text-udaj font-black text-neutral-800 bg-neutral-100 rounded px-1">2. závoz</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 border-t-2 border-neutral-200">
                    <ul className="space-y-0.5">
                      {viditelne.map((i) => {
                        const beer = i.beer_id ? beers.find((b) => b.id === i.beer_id) : null;
                        return (
                          <li key={i.id} className={`flex items-center gap-1.5 text-xs ${i.is_prepared ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
                            {beer && <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20 vlastni-vyska" style={{ backgroundColor: beerBg(beer) }} />}
                            <span className="font-black min-w-0 break-words">{i.beer_name ?? '?'}</span>
                            <span className="font-bold text-neutral-700 shrink-0">{formatPackageLabel(i.package_label)}</span>
                            <span className="ml-auto shrink-0 font-black tabular-nums text-amber-900">×{i.quantity}</span>
                          </li>
                        );
                      })}
                      {skryto > 0 && <li className="text-udaj font-bold text-neutral-600">Filtr schoval {skryto} {skryto === 1 ? 'položku' : skryto < 5 ? 'položky' : 'položek'}.</li>}
                      {polozky.length === 0 && <li className="text-xs text-neutral-500">bez položek</li>}
                    </ul>
                  </td>
                  <td className="px-2 py-1.5 border-t-2 border-neutral-200 text-right font-black tabular-nums text-neutral-900">{celkem}</td>
                  <td className="px-2 py-1.5 border-t-2 border-neutral-200">
                    <div className="flex flex-wrap items-center gap-1">
                      {schodky.length > 0 ? (
                        <span data-testid="schodek-objednavky" title={`Ke konci týdne chybí: ${schodekText}`} className="flex items-center gap-1 text-udaj font-black text-rose-950 bg-rose-100 border border-rose-300 rounded px-1.5 py-0.5">
                          <AlertTriangle size={12} /> chybí
                        </span>
                      ) : !odbaveno && polozky.length > 0 ? (
                        <>
                          {jehoSudy.length < polozky.length && (
                            <span title="Vše skladem" className="flex items-center gap-1 text-udaj font-black text-emerald-950 bg-emerald-100 border border-emerald-300 rounded px-1.5 py-0.5">
                              <CheckCircle2 size={12} /> skladem
                            </span>
                          )}
                          {jehoSudy.length > 0 && (
                            <span data-testid="jeho-sudy" title="Sudy odběratele — sklad pivovaru je neobsahuje. Pivo se do nich musí stočit a zapsat ve Stáčení KEG." className="flex items-center gap-1 text-udaj font-black text-amber-950 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
                              <AlertTriangle size={12} /> jeho sudy
                            </span>
                          )}
                        </>
                      ) : null}
                      {o.is_prepared && <span className="chip bg-emerald-700 text-white font-black flex items-center gap-1"><Check size={12} /> Připr.</span>}
                      {o.is_delivered && <span className="chip bg-emerald-700 text-white font-black flex items-center gap-1"><Check size={12} /> Zavez.</span>}
                      {o.note && <span title={o.note}><NotebookPen size={14} className="text-amber-800" aria-label="Poznámka" /></span>}
                    </div>
                  </td>
                  <td className="px-1 py-1.5 border-t-2 border-neutral-200 text-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); prepni(o.id); }}
                      aria-expanded={rozbalena}
                      aria-label={`${rozbalena ? 'Sbalit' : 'Rozbalit'} objednávku: ${jmeno}`}
                      className="btn-ikona bg-white text-neutral-800 border border-neutral-300"
                    >
                      {rozbalena ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </td>
                </tr>
                )}
                {rozbalena && (
                  <tr data-testid="rozbalena-objednavka">
                    <td colSpan={5} className="p-2 bg-neutral-50 border-t border-neutral-200">
                      {/* Tabulka bývá širší než displej a posouvá se do strany. Karta by se roztáhla
                          na šířku tabulky a ikony (úprava, WhatsApp, rozdělit, smazat) by zůstaly
                          za pravým okrajem — proto se drží na místě a má nejvýš šířku displeje. */}
                      <div className="sticky left-0 w-[min(calc(100vw-3rem),72rem)] max-w-full" data-testid="rozbalena-karta-obal">
                        <button
                          type="button"
                          onClick={() => prepni(o.id)}
                          aria-expanded={true}
                          aria-label={`Sbalit objednávku: ${jmeno}`}
                          className="btn-ikona bg-white text-neutral-800 border border-neutral-300 mb-1.5 ml-auto"
                        >
                          <ChevronUp size={14} />
                        </button>
                        {renderKarta(o)}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
