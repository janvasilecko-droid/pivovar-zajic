// 📋 Přehled stáčení lahví po dnech — tabulka jako v Excelu, v barvách Skladu.
// ---------------------------------------------------------------------------
// Zadání z 15. 10. 2026 (po 19. 9. a 12. 10. už potřetí): „udělej ten přehled
// ve stylu skladu, ale ať je vidět, kolik se stočilo z kolika sudů, výtrata,
// a šlo to editovat" — „je to stejná tabulka jako export lahví do Excelu."
//
// Co bylo špatné: dlaždice na pivo, z nich teprve po rozbalení sud, počet,
// litry a záznamy — číslo, které majitel chce vidět (kolik z kolika sudů,
// kolik lahví, jaká výtrata), bylo schované v textu uvnitř a nedalo se
// přepsat, jen přidávat a ubírat po jedné.
//
// Teď:
//  - DEN je pořád nadřazená skupina s vlastním pásem („Pondělí 12. 10." +
//    součet) — odděleně, ať je vidět, jaký den se co stáčelo,
//  - pod pásem je JEDNA tabulka se sloupci z exportu do Excelu:
//      Pivo │ Z sudů: 50 · 30 · 20 · 15 · 10 l │ Stočeno lahví: 1,5 · 1,0 · 0,5 · 0,33 l
//    a řádek je jedno stáčení (šarže), ne celé pivo — stejně jako řádek na
//    papírové tabulce, ze které se čte fotka,
//  - pod každým řádkem je jedna čárka textu: kolik se stočilo z kolika litrů
//    a jaká je výtrata (litry ze sudů − litry v lahvích); nezvykle nízká nebo
//    vysoká je červená. Ostatní, co patří k řádku (chybí velikost sudu, odkud
//    se řádek vzal, poznámka), je tamtéž,
//  - na TELEFONU se vedle sebe vejde šest sloupců, ne devět — a lahve by
//    utekly za okraj. Proto tam jsou jen základní sloupce a ty, ve kterých
//    něco je (viz viditelneSloupce); zbytek po „Všechny sloupce". Na počítači
//    je Excel celý. Název piva je při posouvání do strany přilepený vlevo,
//  - ČÍSLO V BUŇCE SE PŘEPÍŠE: klepni, napiš, Enter (nebo klepni jinam). Ve
//    sloupci sudů se tak změní počet sudů, nebo — když číslo napíšeš do jiné
//    velikosti — sudy se do té velikosti přesunou. Prázdné políčko / nula
//    smaže (s „Vrátit zpět"),
//  - klepnutí na název piva otevře podrobnosti: jednotlivé záznamy (±1,
//    úprava, smazání), „Další sud", změna dne a piva a smazání celého řádku.
//
// Jediná věc, která se v tabulce nikdy neschová, je řádek s počtem sudů BEZ
// jejich velikosti (červeně, buňky sudů mají otazník): bez velikosti sklad
// sudy neodečte a nikdo by si toho nevšiml.
//
// Počítání (řádky, součty, co se má zapsat) je v lib/prehledStaceniTabulka.ts;
// zápisy do databáze zůstávají v BottlingScreen a chodí sem jako funkce.
import { Fragment, useEffect, useRef, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Beer, EntryRow, Package } from '../lib/supabase';
import { beerBg, beerBorder, beerText, formatPackageLabel } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { chyba } from '../lib/toast';
import { puvodZapisu } from '../lib/puvodZapisu';
import { dnyStaceni, nazevDne, pocetSuduCesky, type DavkaStaceni } from '../lib/prehledStaceni';
import { SLOUPCE_LAHVE, SLOUPCE_SUDY, popisSloupce } from '../lib/prehledVydeje';
import {
  popisObjemu, radkyDavky, sloupecSudu, souctyRadku, viditelneSloupce, vytrataKeKontrole,
  type RadekTabulky,
} from '../lib/prehledStaceniTabulka';
import { Modal } from './ui';
import { objemCesky } from './VyberObalu';
import { popisSudu } from './VyberZdrojovehoSudu';
import { IkonaLahev, IkonaSud } from './ikony';

