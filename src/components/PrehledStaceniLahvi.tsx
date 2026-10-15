// 📋 Přehled stáčení lahví po dnech — pás dne a pod ním jeden řádek na pivo.
// ---------------------------------------------------------------------------
// Zadání z 15. 10. 2026 (poprvé 12. 10.: „stáčení přehled udělej přehlednější,
// ideálně do jednoho řádku, ať to není tak roztažený"; podruhé s fotkou z
// telefonu): „ten přehled udělej v řádku, takhle je to nepřehledný, odděl
// vždycky, ať je vidět, jaký den se co stáčelo."
//
// Co bylo špatně na fotce: každé pivo mělo vysokou dlaždici (nadpis, výběr
// sudu s tlačítky, počet sudů, tlačítko „Další sud", litry, teprve pak
// záznamy) a den byl jen drobný popisek v rohu — dlaždice různých dnů
// vypadaly stejně a splývaly. Na telefonu z toho byly dvě obrazovky na jeden
// den.
//
// Teď:
//  - DEN je nadřazená skupina s vlastním pásem („Pondělí 12. 10." + součet),
//  - uvnitř dne je každé pivo JEDEN řádek v barvě piva: jméno, kusy, pod tím
//    obaly a sud s litry a výtratou (to, co majitel chtěl mít vždycky vidět),
//  - úpravy (záznamy s −/+/tužkou/křížkem, výběr sudu) jsou za klepnutím na
//    řádek. Při jednom dni jsou rozbalené rovnou; v týdnu a měsíci sbalené.
//  - Jediná věc, která se nikdy nesbalí, je šarže s počtem sudů a BEZ jejich
//    velikosti: bez ní sklad sudy neodečte a nikdo by si toho nevšiml.
//
// Vlastní logika (seskupení, součty, výtrata) je v lib/prehledStaceni.ts;
// zápisy do databáze zůstávají v BottlingScreen a chodí sem jako funkce.
import { useMemo, useState } from 'react';
import { ChevronDown, ClipboardList, Pencil, Plus, X } from 'lucide-react';
import type { Beer, EntryRow, Package } from '../lib/supabase';
import { beerBg, beerText, formatPackageLabel } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { puvodZapisu } from '../lib/puvodZapisu';
import {
  chybiVelikostSudu, dnyStaceni, nazevDne, obalyDavky, pocetSuduCesky, sarzeDavky, souhrnSarze,
  type DavkaStaceni, type Sarze,
} from '../lib/prehledStaceni';
import VyberZdrojovehoSudu, { popisSudu } from './VyberZdrojovehoSudu';
import { objemCesky } from './VyberObalu';
import { IkonaSud } from './ikony';

const cislo = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** „1,5 L" — z objemu; obal mimo katalog se popíše tím, co je v záznamu. */
function popisObalu(pkg: Package | undefined, zaznam: EntryRow): string {
  return objemCesky(pkg?.volume_l) || formatPackageLabel(pkg?.label ?? zaznam.package_label) || '—';
}

export type PrehledStaceniLahviProps = {
  davky: DavkaStaceni<EntryRow>[];
  piva: Beer[];
  obaly: Package[];
  /** Velikosti zdrojových sudů (KEG 50 / 30 / …) pro výběr. */
  sudy: Package[];
  /** Jeden den se vejde rozbalený; týden a měsíc sbalený. */
  vychoziOtevrene: boolean;
  getBatchId: (r: EntryRow) => string;
  onKus: (id: string, delta: number) => void;
  onSudy: (id: string, delta: number) => void;
  onZmenSud: (id: string, packageId: string) => void;
  onDalsiSud: (zaznamy: EntryRow[], zdrojPackageId: string, sudu: number) => void;
  onUpravit: (r: EntryRow) => void;
  onSmazat: (id: string) => void;
};

