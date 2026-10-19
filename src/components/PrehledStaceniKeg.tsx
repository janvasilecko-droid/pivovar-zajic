// 📋 Přehled stáčení KEG po dnech — tabulka ve stylu přehledu lahví.
// ---------------------------------------------------------------------------
// Zadání 17. 10. 2026: „udělej takhle i přehled stáčení KEG" (po tabulce
// stáčení lahví, PrehledStaceniLahvi.tsx):
//  - DEN je pás („Pondělí 12. 10.") se součtem kusů a litrů,
//  - pod pásem je JEDNA tabulka: řádek = pivo (v barvě piva), sloupce =
//    velikosti sudů 50 · 30 · 20 · 15 · 10 l, dole řádek Celkem,
//  - pod každým řádkem je kolik litrů se stočilo a — je-li znám objem z tanku —
//    z kolika litrů a jaká byla výtrata; poznámka a původ zápisu tamtéž,
//  - číslo v buňce jde přepsat klepnutím (Enter uloží); je-li v buňce víc
//    záznamů téhož obalu, otevřou se podrobnosti,
//  - klepnutí na název piva otevře podrobnosti: záznamy po jednom (úprava, ±1,
//    smazání). Tam zůstalo všechno, co uměla dlaždice před tabulkou.
// Zápisy do databáze zůstávají v Kegging.tsx a chodí sem jako funkce.
import { Fragment, useState } from 'react';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';
import type { Beer, Package } from '../lib/supabase';
import { beerBg, beerBorder, beerText, formatPackageLabel } from '../lib/supabase';
import { puvodZapisu } from '../lib/puvodZapisu';
import { davkyStaceni, dnyStaceni, nazevDne, type DavkaStaceni } from '../lib/prehledStaceni';
import { bunkaDavky, sloupceKeg, souctyDne, zaznamyBezSloupce, zdrojAVytrata, type ZaznamKeg } from '../lib/prehledStaceniKeg';
import { vytrataKeKontrole } from '../lib/prehledStaceniTabulka';
import { Modal } from './ui';
import { PolicekCisla } from './PrehledStaceniLahvi';
import { IkonaSud } from './ikony';

/** Buňka s kusy — stejná jantarová jako sudy v tabulce lahví. */
const BARVA_BUNKY = 'bg-amber-100 text-amber-900';

const cislo = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

type Props<R extends ZaznamKeg & { package_label?: string | null }> = {
  zaznamy: R[];
  piva: Beer[];
  obaly: Package[];
  /** Dnešek (businessDateISO) — den dostane štítek „dnes". */
  dnes: string;
  /** Přepsané číslo v buňce (celé číslo ≥ 1). */
  onPocet: (id: string, kusu: number) => void;
  onKus: (id: string, delta: number) => void;
  onUpravit: (r: R) => void;
  onSmazat: (id: string) => void;
};