const cislo = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** „1,5 L" — z objemu; obal mimo katalog se popíše tím, co je v záznamu. */
function popisObalu(pkg: Package | undefined, zaznam: EntryRow): string {
  return objemCesky(pkg?.volume_l) || formatPackageLabel(pkg?.label ?? zaznam.package_label) || '—';
}

/** Od jaké šířky (px) je Excel celý — shodně s `md:` v Tailwindu. */
const SIRKA_POCITACE = 768;

/**
 * Je obrazovka dost široká na všech devět sloupců? Bez `matchMedia` (testy,
 * starý prohlížeč) ano — raději všechno než schovaný sloupec.
 */
function useSirokaObrazovka(): boolean {
  const dotaz = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(min-width: ${SIRKA_POCITACE}px)`)
    : null);
  const [siroka, setSiroka] = useState(() => dotaz()?.matches ?? true);
  useEffect(() => {
    const mq = dotaz();
    if (!mq) return;
    const naZmenu = () => setSiroka(mq.matches);
    naZmenu();
    mq.addEventListener?.('change', naZmenu);
    return () => mq.removeEventListener?.('change', naZmenu);
  }, []);
  return siroka;
}

type Skupina = 'lahve' | 'sudy';

export type PrehledStaceniLahviProps = {
  davky: DavkaStaceni<EntryRow>[];
  piva: Beer[];
  obaly: Package[];
  getBatchId: (r: EntryRow) => string;
  /** Přepsané číslo v buňce lahví (text z políčka). Obrazovka si ho zkontroluje a zapíše. */
  onLahve: (radek: RadekTabulky, objem: number, text: string) => Promise<unknown>;
  /** Přepsané číslo v buňce sudů. */
  onSudy: (radek: RadekTabulky, objem: number, text: string) => Promise<unknown>;
  onSmazRadek: (radek: RadekTabulky) => void;
  /** Přesun celého řádku na jiný den nebo k jinému pivu. Vrací true, když se zapsalo. */
  onDatumPivo: (radek: RadekTabulky, zmena: { datum: string; beerId: string }) => Promise<boolean>;
  onDalsiSud: (zaznamy: EntryRow[], zdrojPackageId: string, sudu: number) => void;
  onKus: (id: string, delta: number) => void;
  onUpravit: (r: EntryRow) => void;
  onSmazat: (id: string) => void;
  /**
   * Zapnutý filtr obalu: v řádcích je jen část záznamů šarže. Výtrata by pak
   * vycházela špatně (chybí lahve ostatních obalů), prázdná buňka lahví může
   * mít schovaný záznam (nový by ho zdvojil) a „Další sud" i smazání celého
   * řádku pracují s celou šarží — proto se výtrata nepočítá, prázdné buňky
   * lahví jsou zamčené a ty dvě akce se schovají.
   */
  castecnyVyber?: boolean;
};

export default function PrehledStaceniLahvi({
  davky, piva, obaly, getBatchId, castecnyVyber = false,
  onLahve, onSudy, onSmazRadek, onDatumPivo, onDalsiSud, onKus, onUpravit, onSmazat,
}: PrehledStaceniLahviProps) {
  /** Buňka, ve které se zrovna píše. */
  const [editace, setEditace] = useState<{ klic: string; skupina: Skupina; objem: number } | null>(null);
  /** Buňky, jejichž zápis ještě běží (`klic|skupina|objem`). */
  const [ulozeni, setUlozeni] = useState<ReadonlySet<string>>(new Set());
  /** Řádek, jehož podrobnosti jsou otevřené. */
  const [vybranyKlic, setVybranyKlic] = useState<string | null>(null);
  /** Na telefonu: ukázat všech devět sloupců, ne jen použité. */
  const [vsechnySloupce, setVsechnySloupce] = useState(false);
  const siroka = useSirokaObrazovka();

  const dny = dnyStaceni(davky);
  const pivoPodleId = new Map(piva.map((b) => [b.id, b]));
  const obalPodleId = new Map(obaly.map((p) => [p.id, p]));
  const dnes = businessDateISO();

  const dnyRadky = dny.map((den) => ({ den, radky: den.davky.flatMap((d) => radkyDavky(d, obaly, getBatchId)) }));
  const vsechnyRadky = dnyRadky.flatMap((d) => d.radky);
  const vybrany = vybranyKlic ? vsechnyRadky.find((r) => r.klic === vybranyKlic) : undefined;

  const kompaktni = viditelneSloupce(vsechnyRadky, false);
  const maSchovane = kompaktni.sudy.length + kompaktni.lahve.length < SLOUPCE_SUDY.length + SLOUPCE_LAHVE.length;
  const sloupce = siroka || vsechnySloupce ? viditelneSloupce(vsechnyRadky, true) : kompaktni;
  const pocetSloupcu = 1 + sloupce.sudy.length + sloupce.lahve.length;

  const klicBunky = (r: RadekTabulky, skupina: Skupina, objem: number) => `${r.klic}|${skupina}|${objem}`;

  async function potvrdBunku(r: RadekTabulky, skupina: Skupina, objem: number, text: string, vychozi: string) {
    setEditace(null);
    // Nic se nezměnilo (klepl jsem a pustil) — žádný zápis, žádné hlášení.
    if (text.trim() === vychozi.trim()) return;
    const klic = klicBunky(r, skupina, objem);
    setUlozeni((s) => new Set(s).add(klic));
    try {
      await (skupina === 'lahve' ? onLahve(r, objem, text) : onSudy(r, objem, text));
    } catch (e) {
      // Obrazovka hlásí chyby sama; tohle je pojistka pro výjimku z ní (výpadek
      // sítě uprostřed zápisu) — zápis se nesmí tvářit, že se povedl.
      chyba(e);
    } finally {
      setUlozeni((s) => { const n = new Set(s); n.delete(klic); return n; });
    }
  }

  /** Buňka tabulky: číslo, na které se dá klepnout a přepsat ho. */
  function bunka(r: RadekTabulky, skupina: Skupina, objem: number, hodnota: number, opts: { vice?: boolean; otaznik?: boolean; vychozi: string }) {
    const klic = klicBunky(r, skupina, objem);
    const popis = skupina === 'lahve'
      ? `${r.beerName} · ${popisObjemu(objem)} lahve`
      : `${r.beerName} · sud ${popisObjemu(objem)}`;
    if (editace && editace.klic === r.klic && editace.skupina === skupina && editace.objem === objem) {
      return (
        <PolicekCisla
          vychozi={opts.vychozi}
          popisek={`${popis} — počet`}
          onPotvrdit={(text) => void potvrdBunku(r, skupina, objem, text, opts.vychozi)}
          onZrusit={() => setEditace(null)}
        />
      );
    }
    const uklada = ulozeni.has(klic);
    // Filtr obalu: prázdná buňka lahví může mít schovaný záznam — nový by ho zdvojil.
    const zamceno = castecnyVyber && skupina === 'lahve' && hodnota === 0;
    const stav = opts.otaznik ? 'velikost sudu chybí' : hodnota > 0 ? (skupina === 'lahve' ? `${hodnota} ks` : `${hodnota}×`) : zamceno ? 'prázdné (zamčeno filtrem obalu)' : 'prázdné';
    const barva = opts.otaznik
      ? 'bg-rose-50 text-rose-700 border border-dashed border-rose-300'
      : hodnota > 0
        ? (skupina === 'lahve' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900')
        : 'text-neutral-500 hover:bg-neutral-100';
    return (
      <button
        type="button"
        aria-label={`${popis}: ${stav}${opts.vice ? ' (víc záznamů — otevři podrobnosti)' : ''}`}
        aria-busy={uklada || undefined}
        disabled={uklada || zamceno}
        title={zamceno ? 'Filtr obalu je zapnutý — vypni ho a zadej počet' : undefined}
        onClick={() => (opts.vice ? setVybranyKlic(r.klic) : setEditace({ klic: r.klic, skupina, objem }))}
        className={`block mx-auto w-full max-w-[4.5rem] min-h-[44px] min-w-[2.5rem] rounded-md px-0.5 text-sm font-extrabold tabular-nums transition ${barva} ${uklada ? 'opacity-50' : ''}`}
      >
        {opts.otaznik ? '?' : hodnota > 0 ? hodnota : '·'}
        {opts.vice && <span className="text-udaj font-bold align-top"> ×{r.lahve.find((b) => b.objem === objem)?.zaznamy.length}</span>}
      </button>
    );
  }

  /** Litry a výtrata — „89 L z 100 L · výtrata 11 %"; stáčení z tanku je „20 L · bez sudu". */
  function souhrn(litry: number, zdrojL: number, vytrata: number | null, sudu: number | null) {
    if (castecnyVyber) return <span>{cislo(litry)} L (jen vybrané obaly)</span>;
    const kontrola = vytrataKeKontrole(vytrata);
    return (
      <>
        <span>{zdrojL > 0 ? `${cislo(litry)} L z ${cislo(zdrojL)} L` : `${cislo(litry)} L`}</span>
        {vytrata !== null && (
          <span
            data-testid="vytrata-radku"
            title={kontrola
              ? (vytrata < 0
                ? 'Záporná výtrata: v lahvích je víc piva, než sudy pojmou — chybí sud, nebo je sud zapsaný u jiného řádku.'
                : 'Vysoká výtrata: z lahví vyšlo mnohem míň piva, než bylo v sudech — zkontroluj počty.')
              : 'Výtrata: kolik piva ze sudů se nedostalo do lahví.'}
            className={`rounded px-1.5 ${kontrola ? 'bg-rose-700 text-white' : 'bg-neutral-100 text-neutral-900'}`}
          >
            výtrata {cislo(vytrata)} %
          </span>
        )}
        {sudu === 0 && <span className="text-neutral-600">bez sudu</span>}
      </>
    );
  }

  return (
    <div className="space-y-3" data-testid="prehled-po-dnech">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex-1 min-w-[14rem] text-udaj text-neutral-600">
          Klepni na číslo a přepiš ho (Enter uloží, nula nebo prázdné smaže). Klepnutí na název piva otevře podrobnosti.
          {castecnyVyber && (
            <b className="block text-amber-900" role="status">
              Filtr obalu je zapnutý: výtrata se nepočítá a prázdné buňky lahví jsou zamčené — řádky ukazují jen část stáčení.
            </b>
          )}
        </p>
        {!siroka && (maSchovane || vsechnySloupce) && (
          <button type="button" className="btn-ghost btn-sm" aria-pressed={vsechnySloupce} onClick={() => setVsechnySloupce((v) => !v)}>
            {vsechnySloupce ? 'Jen použité sloupce' : 'Všechny sloupce'}
          </button>
        )}
      </div>

      {dnyRadky.map(({ den, radky }) => {
        const soucty = souctyRadku(radky);
        return (
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

            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm" aria-label={`Stáčení lahví — ${nazevDne(den.datum)}`}>
                <thead>
                  <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50">
                    <th scope="col" rowSpan={2} className="sticky left-0 z-[1] bg-neutral-50 text-left align-bottom px-2 pb-1 w-[5rem] min-w-[5rem] md:w-[9rem] md:min-w-[9rem]">Pivo</th>
                    <th scope="colgroup" colSpan={sloupce.sudy.length} className="text-center pt-1 border-l border-neutral-200">
                      <IkonaSud className="ikona-text" /> Z sudů
                    </th>
                    <th scope="colgroup" colSpan={sloupce.lahve.length} className="text-center pt-1 border-l border-neutral-200">
                      <IkonaLahev className="ikona-text" /> Stočeno lahví
                    </th>
                  </tr>
                  <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50">
                    {sloupce.sudy.map((l, i) => (
                      <th key={`s${l}`} scope="col" className={`pb-1 px-px min-w-[2.5rem] text-center ${i === 0 ? 'border-l border-neutral-200' : ''}`}>{popisSloupce(l)}</th>
                    ))}
                    {sloupce.lahve.map((l, i) => (
                      <th key={`l${l}`} scope="col" className={`pb-1 px-px min-w-[2.5rem] text-center ${i === 0 ? 'border-l border-neutral-200' : ''}`}>{popisSloupce(l)}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {radky.map((r) => {
                    const beer = pivoPodleId.get(r.beerId ?? '');
                    const sloupec = sloupecSudu(r.sudObjem);
                    const sudMimoSloupce = r.sudu > 0 && !r.chybiVelikost && sloupec < 0;
                    return (
                      <Fragment key={r.klic}>
                        <tr data-testid="radek-staceni">
                          <th
                            scope="row"
                            className="sticky left-0 z-[1] p-0 text-left align-top border-t-2 border-black/15 border-l-4"
                            style={{ backgroundColor: beerBg(beer), borderLeftColor: beerBorder(beer) }}
                          >
                            <button
                              type="button"
                              onClick={() => setVybranyKlic(r.klic)}
                              className={`relative w-full min-h-[44px] pl-2 pr-4 py-1.5 text-left font-black text-[13px] md:text-sm leading-tight break-words ${beerText(beer)}`}
                              title="Podrobnosti a úpravy řádku"
                              aria-label={`Podrobnosti: ${r.beerName}`}
                            >
                              {r.beerName}
                              <Pencil size={11} className="absolute right-1 bottom-1 opacity-70" aria-hidden />
                            </button>
                          </th>

                          {sloupce.sudy.map((l) => {
                            const stejna = sloupec >= 0 && SLOUPCE_SUDY[sloupec] === l;
                            return (
                              <td key={`s${l}`} className={`p-px text-center border-t-2 border-black/15 ${l === sloupce.sudy[0] ? 'border-l border-l-neutral-200' : ''}`}>
                                {bunka(r, 'sudy', l, stejna ? r.sudu : 0, {
                                  otaznik: r.chybiVelikost,
                                  // Číslo se předvyplní jen tam, kde sud je. V jiných sloupcích
                                  // se píše znovu — klepnutí „jen se podívat" nesmí sudy přesunout.
                                  vychozi: stejna ? String(r.sudu) : '',
                                })}
                              </td>
                            );
                          })}
                          {sloupce.lahve.map((l) => {
                            const b = r.lahve.find((x) => x.objem === l)!;
                            return (
                              <td key={`l${l}`} className={`p-px text-center border-t-2 border-black/15 ${l === sloupce.lahve[0] ? 'border-l border-l-neutral-200' : ''}`}>
                                {bunka(r, 'lahve', l, b.ks, {
                                  vice: b.zaznamy.length > 1,
                                  vychozi: b.ks > 0 ? String(b.ks) : '',
                                })}
                              </td>
                            );
                          })}
                        </tr>

                        <tr>
                          <td
                            colSpan={pocetSloupcu}
                            className="p-0 border-l-4 bg-neutral-50"
                            style={{ borderLeftColor: beerBorder(beer) }}
                          >
                            {/* Přilepené vlevo, ať při posouvání široké tabulky zůstane čitelné. */}
                            <div className="sticky left-0 max-w-[calc(100vw-3rem)] px-2 py-1 space-y-0.5 text-xs">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold tabular-nums text-neutral-800" data-testid="souhrn-radku">
                                {souhrn(r.litry, r.zdrojL, r.vytrata, r.sudu)}
                              </div>
                              {r.chybiVelikost && (
                                <p className="rounded bg-rose-700 text-white px-1.5 py-0.5 font-black" role="alert">
                                  {pocetSuduCesky(r.sudu)} — vyber velikost sudu klepnutím do sloupce, jinak se ze skladu neodečtou.
                                </p>
                              )}
                              {sudMimoSloupce && (
                                <p className="font-bold text-neutral-800">
                                  {r.sudu}× {r.sudObjem > 0 ? `KEG ${popisObjemu(r.sudObjem)}` : 'sud — obal chybí v katalogu'}
                                </p>
                              )}
                              {r.lahveJine.length > 0 && (
                                <p className="font-bold text-neutral-800">
                                  jiné obaly: {r.lahveJine.map((z) => `${z.quantity}× ${popisObalu(obalPodleId.get(z.package_id ?? ''), z)}`).join(', ')}
                                </p>
                              )}
                              {r.puvod && (
                                <p
                                  className="leading-4 font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 flex items-start gap-1"
                                  title={r.puvod}
                                >
                                  <ClipboardList size={11} className="shrink-0 mt-0.5" />
                                  <span>{r.puvod}</span>
                                </p>
                              )}
                              {r.poznamka && (
                                <p className="font-semibold text-neutral-700 whitespace-pre-line break-words line-clamp-2" title={r.poznamka}>{r.poznamka}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr data-testid="celkem-dne" className="bg-amber-50 text-amber-950">
                    <th scope="row" className="sticky left-0 z-[1] bg-amber-50 text-left align-middle px-2 py-1.5 border-t-2 border-amber-300 text-[13px] font-black">
                      Celkem
                    </th>
                    {sloupce.sudy.map((l) => {
                      const n = soucty.sudy[SLOUPCE_SUDY.indexOf(l)];
                      return <td key={`s${l}`} className={`px-px py-1.5 text-center font-black tabular-nums border-t-2 border-amber-300 ${l === sloupce.sudy[0] ? 'border-l' : ''}`}>{n || '—'}</td>;
                    })}
                    {sloupce.lahve.map((l) => {
                      const n = soucty.lahve[SLOUPCE_LAHVE.indexOf(l)];
                      return <td key={`l${l}`} className={`px-px py-1.5 text-center font-black tabular-nums border-t-2 border-amber-300 ${l === sloupce.lahve[0] ? 'border-l' : ''}`}>{n || '—'}</td>;
                    })}
                  </tr>
                  <tr className="bg-amber-50 text-amber-950">
                    <td colSpan={pocetSloupcu} className="p-0">
                      <div className="sticky left-0 max-w-[calc(100vw-3rem)] px-2 pb-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold tabular-nums" data-testid="celkem-litry">
                          {souhrn(soucty.litry, soucty.zdrojL, soucty.vytrata, null)}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      {vybrany && (
        <DetailRadku
          radek={vybrany}
          piva={piva}
          obalPodleId={obalPodleId}
          onZavrit={() => setVybranyKlic(null)}
          onKus={onKus}
          onUpravit={onUpravit}
          onSmazat={onSmazat}
          onSmazRadek={onSmazRadek}
          onDalsiSud={onDalsiSud}
          onDatumPivo={onDatumPivo}
          castecnyVyber={castecnyVyber}
        />
      )}
    </div>
  );
}

/**
 * Políčko pro přepsání čísla v buňce. Enter nebo klepnutí jinam uloží, Escape
 * vrátí původní číslo. Druhé volání po prvním (blur po Enteru) se ignoruje.
 */
export function PolicekCisla({ vychozi, popisek, onPotvrdit, onZrusit }: {
  vychozi: string;
  popisek: string;
  onPotvrdit: (text: string) => void;
  onZrusit: () => void;
}) {
  const [text, setText] = useState(vychozi);
  const hotovo = useRef(false);
  const dokonci = (ulozit: boolean) => {
    if (hotovo.current) return;
    hotovo.current = true;
    if (ulozit) onPotvrdit(text); else onZrusit();
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus
      aria-label={popisek}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => dokonci(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); dokonci(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dokonci(false); }
      }}
      className="block mx-auto w-full max-w-[4.5rem] min-w-[2.5rem] min-h-[44px] rounded-md border-2 border-amber-500 bg-white px-1 text-center text-sm font-extrabold tabular-nums text-neutral-900"
    />
  );
}

/**
 * Podrobnosti jednoho řádku: záznamy po jednom, „Další sud", den a pivo,
 * smazání celého řádku. Je to dialog, ne rozbalený řádek — tabulka se na
 * telefonu posouvá do strany a rozbalená část by odjížděla s ní.
 */
function DetailRadku({ radek, piva, obalPodleId, castecnyVyber, onZavrit, onKus, onUpravit, onSmazat, onSmazRadek, onDalsiSud, onDatumPivo }: {
  radek: RadekTabulky;
  piva: Beer[];
  obalPodleId: Map<string, Package>;
  castecnyVyber: boolean;
  onZavrit: () => void;
  onKus: (id: string, delta: number) => void;
  onUpravit: (r: EntryRow) => void;
  onSmazat: (id: string) => void;
  onSmazRadek: (radek: RadekTabulky) => void;
  onDalsiSud: (zaznamy: EntryRow[], zdrojPackageId: string, sudu: number) => void;
  onDatumPivo: (radek: RadekTabulky, zmena: { datum: string; beerId: string }) => Promise<boolean>;
}) {
  const [datum, setDatum] = useState(radek.datum);
  const [pivoId, setPivoId] = useState(radek.beerId ?? '');
  const [uklada, setUklada] = useState(false);
  const zmeneno = datum !== radek.datum || pivoId !== (radek.beerId ?? '');
  const sud = radek.sudPkgId ? obalPodleId.get(radek.sudPkgId) : undefined;

  async function ulozZmenu() {
    setUklada(true);
    try {
      if (await onDatumPivo(radek, { datum, beerId: pivoId })) onZavrit();
    } finally {
      setUklada(false);
    }
  }

  return (
    <Modal open onClose={onZavrit} title={`${radek.beerName} · ${nazevDne(radek.datum)}`}>
      <div className="space-y-4" data-testid="detail-radku">
        <div className="space-y-1.5">
          <p className="text-sm font-black text-amber-950 tabular-nums">
            <IkonaSud className="ikona-text" />{' '}
            {radek.sudu > 0
              ? `${radek.sudu}× ${sud ? popisSudu(sud) : 'sud — velikost chybí'}`
              : 'bez sudu (stáčeno rovnou z tanku)'}
          </p>
          <p className="text-udaj text-neutral-600">Počet a velikost sudu se mění v tabulce — klepni na číslo ve sloupci s velikostí.</p>
          {radek.sudPkgId && radek.sudu > 0 && !castecnyVyber && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !gap-1.5 text-xs"
              onClick={() => { onZavrit(); onDalsiSud(radek.zaznamy, radek.sudPkgId!, radek.sudu); }}
            >
              <Plus size={14} /> Další sud
            </button>
          )}
        </div>

        <div className="space-y-1">
          {radek.zaznamy.map((r) => {
            const pkg = obalPodleId.get(r.package_id ?? '');
            const puvod = puvodZapisu(r.note);
            return (
              <div key={r.id} data-testid="zaznam-staceni" className="flex flex-wrap items-center gap-1 rounded bg-amber-50/70 border border-amber-100 pl-2 pr-1 py-0.5">
                <span className="shrink-0 text-sm font-black text-amber-900 whitespace-nowrap">{popisObalu(pkg, r)}</span>
                {/* ⚠️ KUSY, ne litry (z provozu 19. 9. 2026: „nejsou to litry, ale ks."). */}
                <span className="shrink-0 font-display font-black text-base text-amber-950 tabular-nums whitespace-nowrap">{r.quantity} ks</span>
                <span className="flex-1" />
                <button type="button" onClick={() => onKus(r.id, -1)} className="btn-pocet" aria-label="Ubrat kus">−</button>
                <button type="button" onClick={() => onKus(r.id, 1)} className="btn-pocet" aria-label="Přidat kus">+</button>
                <button type="button" onClick={() => { onZavrit(); onUpravit(r); }} className="btn-ghost !flex-none !w-11 !px-0" title="Upravit záznam" aria-label="Upravit záznam"><Pencil size={16} /></button>
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

        <div className="space-y-2 rounded border border-neutral-200 p-2">
          <div className="text-xs font-black uppercase tracking-wide text-neutral-600">Den a pivo celého řádku</div>
          <label className="block text-xs font-bold text-neutral-700">
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="input mt-0.5 w-full" />
          </label>
          <label className="block text-xs font-bold text-neutral-700">
            Pivo
            <select value={pivoId} onChange={(e) => setPivoId(e.target.value)} className="input mt-0.5 w-full">
              {radek.beerId && !piva.some((b) => b.id === radek.beerId) && <option value={radek.beerId}>{radek.beerName}</option>}
              {piva.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn-amber w-full" disabled={!zmeneno || uklada} onClick={() => void ulozZmenu()}>
            {uklada ? 'Ukládám…' : 'Uložit den a pivo'}
          </button>
        </div>

        {castecnyVyber ? (
          <p className="text-udaj font-bold text-amber-900" role="status">
            Filtr obalu je zapnutý — „Další sud“ a smazání celého řádku jdou až po jeho vypnutí (pracují s celým stáčením, ne jen s vybranými obaly).
          </p>
        ) : (
          <button
            type="button"
            className="btn-danger w-full"
            onClick={() => { onZavrit(); onSmazRadek(radek); }}
          >
            <Trash2 size={16} /> Smazat celý řádek
          </button>
        )}
      </div>
    </Modal>
  );
}