export default function PrehledStaceniLahvi({
  davky, piva, obaly, sudy, vychoziOtevrene, getBatchId,
  onKus, onSudy, onZmenSud, onDalsiSud, onUpravit, onSmazat,
}: PrehledStaceniLahviProps) {
  // Ručně přepnuté dlaždice a sudy. Co není v mapě, řídí výchozí stav (viz
  // `vychoziOtevrene` a šarže bez velikosti sudu).
  const [otevrene, setOtevrene] = useState<Record<string, boolean>>({});
  const [sudOtevreny, setSudOtevreny] = useState<Record<string, boolean>>({});

  const dny = useMemo(() => dnyStaceni(davky), [davky]);
  const pivoPodleId = useMemo(() => new Map(piva.map((b) => [b.id, b])), [piva]);
  const obalPodleId = useMemo(() => new Map(obaly.map((p) => [p.id, p])), [obaly]);
  const dnes = businessDateISO();

  const objemSudu = (id: string) => Number(obalPodleId.get(id)?.volume_l) || 0;

  return (
    <div className="space-y-3" data-testid="prehled-po-dnech">
      {dny.map((den) => (
        <section
          key={den.datum}
          aria-labelledby={`den-${den.datum || 'bez-data'}`}
          data-testid="den-staceni"
          className="rounded-xl border-2 border-amber-300/80 bg-white overflow-hidden shadow-2xs"
        >
          <header className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-100 border-b-2 border-amber-300/80">
            <h3 id={`den-${den.datum || 'bez-data'}`} className="font-display font-black text-amber-950 text-base flex items-center gap-2 min-w-0">
              <span className="truncate">{nazevDne(den.datum)}</span>
              {den.datum === dnes && <span className="chip badge-amber !py-0 shrink-0">dnes</span>}
            </h3>
            <span className="shrink-0 text-sm font-black text-amber-900 tabular-nums">
              {den.celkemKs} ks · {cislo(den.celkemL)} L
            </span>
          </header>

          <div className="p-1.5 space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-1.5 lg:items-start">
            {den.davky.map((davka) => {
              const beer = pivoPodleId.get(davka.beerId ?? '');
              const sarze = sarzeDavky(davka.polozky, getBatchId);
              const bezVelikosti = sarze.some((s) => chybiVelikostSudu(s));
              const jeOtevrena = otevrene[davka.klic] ?? (vychoziOtevrene || bezVelikosti);
              const obalyDne = obalyDavky(davka);

              return (
                <div
                  key={davka.klic}
                  data-testid="davka-staceni"
                  className="rounded-lg overflow-hidden border border-black/10"
                >
                  <button
                    type="button"
                    aria-expanded={jeOtevrena}
                    onClick={() => setOtevrene((o) => ({ ...o, [davka.klic]: !jeOtevrena }))}
                    className={`w-full text-left px-3 py-2 min-h-[48px] flex flex-col gap-0.5 ${beerText(beer)}`}
                    style={{ backgroundColor: beerBg(beer) }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-black text-base truncate min-w-0 flex-1">{davka.beerName}</span>
                      <span className="shrink-0 font-display font-black text-xl tabular-nums">{davka.celkemKs} ks</span>
                      <ChevronDown size={18} aria-hidden className={`shrink-0 transition-transform ${jeOtevrena ? 'rotate-180' : ''}`} />
                    </span>

                    {/* Sbalená dlaždice říká všechno podstatné sama: co se
                        stočilo do čeho a z jakého sudu s jakou výtratou. */}
                    {!jeOtevrena && (
                      <span className="text-xs font-bold opacity-90">
                        {obalyDne.map((o) => `${o.ks}× ${popisObalu(obalPodleId.get(o.packageId ?? ''), o.zaznam)}`).join(' · ')}
                      </span>
                    )}
                    {!jeOtevrena && sarze.map((s) => (
                      <span key={s.klic} className="text-xs font-bold opacity-90 tabular-nums" data-testid="souhrn-sarze">
                        {radekSarze(s, obalPodleId, objemSudu)}
                      </span>
                    ))}
                  </button>

                  {jeOtevrena && (
                    <div className="bg-white p-1.5 space-y-1.5">
                      {sarze.map((s) => {
                        const nositel = s.nositelZdroje;
                        const souhrn = souhrnSarze(s, objemSudu);
                        const upravaSudu = sudOtevreny[s.klic] ?? souhrn.chybiVelikost;
                        return (
                          <div
                            key={s.klic}
                            data-testid="sarze-staceni"
                            className="rounded-lg border border-neutral-200 border-l-4 border-l-amber-500 bg-white p-1.5 space-y-1.5"
                          >
                            {/* 🛢️ Sud a počet jsou vždycky vidět (jako text); měnit
                                se dají za tlačítkem „Sud". */}
                            <div className="flex items-start gap-2">
                              <span className="flex-1 min-w-0 pt-1.5 text-sm font-black text-amber-950 tabular-nums">
                                <IkonaSud className="ikona-text" /> {radekSarze(s, obalPodleId, objemSudu)}
                              </span>
                              {nositel && (
                                <button
                                  type="button"
                                  className="btn-ghost !px-2.5 !gap-1.5 text-xs shrink-0"
                                  aria-expanded={upravaSudu}
                                  onClick={() => setSudOtevreny((o) => ({ ...o, [s.klic]: !upravaSudu }))}
                                >
                                  <Pencil size={14} /> Sud
                                </button>
                              )}
                            </div>

                            {souhrn.chybiVelikost && (
                              <p className="text-xs font-black text-rose-700" role="alert">
                                Vyber velikost sudu — bez ní se {pocetSuduCesky(s.sudu)} ze skladu neodečtou.
                              </p>
                            )}

                            {nositel && upravaSudu && (
                              <div className="space-y-1.5 rounded bg-amber-50/70 border border-amber-100 p-1.5">
                                <VyberZdrojovehoSudu
                                  sudy={sudy}
                                  vybrany={s.zdrojPackageId ?? ''}
                                  zmen={(id) => onZmenSud(nositel.id, id)}
                                />
                                <div className="flex items-center gap-1.5">
                                  <button type="button" onClick={() => onSudy(nositel.id, -1)} className="btn-pocet" aria-label="Ubrat sud">−</button>
                                  <span className="text-base font-black text-amber-900 tabular-nums min-w-[4.5rem] text-center">
                                    {s.sudu} <IkonaSud className="ikona-text" />
                                  </span>
                                  <button type="button" onClick={() => onSudy(nositel.id, 1)} className="btn-pocet" aria-label="Přidat sud">+</button>
                                  {s.zdrojPackageId && s.sudu > 0 && (
                                    <button
                                      type="button"
                                      className="btn-ghost !px-2.5 !gap-1.5 text-xs ml-auto"
                                      onClick={() => onDalsiSud(s.polozky.map((p) => p.zaznam), s.zdrojPackageId!, s.sudu)}
                                    >
                                      <Plus size={14} /> Další sud
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* … a co se z něj stočilo — každý záznam na jednom
                                řádku: obal, kusy, tlačítka. Odkud se záznam vzal
                                (zaškrtnutí u objednávky, inventura) je pod ním. */}
                            <div className="space-y-1">
                              {s.polozky.map(({ zaznam: r }) => {
                                const pkg = obalPodleId.get(r.package_id ?? '');
                                const puvod = puvodZapisu(r.note);
                                return (
                                  <div key={r.id} data-testid="zaznam-staceni" className="flex flex-wrap items-center gap-1 rounded bg-amber-50/70 border border-amber-100 pl-2 pr-1 py-0.5">
                                    <span className="shrink-0 text-sm font-black text-amber-900 whitespace-nowrap">{popisObalu(pkg, r)}</span>
                                    {/* ⚠️ KUSY, ne litry (z provozu 19. 9. 2026: „nejsou to
                                        litry, ale ks."). */}
                                    <span className="shrink-0 font-display font-black text-base text-amber-950 tabular-nums whitespace-nowrap">{r.quantity} ks</span>
                                    <span className="flex-1" />
                                    <button type="button" onClick={() => onKus(r.id, -1)} className="btn-pocet" aria-label="Ubrat kus">−</button>
                                    <button type="button" onClick={() => onKus(r.id, 1)} className="btn-pocet" aria-label="Přidat kus">+</button>
                                    <button type="button" onClick={() => onUpravit(r)} className="btn-ghost !flex-none !w-11 !px-0" title="Upravit záznam" aria-label="Upravit záznam"><Pencil size={16} /></button>
                                    <button type="button" onClick={() => onSmazat(r.id)} className="btn-danger !flex-none !w-11 !px-0" title="Smazat záznam" aria-label="Smazat záznam"><X size={18} /></button>
                                    {puvod && (
                                      <span
                                        className="basis-full min-w-0 truncate text-udaj leading-4 font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                                        title={puvod.popis}
                                      >
                                        <ClipboardList size={11} className="shrink-0" />
                                        <span className="truncate">{puvod.popis}</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * „1× KEG 50 L · stočeno 91 L · výtrata 3,2 %" — šarže na jeden řádek.
 *
 * Výtrata se píše jen tam, kde je z čeho ji spočítat (viz souhrnSarze);
 * chybějící velikost sudu se napíše výslovně, ne tichým prázdnem.
 */
function radekSarze(s: Sarze<EntryRow>, obalPodleId: Map<string, Package>, objemSudu: (id: string) => number): string {
  const souhrn = souhrnSarze(s, objemSudu);
  const sud = s.zdrojPackageId ? obalPodleId.get(s.zdrojPackageId) : undefined;
  const casti: string[] = [];
  if (s.sudu > 0 && sud) casti.push(`${s.sudu}× ${popisSudu(sud)}`);
  else if (souhrn.chybiVelikost) casti.push(`${s.sudu}× sud — velikost chybí`);
  else casti.push('bez sudu');
  casti.push(`stočeno ${cislo(souhrn.litry)} L`);
  if (souhrn.vytrata !== null) casti.push(`výtrata ${cislo(souhrn.vytrata)} %`);
  return casti.join(' · ');
}
