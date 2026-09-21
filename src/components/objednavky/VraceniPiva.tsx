// 🔄 Záložka „Vrácení piva" — pivo, které se od odběratele vrátilo zpátky.
// ---------------------------------------------------------------------------
// Vrácení šlo zadat jen z detailu jedné zavezené objednávky. Jenže se vrací
// jinak, než se objednává: „Lužec veze zpátky dva padesátky" přijde do
// pivovaru samo, bez toho, aby někdo věděl, ze které objednávky to je — a
// hledat ji v seznamu znamená pamatovat si den závozu.
//
// Proto je vrácení samostatná záložka: vyber odběratele (nebo rovnou
// objednávku, ať se položky vyplní samy), napiš kolik čeho se vrátilo,
// ulož. Kusy se přičtou na sklad DNEŠNÍM dnem — ne dnem původního závozu,
// který může ležet v už uzavřeném týdnu (viz lib/vraceniZObjednavky.ts).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Beer, Package, Place, beerBg, beerInk, supabase } from '../../lib/supabase';
import { EmptyState, Field, Spinner } from '../ui';
import { businessDateISO } from '../../lib/businessDate';
import { chyba, oznam, potvrd, uspech } from '../../lib/toast';
import { prvniChyba, usePosledniNacteni } from '../../lib/nacitani';
import {
  datumCesky, datumZavozu, objednavkyKVraceni, platneVraceni, poznamkaVraceni,
  pripojPoznamku, zaznamyDorovnaniVraceni, type PolozkaVraceni,
} from '../../lib/vraceniZObjednavky';
import type { Order, OrderItem } from './spolecne';

/** Řádek „jiné pivo" — vrácení, které na vybrané objednávce není. */
type RucniRadek = { klic: string; beer_id: string; package_id: string; pocet: string };

/** Dorovnání, které vzniklo vrácením — pro výpis „Poslední vrácení". */
type ZaznamVraceni = {
  id: string;
  entry_date: string;
  beer_name: string | null;
  package_label: string | null;
  quantity: number;
  reason: string | null;
};

const novyRadek = (): RucniRadek => ({ klic: Math.random().toString(36).slice(2), beer_id: '', package_id: '', pocet: '' });