export default function PrehledStaceniKeg<R extends ZaznamKeg & { package_label?: string | null }>({
  zaznamy, piva, obaly, dnes, onPocet, onKus, onUpravit, onSmazat,
}: Props<R>) {
  /** Buňka, ve které se zrovna píše (`klic|objem`). */
  const [editace, setEditace] = useState<string | null>(null);
  const [vybranyKlic, setVybranyKlic] = useState<string | null>(null);

  const pivoPodleId = new Map(piva.map((b) => [b.id, b]));
  const objemPodleId = new Map(obaly.map((p) => [p.id, Number(p.volume_l) || 0]));
  const dny = dnyStaceni(davkyStaceni(zaznamy, (id) => (id ? objemPodleId.get(id) ?? 0 : 0)));
  const sloupce = sloupceKeg(dny);
  const pocetSloupcu = 1 + sloupce.length;
  const vybrana: DavkaStaceni<R> | undefined = vybranyKlic
    ? dny.flatMap((d) => d.davky).find((d) => d.klic === vybranyKlic)
    : undefined;

  return (
    <div className="space-y-3" data-testid="prehled-keg-po-dnech">
      <p className="text-udaj text-neutral-600">
        Klepni na číslo a přepiš ho (Enter uloží). Klepnutí na název piva otevře podrobnosti: záznamy po jednom, úprava a smazání.
      </p>

      {dny.map((den) => {
        const soucty = souctyDne(den, sloupce);
        const idDne = `keg-den-${den.datum || 'bez-data'}`;
        return (
          <section key={den.datum} aria-labelledby={idDne} data-testid="den-keg" className="rounded-xl border-2 border-amber-300/80 bg-white overflow-hidden shadow-2xs">
            <header className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-100 border-b-2 border-amber-300/80">
              <h3 id={idDne} className="font-display font-black text-amber-950 text-base flex items-center gap-2 min-w-0">
                <span className="truncate">{nazevDne(den.datum)}</span>
                {den.datum === dnes && <span className="chip badge-amber !py-0 shrink-0">dnes</span>}
              </h3>
              <span className="shrink-0 text-sm font-black text-amber-900 tabular-nums">{den.celkemKs} ks · {cislo(den.celkemL)} L</span>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm" aria-label={`Stáčení KEG — ${nazevDne(den.datum)}`}>
                <thead>
                  <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50">
                    <th scope="col" rowSpan={2} className="sticky left-0 z-[1] bg-neutral-50 text-left align-bottom px-2 pb-1 w-[5rem] min-w-[5rem] md:w-[9rem] md:min-w-[9rem]">Pivo</th>
                    <th scope="colgroup" colSpan={sloupce.length} className="text-center pt-1 border-l border-neutral-200">
                      <IkonaSud className="ikona-text" /> Stočeno do sudů
                    </th>
                  </tr>
                  <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50">
                    {sloupce.map((l, i) => (
                      <th key={l} scope="col" className={`pb-1 px-px min-w-[2.5rem] text-center ${i === 0 ? 'border-l border-neutral-200' : ''}`}>{cislo(l)} L</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {den.davky.map((davka) => {
                    const beer = pivoPodleId.get(davka.beerId ?? '');
                    const { zdrojL, vytrata } = zdrojAVytrata(davka);
                    const kontrola = vytrataKeKontrole(vytrata);
                    const mimo = zaznamyBezSloupce(davka, sloupce);
                    const poznamky = [...new Set(davka.polozky.map((p) => (p.zaznam.note ?? '').trim()).filter((t) => t && !puvodZapisu(t)))];
                    const puvody = [...new Set(davka.polozky.map((p) => puvodZapisu(p.zaznam.note)?.popis).filter((t): t is string => !!t))];
                    return (
                      <Fragment key={davka.klic}>
                        <tr data-testid="radek-keg">
                          <th
                            scope="row"
                            className="sticky left-0 z-[1] p-0 text-left align-top border-t-2 border-black/15 border-l-4"
                            style={{ backgroundColor: beerBg(beer), borderLeftColor: beerBorder(beer) }}
                          >
                            <button
                              type="button"
                              onClick={() => setVybranyKlic(davka.klic)}
                              className={`relative w-full min-h-[44px] pl-2 pr-4 py-1.5 text-left font-black text-[13px] md:text-sm leading-tight break-words ${beerText(beer)}`}
                              title="Podrobnosti a úpravy záznamů"
                              aria-label={`Podrobnosti: ${davka.beerName}`}
                            >
                              {davka.beerName}
                              <Pencil size={11} className="absolute right-1 bottom-1 opacity-70" aria-hidden />
                            </button>
                          </th>
                          {sloupce.map((l, i) => {
                            const b = bunkaDavky(davka, l);
                            const klicBunky = `${davka.klic}|${l}`;
                            return (
                              <td key={l} className={`p-px text-center border-t-2 border-black/15 ${i === 0 ? 'border-l border-l-neutral-200' : ''}`}>
                                {b.ks === 0 ? (
                                  <span className="block py-2 text-neutral-400" aria-hidden>·</span>
                                ) : editace === klicBunky && b.zaznamy.length === 1 ? (
                                  <PolicekCisla
                                    vychozi={String(b.ks)}
                                    popisek={`Počet sudů ${cislo(l)} L — ${davka.beerName}`}
                                    onPotvrdit={(text) => {
                                      setEditace(null);
                                      const n = Math.round(Number(text.replace(',', '.')));
                                      if (Number.isFinite(n) && n >= 1 && n !== b.ks) onPocet(b.zaznamy[0].id, n);
                                    }}
                                    onZrusit={() => setEditace(null)}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => (b.zaznamy.length === 1 ? setEditace(klicBunky) : setVybranyKlic(davka.klic))}
                                    aria-label={`${davka.beerName}, ${cislo(l)} L: ${b.ks} ks${b.zaznamy.length > 1 ? ' (víc záznamů)' : ''}`}
                                    className={`block mx-auto w-full max-w-[4.5rem] min-h-[44px] min-w-[2.5rem] rounded-md px-0.5 text-sm font-extrabold tabular-nums transition ${BARVA_BUNKY}`}
                                  >
                                    {b.ks}{b.zaznamy.length > 1 && <span className="text-udaj font-bold text-amber-800"> ×{b.zaznamy.length}</span>}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td colSpan={pocetSloupcu} className="p-0 border-l-4 bg-neutral-50" style={{ borderLeftColor: beerBorder(beer) }}>
                            <div className="sticky left-0 max-w-[calc(100vw-3rem)] px-2 py-1 space-y-0.5 text-xs">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold tabular-nums text-neutral-800" data-testid="souhrn-keg">
                                <span>{zdrojL > 0 ? `${cislo(davka.celkemL)} L z ${cislo(zdrojL)} L` : `${cislo(davka.celkemL)} L`}</span>
                                {vytrata !== null && (
                                  <span
                                    data-testid="vytrata-keg"
                                    title={kontrola ? 'Výtrata mimo obvyklé hodnoty — zkontroluj počty a objem z tanku.' : 'Výtrata: kolik piva z tanku se nedostalo do sudů.'}
                                    className={`rounded px-1.5 ${kontrola ? 'bg-rose-700 text-white' : 'bg-neutral-100 text-neutral-900'}`}
                                  >
                                    výtrata {cislo(vytrata)} %
                                  </span>
                                )}
                                {zdrojL === 0 && !davka.polozky.some((p) => /^\s*Řez:/.test(p.zaznam.note ?? '')) && <span className="text-neutral-600">bez tanku</span>}
                                <button
                                  type="button"
                                  onClick={() => setVybranyKlic(davka.klic)}
                                  className="btn-ghost !flex-none !min-h-[44px] !px-3 ml-auto inline-flex items-center gap-1 text-xs font-black"
                                  title="Upravit nebo smazat záznamy tohoto stočení"
                                >
                                  <Pencil size={13} aria-hidden /> Upravit / smazat
                                </button>
                              </div>
                              {mimo.length > 0 && (
                                <p className="font-bold text-neutral-800">
                                  jiné obaly: {mimo.map((z) => `${z.quantity}× ${formatPackageLabel(z.package_label) || 'obal chybí v katalogu'}`).join(', ')}
                                </p>
                              )}
                              {puvody.map((p) => (
                                <p key={p} className="leading-4 font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 flex items-start gap-1">
                                  <ClipboardList size={11} className="shrink-0 mt-0.5" /><span>{p}</span>
                                </p>
                              ))}
                              {poznamky.map((t) => (
                                <p key={t} className="font-semibold text-neutral-700 whitespace-pre-line break-words line-clamp-2" title={t}>{t}</p>
                              ))}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr data-testid="celkem-dne-keg" className="bg-amber-50 text-amber-950">
                    <th scope="row" className="sticky left-0 z-[1] bg-amber-50 text-left align-middle px-2 py-1.5 border-t-2 border-amber-300 text-[13px] font-black">Celkem</th>
                    {sloupce.map((l, i) => (
                      <td key={l} className={`px-px py-1.5 text-center font-black tabular-nums border-t-2 border-amber-300 ${i === 0 ? 'border-l' : ''}`}>{soucty[i] || '—'}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      {vybrana && (
        <Modal open onClose={() => setVybranyKlic(null)} title={`${vybrana.beerName} · ${nazevDne(vybrana.datum)}`}>
          <ul className="space-y-2" data-testid="zaznamy-davky">
            {vybrana.polozky.map(({ zaznam: r }) => (
              <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-amber-900">
                    {formatPackageLabel(r.package_label || obaly.find((p) => p.id === r.package_id)?.label) || '—'}
                  </span>
                  <span className="ml-auto font-display font-black text-lg tabular-nums text-amber-950">{r.quantity} ks</span>
                </div>
                {(r.note ?? '').trim() && !puvodZapisu(r.note) && (
                  <p className="text-xs font-semibold text-neutral-700 break-words">{r.note}</p>
                )}
                {puvodZapisu(r.note) && (
                  <div className="text-udaj font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                    <ClipboardList size={11} className="shrink-0" />{puvodZapisu(r.note)?.popis}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-amber-100">
                  <button type="button" onClick={() => { setVybranyKlic(null); onUpravit(r); }} className="btn-ghost !flex-none !w-11 !px-0 !min-h-[44px]" title="Upravit záznam" aria-label="Upravit záznam"><Pencil size={16} /></button>
                  <button type="button" onClick={() => onKus(r.id, -1)} disabled={Number(r.quantity) <= 0} className="btn-pocet !min-h-[44px]" aria-label="Ubrat sud">−</button>
                  <button type="button" onClick={() => onKus(r.id, 1)} className="btn-pocet !min-h-[44px]" aria-label="Přidat sud">+</button>
                  <button type="button" onClick={() => { onSmazat(r.id); if (vybrana.polozky.length <= 1) setVybranyKlic(null); }} className="btn-danger !flex-none !w-11 !px-0 !min-h-[44px] ml-auto" aria-label="Smazat záznam"><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
