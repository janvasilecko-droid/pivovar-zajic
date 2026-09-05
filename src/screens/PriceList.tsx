import { useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, PriceListItem, useRealtime, beerBg, beerText, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { Beer as BeerIcon, Calendar, CheckCircle2, DollarSign, Info, Package as PackageIcon, Tag } from 'lucide-react';
import { IkonaLahev, IkonaSud } from '../components/ikony';

export default function PriceListScreen() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [rows, setRows] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [savingBeerId, setSavingBeerId] = useState<string | null>(null);
  const [savingCellId, setSavingCellId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, b, pk] = await Promise.all([
      supabase.from('price_list').select('*').order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((p.data as PriceListItem[]) ?? []);
    setBeers((b.data as Beer[]) ?? []);
    setPackages((pk.data as Package[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['price_list', 'beers', 'packages'], load);

  const kegPackages = useMemo(() => packages.filter((p) => p.kind === 'keg').sort((a, b) => b.volume_l - a.volume_l), [packages]);
  const bottlePackages = useMemo(() => packages.filter((p) => p.kind === 'bottle').sort((a, b) => b.volume_l - a.volume_l), [packages]);

  async function savePricePerLiter(beer: Beer, value: string) {
    const n = value === '' ? null : Number(value);
    if (value !== '' && (n == null || isNaN(n) || n < 0)) return;
    setSavingBeerId(beer.id);
    await supabase.from('beers').update({ price_per_liter: n }).eq('id', beer.id);
    setSavingBeerId(null);
    load();
  }

  function findBottleRow(beerId: string, packageId: string): PriceListItem | undefined {
    return rows.find((r) => r.beer_id === beerId && r.package_id === packageId);
  }

  async function saveBottlePrice(beer: Beer, pkg: Package, value: string) {
    const cellKey = `${beer.id}:${pkg.id}`;
    const existing = findBottleRow(beer.id, pkg.id);
    const n = value === '' ? null : Number(value);
    if (value !== '' && (n == null || isNaN(n) || n < 0)) return;

    setSavingCellId(cellKey);
    if (n == null) {
      if (existing) await supabase.from('price_list').delete().eq('id', existing.id);
    } else if (existing) {
      await supabase.from('price_list').update({ price_per_unit: n, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('price_list').insert({
        beer_id: beer.id,
        package_id: pkg.id,
        price_per_unit: n,
      });
    }
    setSavingCellId(null);
    load();
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Banner matching Inventory & Logbook style */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          {/* Popisný nadpis obrazovky odstraněn — na telefonu zabíral
              půl displeje a neříkal nic, co by uživatel nevěděl. Ovládací
              prvky banneru zůstávají. */}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded text-xs font-bold">
            <Calendar size={16} className="text-amber-400" />
            <span>Měsíc:</span>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent text-amber-300 font-mono font-black border-none focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Kegs Price Table */}
          <div className="card p-5 shadow-sm border border-neutral-200/90 bg-white rounded overflow-hidden space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                  <span><IkonaSud className="ikona-text" /></span>
                  <span>Sudy / KEGy — cena za litr a automatický dopočet kegů</span>
                </h3>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  Po zadání ceny za 1 litr se cena všech velikostí KEG sudů dopočítá automaticky.
                </p>
              </div>
            </div>

            {beers.length === 0 ? <EmptyState text="Žádná piva v katalogu." icon={BeerIcon} /> : (
              <>
              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {beers.map((b) => {
                  const bg = beerBg(b) || '#fef3c7';
                  const txt = beerText(b) || 'text-neutral-900';
                  return (
                    <div key={b.id} className="rounded border border-neutral-200 overflow-hidden" style={{ backgroundColor: bg }}>
                      <div className="p-3 space-y-2.5">
                        <span className={`text-sm font-black ${txt}`}>{b.name}{b.degree ? ` (${b.degree})` : ''}</span>
                        <label className="block">
                          <span className="text-udaj font-black uppercase text-neutral-600 bg-white/70 px-1.5 py-0.5 rounded-md inline-block mb-1">Cena za 1 litr</span>
                          <input
                            type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                            className="input w-full text-right font-mono font-black text-base bg-white border border-neutral-300 shadow-xs"
                            defaultValue={b.price_per_liter ?? ''}
                            placeholder="— Kč/l"
                            onBlur={(e) => { if (e.target.value !== String(b.price_per_liter ?? '')) savePricePerLiter(b, e.target.value); }}
                            disabled={savingBeerId === b.id}
                          />
                        </label>
                        {b.price_per_liter != null && (
                          <div className="flex flex-wrap gap-1.5">
                            {kegPackages.map((p) => (
                              <span key={p.id} className="px-2.5 py-1 rounded bg-neutral-900 text-amber-300 text-xs font-black shadow-xs">
                                {formatPackageLabel(p.label)}: {(Number(b.price_per_liter) * Number(p.volume_l)).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin rounded border border-neutral-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-900 text-amber-300 uppercase tracking-wider text-udaj font-black">
                      <th scope="col" className="py-3.5 px-4 text-left">Pivo</th>
                      <th scope="col" className="py-3.5 px-4 text-right">Cena za 1 litr (Kč)</th>
                      {kegPackages.map((p) => (
                        <th scope="col" key={p.id} className="py-3.5 px-4 text-right">
                          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-extrabold shadow-2xs" style={{ backgroundColor: pkgBg(p), color: pkgText(p) === 'text-white' ? '#fff' : '#111' }}>
                            {formatPackageLabel(p.label)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/60">
                    {beers.map((b) => {
                      const bg = beerBg(b) || '#fef3c7';
                      const txt = beerText(b) || 'text-neutral-900';

                      return (
                        <tr key={b.id} className="transition-colors hover:brightness-95" style={{ backgroundColor: bg }}>
                          <td className="py-3 px-4 font-black">
                            <span className={`text-sm font-black ${txt}`}>{b.name}{b.degree ? ` (${b.degree})` : ''}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                              className="input !w-28 text-right font-mono font-black text-sm ml-auto bg-white border border-neutral-300 shadow-xs"
                              defaultValue={b.price_per_liter ?? ''}
                              placeholder="— Kč/l"
                              onBlur={(e) => { if (e.target.value !== String(b.price_per_liter ?? '')) savePricePerLiter(b, e.target.value); }}
                              disabled={savingBeerId === b.id}
                            />
                          </td>
                          {kegPackages.map((p) => (
                            <td key={p.id} className="py-3 px-4 text-right font-mono font-black text-neutral-900 text-sm">
                              {b.price_per_liter != null ? (
                                <span className="px-2.5 py-1 rounded bg-neutral-900 text-amber-300 shadow-xs">
                                  {(Number(b.price_per_liter) * Number(p.volume_l)).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč
                                </span>
                              ) : (
                                <span className="text-neutral-400 font-normal">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Bottle Prices Table */}
          <div className="card p-5 shadow-sm border border-neutral-200/90 bg-white rounded overflow-hidden space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                  <span><IkonaLahev className="ikona-text" /></span>
                  <span>Lahve — ruční nastavení ceny za kus podle piva a objemu</span>
                </h3>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  Zadejte konečnou cenu za 1 ks lahve pro každý druh piva a velikost lahve.
                </p>
              </div>
            </div>

            {bottlePackages.length === 0 ? (
              <EmptyState text="V katalogu obalů nejsou žádné lahve." icon={IkonaLahev} />
            ) : beers.length === 0 ? (
              <EmptyState text="Žádná piva v katalogu." icon={BeerIcon} />
            ) : (
              <>
              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {beers.map((b) => {
                  const bg = beerBg(b) || '#fef3c7';
                  const txt = beerText(b) || 'text-neutral-900';
                  return (
                    <div key={b.id} className="rounded border border-neutral-200 overflow-hidden" style={{ backgroundColor: bg }}>
                      <div className="p-3 space-y-2.5">
                        <span className={`text-sm font-black ${txt}`}>{b.name}{b.degree ? ` (${b.degree})` : ''}</span>
                        <div className="grid grid-cols-2 gap-2">
                          {bottlePackages.map((p) => {
                            const existing = findBottleRow(b.id, p.id);
                            const cellKey = `${b.id}:${p.id}`;
                            return (
                              <label key={p.id} className="block">
                                <span className="text-udaj font-black uppercase text-neutral-600 bg-white/70 px-1.5 py-0.5 rounded-md inline-block mb-1">{formatPackageLabel(p.label)}</span>
                                <input
                                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                                  className="input w-full text-right font-mono font-black text-sm bg-white border border-neutral-300 shadow-xs"
                                  defaultValue={existing?.price_per_unit ?? ''}
                                  placeholder="— Kč/ks"
                                  onBlur={(e) => {
                                    const cur = existing?.price_per_unit;
                                    if (e.target.value !== String(cur ?? '')) saveBottlePrice(b, p, e.target.value);
                                  }}
                                  disabled={savingCellId === cellKey}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin rounded border border-neutral-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-900 text-amber-300 uppercase tracking-wider text-udaj font-black">
                      <th scope="col" className="py-3.5 px-4 text-left">Pivo</th>
                      {bottlePackages.map((p) => (
                        <th scope="col" key={p.id} className="py-3.5 px-4 text-right">
                          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-extrabold shadow-2xs" style={{ backgroundColor: pkgBg(p), color: pkgText(p) === 'text-white' ? '#fff' : '#111' }}>
                            {formatPackageLabel(p.label)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/60">
                    {beers.map((b) => {
                      const bg = beerBg(b) || '#fef3c7';
                      const txt = beerText(b) || 'text-neutral-900';

                      return (
                        <tr key={b.id} className="transition-colors hover:brightness-95" style={{ backgroundColor: bg }}>
                          <td className="py-3 px-4 font-black">
                            <span className={`text-sm font-black ${txt}`}>{b.name}{b.degree ? ` (${b.degree})` : ''}</span>
                          </td>
                          {bottlePackages.map((p) => {
                            const existing = findBottleRow(b.id, p.id);
                            const cellKey = `${b.id}:${p.id}`;

                            return (
                              <td key={p.id} className="py-3 px-4 text-right">
                                <input
                                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                                  className="input !w-28 text-right font-mono font-black text-sm ml-auto bg-white border border-neutral-300 shadow-xs"
                                  defaultValue={existing?.price_per_unit ?? ''}
                                  placeholder="— Kč/ks"
                                  onBlur={(e) => {
                                    const cur = existing?.price_per_unit;
                                    if (e.target.value !== String(cur ?? '')) saveBottlePrice(b, p, e.target.value);
                                  }}
                                  disabled={savingCellId === cellKey}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