export function VraceniPiva({ orders, items, beers, packages, places, onZpet, onChanged }: {
  orders: Order[];
  items: Record<string, OrderItem[]>;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  onZpet: () => void;
  onChanged: () => void;
}) {
  const dnes = businessDateISO();
  const [hledat, setHledat] = useState('');
  const [vybranaObjednavka, setVybranaObjednavka] = useState<string | null>(null);
  /** Odběratel bez objednávky — když se vrací něco, k čemu se objednávka nedohledá. */
  const [odberatelBezObjednavky, setOdberatelBezObjednavky] = useState('');
  const [pocty, setPocty] = useState<Record<string, string>>({});
  const [rucni, setRucni] = useState<RucniRadek[]>([]);
  const [ukladam, setUkladam] = useState(false);

  const [posledni, setPosledni] = useState<ZaznamVraceni[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const zacniNacteni = usePosledniNacteni();

  // Poslední vrácení — ať je hned vidět, že se zápis povedl, a dá se smazat,
  // když se někdo uklepne. Poznají se podle důvodu, který jim píše
  // zaznamyDorovnaniVraceni; dorovnání z týdenní inventury sem nepatří.
  async function nactiPosledni() {
    const smiZapsat = zacniNacteni();
    const odkdy = new Date(`${dnes}T00:00:00Z`);
    odkdy.setUTCDate(odkdy.getUTCDate() - 30);
    const r = await supabase
      .from('inventory_adjustments')
      .select('id,entry_date,beer_name,package_label,quantity,reason')
      .gte('entry_date', odkdy.toISOString().slice(0, 10))
      .like('reason', 'Vráceno z objednávky%')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      // Výslovný strop: je to výpis „co se poslední měsíc vrátilo", ne
      // podklad pro výpočet. Dvě stě řádků za měsíc se nikdy nestalo a bez
      // stropu by dotaz na rostoucí tabulce tiše usekl tisícovku.
      .limit(200);
    if (!smiZapsat()) return;
    setChybaNacteni(prvniChyba(r));
    setPosledni((r.data as ZaznamVraceni[]) ?? []);
    setNacitam(false);
  }

  // Jen při otevření záložky — dál se seznam obnovuje po každém uložení i smazání.
  useEffect(() => { void nactiPosledni(); }, []);

  const nabidka = useMemo(
    () => objednavkyKVraceni(orders, items, { dnes, hledat }).slice(0, 40),
    [orders, items, dnes, hledat],
  );
  const objednavka = vybranaObjednavka ? orders.find((o) => o.id === vybranaObjednavka) ?? null : null;
  const polozkyObjednavky = objednavka ? items[objednavka.id] ?? [] : [];
  const jmenoOdberatele = objednavka ? (objednavka.place_name ?? '') : odberatelBezObjednavky.trim();

  /** Co se chystá uložit — z položek objednávky i z ručních řádků dohromady. */
  const kUlozeni = useMemo<PolozkaVraceni[]>(() => {
    const zObjednavky = polozkyObjednavky.map((it) => ({
      beer_id: it.beer_id ?? '',
      beer_name: it.beer_name,
      package_id: it.package_id ?? '',
      package_label: it.package_label,
      pocet: Number(pocty[it.id] || 0),
    }));
    const zRucnich = rucni.map((r) => ({
      beer_id: r.beer_id,
      beer_name: beers.find((b) => b.id === r.beer_id)?.name ?? null,
      package_id: r.package_id,
      package_label: packages.find((p) => p.id === r.package_id)?.label ?? null,
      pocet: Number(r.pocet || 0),
    }));
    return platneVraceni([...zObjednavky, ...zRucnich]);
  }, [polozkyObjednavky, pocty, rucni, beers, packages]);

  const celkemKusu = kUlozeni.reduce((a, p) => a + p.pocet, 0);

  function vyprazdni() {
    setVybranaObjednavka(null);
    setOdberatelBezObjednavky('');
    setPocty({});
    setRucni([]);
  }

  async function uloz() {
    if (kUlozeni.length === 0) { oznam('Napiš, kolik čeho se vrátilo.'); return; }
    if (!objednavka && !jmenoOdberatele) {
      oznam('Vyber objednávku, nebo napiš, od koho se pivo vrátilo.');
      return;
    }
    setUkladam(true);
    try {
      const { error } = await supabase
        .from('inventory_adjustments')
        .insert(zaznamyDorovnaniVraceni(kUlozeni, dnes, jmenoOdberatele, objednavka?.id ?? null));
      if (error) throw new Error(error.message);

      // Poznámka na objednávku jen když je vybraná. Množství na ní se NEMĚNÍ —
      // zůstává svědectvím o tom, co se doopravdy odvezlo.
      if (objednavka) {
        const novaPoznamka = pripojPoznamku(objednavka.note, poznamkaVraceni(kUlozeni, dnes));
        const { error: e2 } = await supabase.from('orders').update({ note: novaPoznamka }).eq('id', objednavka.id);
        if (e2) throw new Error(e2.message);
      }
      uspech(`Vráceno ${celkemKusu} ks — přičteno na sklad.`);
      vyprazdni();
      void nactiPosledni();
      onChanged();
    } catch (e: any) {
      chyba('Vrácení se nepovedlo: ' + (e?.message || e));
    } finally {
      setUkladam(false);
    }
  }

  async function smaz(z: ZaznamVraceni) {
    const ok = await potvrd(
      `Smazat vrácení ${z.quantity}× ${z.package_label ?? ''} ${z.beer_name ?? ''} z ${datumCesky(z.entry_date)}?`
      + ' Kusy se odeberou zpátky ze skladu. Poznámka u objednávky zůstane.',
      { titulek: 'Smazat vrácení', potvrdit: 'Smazat' },
    );
    if (!ok) return;
    const { error } = await supabase.from('inventory_adjustments').delete().eq('id', z.id);
    if (error) { chyba('Smazání se nepovedlo: ' + error.message); return; }
    uspech('Vrácení smazáno.');
    void nactiPosledni();
    onChanged();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost !rounded text-xs font-black" onClick={onZpet}>
          <ArrowLeft className="ikona-text" /> Zpět na objednávky
        </button>
        <span className="text-udaj text-neutral-500">Dnešek: {datumCesky(dnes)}</span>
      </div>

      <div className="card p-3.5 bg-white border border-neutral-200 rounded">
        <div className="font-display font-black text-neutral-950 text-sm flex items-center gap-1.5">
          <RotateCcw size={16} /> Vrácení piva
        </div>
        <p className="text-udaj text-neutral-600 mt-1">
          Pivo, které se od odběratele vrátilo zpátky do pivovaru. <b>Přičte se na sklad dneškem</b> —
          ne dnem původního závozu, ať se nemění už uzavřený týden. Na objednávce zůstane poznámka;
          zavezené množství se nepřepisuje.
        </p>
      </div>

      {/* 1. Od koho ------------------------------------------------------ */}
      <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-3">
        <div className="font-black text-xs text-neutral-800">1. Od koho se pivo vrátilo</div>

        {objednavka ? (
          <div className="flex items-center justify-between gap-2 rounded border border-emerald-300 bg-emerald-50 p-2.5">
            <div className="min-w-0">
              <div className="font-black text-sm text-emerald-950 truncate">{objednavka.place_name ?? 'Bez odběratele'}</div>
              <div className="text-udaj text-emerald-800">
                závoz {datumCesky(datumZavozu(objednavka))} · {polozkyObjednavky.length} položek
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost !rounded text-xs shrink-0"
              onClick={() => { setVybranaObjednavka(null); setPocty({}); }}
            >
              <X className="ikona-text" /> Změnit
            </button>
          </div>
        ) : (
          <>
            <Field label="Hledat odběratele">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text" className="input !pl-8" placeholder="např. Lužec"
                  value={hledat} onChange={(e) => setHledat(e.target.value)}
                />
              </div>
            </Field>

            {nabidka.length === 0 ? (
              <p className="text-udaj text-neutral-500">
                Žádná zavezená objednávka za posledních osm týdnů. Napiš odběratele níž a vrať pivo bez objednávky.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                {nabidka.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => { setVybranaObjednavka(o.id); setPocty({}); }}
                      className="btn-ghost !rounded !block w-full min-h-[44px] !text-left !p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-sm text-neutral-900 truncate">{o.place_name ?? 'Bez odběratele'}</span>
                        <span className="text-udaj text-neutral-500 shrink-0">{datumCesky(datumZavozu(o))}</span>
                      </div>
                      <div className="text-udaj text-neutral-600 truncate">
                        {(items[o.id] ?? []).map((i) => `${i.quantity}× ${i.package_label ?? ''} ${i.beer_name ?? ''}`).join(', ')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Field label="…nebo bez objednávky" hint="Když se objednávka nedohledá — jméno se propíše do skladu k dorovnání.">
              <input
                type="text" className="input" placeholder="od koho se pivo vrátilo" list="vraceni-odberatele"
                value={odberatelBezObjednavky} onChange={(e) => setOdberatelBezObjednavky(e.target.value)}
              />
            </Field>
            <datalist id="vraceni-odberatele">
              {places.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </>
        )}
      </div>

      {/* 2. Co se vrátilo ------------------------------------------------ */}
      <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-3">
        <div className="font-black text-xs text-neutral-800">2. Co se vrátilo</div>

        {objednavka && (
          <ul className="space-y-1.5">
            {polozkyObjednavky.map((it) => {
              const pivo = beers.find((b) => b.id === it.beer_id);
              return (
                <li key={it.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex items-center gap-1.5 text-sm">
                    <span
                      className="px-1.5 py-0.5 rounded font-black text-xs shrink-0"
                      style={{ backgroundColor: beerBg(pivo), color: beerInk(pivo) }}
                    >
                      {it.package_label}
                    </span>
                    <span className="truncate text-neutral-800">{it.beer_name}</span>
                    <span className="text-neutral-400 shrink-0 text-udaj">zavezeno {it.quantity}</span>
                  </span>
                  <input
                    type="number" min={0} max={it.quantity} inputMode="numeric" placeholder="0"
                    onWheel={(e) => e.currentTarget.blur()}
                    className="input !w-20 !py-1 text-center shrink-0"
                    aria-label={`Vráceno ${it.beer_name} ${it.package_label}`}
                    value={pocty[it.id] ?? ''}
                    onChange={(e) => setPocty((m) => ({ ...m, [it.id]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {/* Ruční řádky — vrací se i to, co na vybrané objednávce není
            (starší sud, jiný obal), a bez objednávky je to jediná cesta. */}
        {rucni.map((r) => (
          <div key={r.klic} className="flex items-center gap-1.5">
            <select
              className="input !py-1 min-w-0 flex-1" aria-label="Pivo"
              value={r.beer_id}
              onChange={(e) => setRucni((l) => l.map((x) => x.klic === r.klic ? { ...x, beer_id: e.target.value } : x))}
            >
              <option value="">— pivo —</option>
              {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              className="input !py-1 min-w-0 flex-1" aria-label="Obal"
              value={r.package_id}
              onChange={(e) => setRucni((l) => l.map((x) => x.klic === r.klic ? { ...x, package_id: e.target.value } : x))}
            >
              <option value="">— obal —</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input
              type="number" min={0} inputMode="numeric" placeholder="0"
              onWheel={(e) => e.currentTarget.blur()}
              className="input !w-16 !py-1 text-center shrink-0" aria-label="Počet"
              value={r.pocet}
              onChange={(e) => setRucni((l) => l.map((x) => x.klic === r.klic ? { ...x, pocet: e.target.value } : x))}
            />
            <button
              type="button" className="btn-ghost !rounded !px-2 shrink-0" aria-label="Odebrat řádek"
              onClick={() => setRucni((l) => l.filter((x) => x.klic !== r.klic))}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button type="button" className="btn-ghost !rounded text-xs font-black" onClick={() => setRucni((l) => [...l, novyRadek()])}>
          <Plus className="ikona-text" /> Přidat jiné pivo
        </button>
      </div>

      {/* 3. Uložit -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-black text-neutral-700">
          {celkemKusu > 0 ? `Vrací se ${celkemKusu} ks` : 'Zatím nic nezadáno'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost !rounded text-xs font-black" onClick={vyprazdni} disabled={ukladam}>
            Vyprázdnit
          </button>
          <button type="button" className="btn-primary !rounded text-xs font-black" onClick={() => { void uloz(); }} disabled={ukladam || celkemKusu === 0}>
            <Check className="ikona-text" /> {ukladam ? 'Ukládám…' : 'Uložit vrácení'}
          </button>
        </div>
      </div>

      {/* Poslední vrácení -------------------------------------------------- */}
      <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-2">
        <div className="font-black text-xs text-neutral-800">Poslední vrácení (30 dní)</div>
        {nacitam ? <Spinner /> : chybaNacteni ? (
          <EmptyState
            varianta="chyba"
            text={`Vrácení se nepodařilo načíst: ${chybaNacteni}`}
            akce={{ popis: 'Zkusit znovu', onClick: () => { void nactiPosledni(); } }}
          />
        ) : posledni.length === 0 ? (
          <p className="text-udaj text-neutral-500">Za posledních třicet dní se nic nevrátilo.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {posledni.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <span className="font-mono font-black text-neutral-900">{z.quantity}×</span>{' '}
                  <span className="text-sm text-neutral-800">{z.package_label} {z.beer_name}</span>
                  <span className="block text-udaj text-neutral-500 truncate">{datumCesky(z.entry_date)} · {z.reason}</span>
                </span>
                <button
                  type="button" className="btn-ghost !rounded !px-2 shrink-0 text-rose-700"
                  aria-label={`Smazat vrácení ${z.quantity}× ${z.package_label ?? ''}`}
                  onClick={() => { void smaz(z); }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
