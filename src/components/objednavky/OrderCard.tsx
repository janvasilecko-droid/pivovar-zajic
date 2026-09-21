// 📦 Karta jedné objednávky v přehledu — část obrazovky Objednávky.

import { AlertTriangle, Ban, Beer as BeerIcon, Calendar, Check, CheckCircle2, Copy, Hourglass, MessageCircle, NotebookPen, Pencil, Phone, RotateCcw, Split, Trash2, Truck, Droplet } from 'lucide-react';
import { Beer, Package, Place, beerBg, formatPackageLabel } from '../../lib/supabase';

import { schodkyObjednavky } from '../../lib/tydenniZbytek';
import type {  } from '../../lib/stockLedger';

import { DAYS } from '../../lib/shared';

import type {  } from '../../lib/tankUZapisu';

import { shareOrderToWhatsApp } from '../../lib/whatsapp';

import { StitekStavu } from '../StitekStavu';
import { jeVyrizena } from '../../lib/stavyObjednavek';
import { vracenoPodleObjednavky } from '../../lib/vraceniZObjednavky';

import { type Order, type OrderItem, dayColor, getTapNameForOrder } from './spolecne';

export function OrderCard({ o, items, stockRemainingForOrder, selected, onToggleSelect, onClick, onToggleFlag, onToggleItemFlag, onUpdateDeliveryDay, onSetStatus, onDelete, onDuplicate, onEdit, onSplit, onOpenWhatsApp, onVratitPivo, vracenoZaznamy, beers, packages, places, activeBeerId, activePackageId, itemMatchesFilter }: {
  o: Order; items: OrderItem[];
  /**
   * Zbytek skladu ke konci týdne PRO TUHLE KONKRÉTNÍ objednávku — objednávky
   * stejného týdne na stejné pivo+obal soutěží o sklad podle dne dovozu (viz
   * zbytekPodleObjednavek v lib/tydenniZbytek.ts), takže dvě různé objednávky
   * mohou pro stejné pivo+obal dostat různý zbytek.
   */
  stockRemainingForOrder: (o: Order) => Map<string, number>;
  selected: boolean; onToggleSelect: () => void; onClick: () => void;
  onToggleFlag: (o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') => void;
  onToggleItemFlag: (o: Order, it: OrderItem, key: 'is_bottled' | 'is_prepared') => void;
  onUpdateDeliveryDay: (o: Order, day: string) => void;
  onSetStatus: (o: Order, status: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (o: Order) => void;
  onEdit: (o: Order) => void;
  /** Rozdělit na dva odběratele (viz SplitOrderModal) — jen když má aspoň 2 položky. */
  onSplit: (o: Order) => void;
  onOpenWhatsApp?: (messageId: string) => void;
  /** „Vrátit pivo" — otevře VratitPivoModal pro tuhle objednávku (viz Orders.tsx). */
  onVratitPivo?: (o: Order) => void;
  /** Řádky inventory_adjustments s order_id téhle objednávky — pro dopočet efektivního množství. */
  vracenoZaznamy?: { beer_id: string | null; package_id: string | null; quantity: number }[];
  beers: Beer[];
  packages: Package[];
  places: Place[];
  activeBeerId?: string | null;
  activePackageId?: string | null;
  /**
   * Filtr obalu/piva/druhu z Přehledu (viz matchesItemFilters u Orders).
   * Objednávka se zobrazuje celá, jakmile filtru vyhoví JEDEN její řádek
   * (viz searchedFiltered) — bez tohohle by ale karta pořád vypisovala i
   * ty řádky, které filtru nevyhovují. Z provozu 9. 9. 2026: „dal jsem
   * filtr na sudy KEG a stejně tam vidím objednávky na PET 1l" — objednávka
   * měla sudy i petky dohromady, karta ukázala obojí.
   * `undefined` = žádný filtr aktivní, zobrazí se úplně všechno jako dřív.
   * (Převzato z nesloučeného PR #37.)
   */
  itemMatchesFilter?: (item: OrderItem) => boolean;
}) {

  const total = items.reduce((s, i) => s + Number(i.quantity), 0);
  // ⚠️ CO TENHLE ODZNAK VLASTNĚ MĚŘÍ. Ne „na tuhle objednávku nemám pivo",
  // ale „tahle kombinace piva a obalu je ke konci týdne závozu v mínusu" —
  // počítá se ze skladové knihy přes VŠECHNY pohyby toho týdne. Proto se
  // ukáže na každé objednávce, která tu kombinaci obsahuje.
  //
  // U objednávky, která už fyzicky odjela, to nedává smysl a mate to:
  // z provozu přišlo „stočil jsem 4×30, a u objednávky mi to píše, že
  // 4×30 chybí" — u objednávky se stavem Zavezeno. To pivo už je pryč,
  // varovat u ní o nedostatku je rada, kterou nejde uposlechnout.
  const odbaveno = o.is_delivered || jeVyrizena(o.status) || o.status === 'storno';
  // Schodek se posuzuje podle PIVA A OBALU: chybějící sudy nevykryjí lahve,
  // i když je v nich totéž pivo (viz lib/tydenniZbytek.ts).
  const remaining = stockRemainingForOrder(o);
  // Obal patří do popisku: schodek se počítá po pivu A obalu, takže bez něj by
  // dvě velikosti téhož piva vypadaly jako tentýž údaj napsaný dvakrát.
  const uniqueDeficits = (odbaveno ? [] : schodkyObjednavky(items, remaining)).map((s) => {
    const obal = packages.find((p) => p.id === s.package_id);
    return {
      name: obal ? `${s.beer_name} ${formatPackageLabel(obal.label)}` : s.beer_name,
      missing: s.chybi,
    };
  });
  
  // Seřadit položky: nejdříve kegy, pak lahve podle názvu
  const sortedItems = [...items].sort((a, b) => {
    const pkgA = packages.find((p) => p.id === a.package_id);
    const pkgB = packages.find((p) => p.id === b.package_id);
    const kindA = pkgA?.kind ?? 'bottle';
    const kindB = pkgB?.kind ?? 'bottle';
    
    // Nejdříve seřadit podle druhu: keg před bottle
    if (kindA === 'keg' && kindB !== 'keg') return -1;
    if (kindA !== 'keg' && kindB === 'keg') return 1;
    
    // Uvnitř stejného druhu seřadit podle názvu obalu
    const labelA = a.package_label ?? '';
    const labelB = b.package_label ?? '';
    const podleObalu = labelA.localeCompare(labelB, 'cs');
    if (podleObalu !== 0) return podleObalu;

    // A při shodném obalu podle piva, nakonec podle id.
    //
    // PROČ AŽ TAK DOPODROBNA: bez toho rozhodovalo pořadí z databáze —
    // a to se u upraveného řádku mění (Postgres ho po UPDATE vrátí jinde).
    // Odškrtnutí „stočeno" tedy řádek přehodilo na konec seznamu, takže
    // se pod prstem hýbaly položky, které se nikdo nechystal měnit.
    const podlePiva = (a.beer_name ?? '').localeCompare(b.beer_name ?? '', 'cs');
    return podlePiva !== 0 ? podlePiva : a.id.localeCompare(b.id);
  });

  // Karta se ukazuje celá, jakmile filtru vyhoví JEDEN řádek — řádky, které
  // nevyhovují, se ale v seznamu nezobrazují (viz itemMatchesFilter výše).
  // `total` a `uniqueDeficits` výš záměrně počítají se VŠEMI položkami
  // objednávky — je to skutečný stav objednávky, ne stav po filtru.
  const viditelnePolozky = itemMatchesFilter ? sortedItems.filter(itemMatchesFilter) : sortedItems;
  const skrytoFiltrem = sortedItems.length - viditelnePolozky.length;

  // ↩️ Vrácené kusy po (pivo, obal) — položky objednávky se NEMĚNÍ (svědectví
  // o tom, co se doopravdy zavezlo), jen se u nich dopočítá efektivní počet.
  // Z provozu 21. 9. 2026: „obednavka zustane stejna ale pribude radek kde
  // bude vraceny pivo... bude tam napsano ze se pocita 4x30 a 1x30 vraceno."
  const jizVraceno = vracenoZaznamy?.length ? vracenoPodleObjednavky(vracenoZaznamy) : null;

  return (
    <div
      className={`card-hover p-2.5 cursor-pointer relative overflow-hidden transition-all border-2 bg-white border-neutral-200 ${selected ? 'ring-2 ring-primary-500' : ''}`}
      onClick={onClick}
    >
      {dayColor(o.delivery_day) && (
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${dayColor(o.delivery_day)!.bar}`} />
      )}
      <div className="flex flex-col gap-1.5 pl-1.5">
        {/* Řádek 1: checkbox + název odběratele. Nic jiného — jméno se nesmí
            zkracovat, je to první věc, podle které se objednávka pozná. */}
        <div className="flex items-start gap-1.5 min-w-0">
          <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onToggleSelect}
            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500 shrink-0 mt-0.5" />
          <span className="font-display font-black text-sm sm:text-base text-neutral-800 break-words min-w-0 flex-1">
            {/* o.place_name je denormalizovaná kopie jména odběratele — u pár
                objednávek (podle zdroje vzniku) zůstala prázdná i když
                place_id na skutečného odběratele ukazuje. Dřív se v takovém
                případě nezobrazilo vůbec nic (jen "—" pro NULL, ale prázdný
                řetězec `?? '—'` nechytí), takže šlo omylem přehlídnout, kdo
                objednávku vlastně zadal. Teď se jako záloha dohledá podle
                place_id v katalogu odběratelů. */}
            {(o.place_name && o.place_name.trim())
              || (o.place_id && places.find((p) => p.id === o.place_id)?.name)
              || '—'}
          </span>
        </div>

        {/* Řádek 2: štítky (výčep, stav, termíny) a akce. Dřív stály na jedné
            řádce s názvem odběratele — všechny mají shrink-0, takže na telefonu
            ukrojily celou šířku a z „Louka" zbylo „L…". */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {(() => { const tn = getTapNameForOrder(o.id); return tn ? (
            <span title={`Rezervace výčepu: ${tn}`} className="chip bg-violet-600 text-white font-black shrink-0 flex items-center gap-1">
              <BeerIcon className="ikona-text" /> {tn}
            </span>
          ) : null; })()}
          <StitekStavu status={o.status} tridy="font-black shrink-0" />
          {o.delivery_date && (
            <span className="chip bg-amber-700 text-white font-black shadow-2xs shrink-0 flex items-center gap-1" title="Datum akce / závozu">
              <Calendar size={12} /> {new Date(o.delivery_date).toLocaleDateString('cs-CZ')}
            </span>
          )}
          {o.delivery_day && (
            <span className={`chip ${dayColor(o.delivery_day)!.chip} shrink-0 flex items-center gap-1`}>
              <Truck size={12} /> {DAYS.find((d) => d.v === o.delivery_day)?.label ?? o.delivery_day}
            </span>
          )}
          <span className="text-udaj font-bold text-neutral-500 bg-white/80 border border-neutral-200 rounded-md px-1.5 py-0.5 shadow-2xs shrink-0 flex items-center gap-1" title="Datum zadání">
            <Calendar size={12} /> {new Date(o.order_date).toLocaleDateString('cs-CZ')}
          </span>
          <div className="ml-auto flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Připraveno: stejný formát jako akce dole — ikona 32×32,
                stav nese barva (zelená = připraveno, bílá = čeká). */}
            <button
              onClick={() => onToggleFlag(o, 'is_prepared')}
              className={`btn-ikona ${
                o.is_prepared
                  ? 'bg-emerald-700 text-white border border-emerald-700'
                  : 'bg-white text-neutral-800 border border-neutral-300 hover:bg-emerald-50'
              }`}
              title={o.is_prepared ? 'Připraveno — klepnutím zrušit' : 'Označit jako připraveno'}
              aria-label={o.is_prepared ? 'Připraveno' : 'Označit jako připraveno'}
            >
              {o.is_prepared ? <Check size={14} /> : <Hourglass size={14} />}
            </button>
          </div>
        </div>

        {/* Řádek 2: položky jako SEZNAM, ne jako rámečky.
            Rámečky (chipy) se na telefonu lámaly doprostřed řádku a čtyři
            piva vypadala jako jedna dlouhá věta. Seznam se čte shora dolů
            a hlavně: je v něm místo na odškrtnutí.

            Dvě zaškrtávátka u každé položky — stočeno (kapka) a připraveno
            (fajfka). Jsou to tytéž sloupce, které odškrtává Závoz, takže se
            to propíše na obě strany a jde to odškrtnout i zpátky. Schválně
            bez popisků: v přehledu jde o rychlé přejetí očima, ne o čtení. */}
        {viditelnePolozky.length > 0 && (
          <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
            {skrytoFiltrem > 0 && (
              <div className="text-udaj font-bold text-neutral-600 px-1.5 py-0.5">
                Filtr schoval {skrytoFiltrem} {skrytoFiltrem === 1 ? 'položku' : skrytoFiltrem < 5 ? 'položky' : 'položek'}.
              </div>
            )}
            {viditelnePolozky.map((i) => {
              const beer = i.beer_id ? beers.find((b) => b.id === i.beer_id) : null;
              const isBeerMatch = !!(activeBeerId && i.beer_id === activeBeerId);
              const isPkgMatch = !!(activePackageId && i.package_id === activePackageId);
              const bothActive = !!(activeBeerId && activePackageId);
              const zvyrazneno = bothActive ? (isBeerMatch && isPkgMatch) : (isBeerMatch || isPkgMatch);
              const vraceno = jizVraceno && i.beer_id && i.package_id
                ? (jizVraceno.get(`${i.beer_id}__${i.package_id}`) ?? 0)
                : 0;
              return (
                <div
                  key={i.id}
                  className={`flex items-center gap-2 rounded px-1.5 py-1 min-w-0 ${
                    zvyrazneno ? 'bg-violet-100 ring-1 ring-violet-400' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleItemFlag(o, i, 'is_bottled')}
                    title={i.is_bottled ? 'Stočeno — klepnutím zrušit' : 'Označit jako stočené'}
                    aria-label={i.is_bottled ? 'Stočeno' : 'Označit jako stočené'}
                    aria-pressed={!!i.is_bottled}
                    className={`w-6 h-6 shrink-0 grid place-items-center rounded border-2 transition ${
                      i.is_bottled
                        ? 'bg-amber-500 border-amber-600 text-neutral-950'
                        : 'bg-white border-neutral-400 text-neutral-600'
                    }`}
                  >
                    <Droplet size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleItemFlag(o, i, 'is_prepared')}
                    title={i.is_prepared ? 'Připraveno — klepnutím zrušit' : 'Označit jako připravené'}
                    aria-label={i.is_prepared ? 'Připraveno' : 'Označit jako připravené'}
                    aria-pressed={!!i.is_prepared}
                    className={`w-6 h-6 shrink-0 grid place-items-center rounded border-2 transition ${
                      i.is_prepared
                        ? 'bg-emerald-700 border-emerald-800 text-white'
                        : 'bg-white border-neutral-400 text-neutral-600'
                    }`}
                  >
                    <Check size={13} />
                  </button>
                  {beer && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20 vlastni-vyska"
                      style={{ backgroundColor: beerBg(beer) }}
                    />
                  )}
                  <span className={`font-black text-xs min-w-0 flex-1 break-words ${i.is_prepared ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
                    {i.beer_name ?? '?'}
                  </span>
                  <span className="text-xs font-bold text-neutral-700 shrink-0">
                    {formatPackageLabel(i.package_label)}
                  </span>
                  <span className="text-xs font-black text-amber-900 bg-amber-100 rounded px-1.5 py-0.5 shrink-0 tabular-nums">
                    {i.quantity} ks
                  </span>
                  {vraceno > 0 && (
                    <span
                      className="text-udaj font-black text-sky-900 bg-sky-100 border border-sky-300 rounded px-1.5 py-0.5 shrink-0 tabular-nums"
                      title={`Vráceno ${vraceno} ks zpátky na sklad — u objednávky se teď počítá ${Math.max(0, i.quantity - vraceno)} ks.`}
                    >
                      ↩ počítá se {Math.max(0, i.quantity - vraceno)}, {vraceno} vráceno
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Řádek 3: souhrn + stav skladu */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[11px] font-black text-neutral-700 shrink-0">
            {items.length} položek · {total} ks
          </span>
          {o.note && <span className="text-udaj font-extrabold shrink-0 text-neutral-900 bg-amber-100 border border-amber-300 rounded-md px-1.5 py-0.5"><NotebookPen className="ikona-text" /> {o.note}</span>}
          {o.whatsapp_message_id && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenWhatsApp && onOpenWhatsApp(o.whatsapp_message_id!); }}
              className="text-udaj font-extrabold shrink-0 text-emerald-900 bg-emerald-100 border border-emerald-300 rounded-md px-1.5 py-0.5 hover:bg-emerald-200 flex items-center gap-1 tap"
              title="Otevřít originální WhatsApp zprávu a kontrolu čtení (#18)"
            >
              <MessageCircle size={12} /> WhatsApp
            </button>
          )}
          {(() => { const _ph = places.find(p => p.id === o.place_id)?.phone; return _ph ? (
            <a href={`tel:${_ph}`} className="text-udaj text-sky-700 font-bold flex items-center gap-0.5 hover:underline shrink-0">
              <Phone size={12} /> <span>{_ph}</span>
            </a>
          ) : null; })()}
          {/* emerald, ne violet — "zavezeno" je stejný stav jako "připraveno"
              o pár řádků níž a jinde v souboru (2504, 3487), jen tady byl
              omylem jinou barvou. Podle docs/jednotny-styl.md emerald =
              potvrzení hotového (Hotovo, Zavezeno, Schválit). */}
          {o.is_delivered && <span className="chip bg-emerald-700 text-white font-black shadow-2xs flex items-center gap-1"><Check size={12} /> Zavez.</span>}
        </div>

        {/* Řádek 3: sklad + připraveno + den + akce */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {uniqueDeficits.length > 0 ? (
            <span
              className="flex items-center gap-1 text-udaj font-black text-rose-950 bg-rose-100 border border-rose-300 rounded-lg px-2 py-0.5 shadow-2xs"
              title={'Ke konci týdne závozu je tahle kombinace piva a obalu ve skladu v mínusu — počítá se ze všech pohybů toho týdne, ne jen z téhle objednávky.'}
            >
              <AlertTriangle size={12} />
              <span>Ke konci týdne chybí: {uniqueDeficits.map((d) => `${d.name} ${d.missing} ks`).join(', ')}</span>
            </span>
          ) : odbaveno ? null : items.length > 0 ? (
            <span className="flex items-center gap-1 text-udaj font-black text-emerald-950 bg-emerald-100 border border-emerald-300 rounded-lg px-2 py-0.5 shadow-2xs">
              <CheckCircle2 size={12} />
              <span>Vše skladem</span>
            </span>
          ) : null}
          {o.is_prepared && <span className="chip bg-emerald-700 text-white font-black shadow-2xs flex items-center gap-1"><Check size={12} /> Připr.</span>}

          <div className="flex items-center gap-1 ml-auto flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
            <span className="text-udaj font-extrabold text-neutral-900 shrink-0">Závoz:</span>
            <select
              className="input !py-0.5 !px-1.5 text-udaj font-bold w-20 bg-white border-amber-300 shadow-2xs"
              value={o.delivery_day ?? ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateDeliveryDay(o, e.target.value)}
            >
              <option value="">—</option>
              {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
            {/* 🔸 Akce jsou jen ikony (32×32), jednotně ve všech kartách —
                dřív měly texty (Upravit / WhatsApp / Duplik. / Zrušit /
                Smazat) a zalamovaly se přes celou šířku, takže na položky
                a ikony piv nad nimi zbývalo místo na jeden řádek. Význam
                nese barva a `title`/`aria-label`; ikona je 14 px, cíl 32. */}
            <button className="btn-ikona bg-amber-500 hover:bg-amber-400 text-neutral-950" onClick={() => onEdit(o)} title="Upravit objednávku" aria-label="Upravit objednávku">
              <Pencil size={14} />
            </button>
            <button className="btn-ikona bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300" onClick={() => shareOrderToWhatsApp(o, items)} title="Sdílet objednávku na WhatsApp" aria-label="Sdílet objednávku na WhatsApp">
              <MessageCircle size={14} />
            </button>
            <button className="btn-ikona bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300" onClick={() => onDuplicate(o)} title="Vytvořit stejnou objednávku znovu" aria-label="Duplikovat objednávku"><Copy size={14} /></button>
            {onVratitPivo && o.is_delivered && items.length > 0 && (
              <button
                className="btn-ikona bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300"
                onClick={() => onVratitPivo(o)}
                title="Vrátit pivo z téhle objednávky zpátky na sklad"
                aria-label="Vrátit pivo z téhle objednávky"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {items.length > 1 && (
              <button className="btn-ikona bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300" onClick={() => onSplit(o)} title="Rozdělit na dva odběratele" aria-label="Rozdělit objednávku na dva odběratele"><Split size={14} /></button>
            )}
            {o.status !== 'storno' && (
              <button className="btn-ikona bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200" onClick={() => onSetStatus(o, 'storno')} title="Zrušit / stornovat objednávku" aria-label="Zrušit objednávku"><Ban size={14} /></button>
            )}
            {o.status === 'storno' && (
              <button className="btn-ikona bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200" onClick={() => onSetStatus(o, 'nova')} title="Obnovit objednávku" aria-label="Obnovit objednávku"><RotateCcw size={14} /></button>
            )}
            <button className="btn-ikona bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300" onClick={() => onDelete(o.id)} title="Smazat objednávku" aria-label="Smazat objednávku"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

