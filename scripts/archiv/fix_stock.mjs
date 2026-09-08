import { readFileSync, writeFileSync } from 'fs';

const file = 'd:/stazene/zajic/project/src/screens/Stock.tsx';
let content = readFileSync(file, 'utf8');

// Find the truncation point: the div line in the detail modal that precedes the broken emoji line
const marker = `                        <div className={\`px-3 py-2 text-xs font-black uppercase tracking-wider \${kind === 'keg' ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-800'}\`}>`;
const idx = content.lastIndexOf(marker);
if (idx === -1) {
  console.error('Marker not found');
  process.exit(1);
}

// Truncate at the marker (keep the marker line)
content = content.slice(0, idx + marker.length);

const rest = `
                          {kind === 'keg' ? '🛢 Sudy' : '🍾 Lahve'}
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase text-neutral-400 bg-neutral-50">
                              <th className="text-left px-3 py-1.5">Obal</th>
                              <th className="text-center px-2 py-1.5">Stav</th>
                              <th className="text-center px-2 py-1.5">Odpis</th>
                              <th className="text-center px-3 py-1.5">Rozdíl</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((p) => (
                              <tr key={p.package_id} className="border-t border-neutral-100">
                                <td className="px-3 py-1.5 font-bold text-neutral-600">{p.label}</td>
                                <td className="px-2 py-1.5 text-center font-mono font-black text-neutral-900">{p.currentStock}</td>
                                <td className={\`px-2 py-1.5 text-center font-mono font-black \${p.outgoing > 0 ? 'text-rose-600' : 'text-neutral-400'}\`}>{p.outgoing > 0 ? \`-\${p.outgoing}\` : '0'}</td>
                                <td className={\`px-3 py-1.5 text-center font-mono font-black \${p.difference < 0 ? 'text-rose-600' : p.difference === 0 ? 'text-amber-600' : 'text-emerald-600'}\`}>{p.difference}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-neutral-400">
                  Stav = počáteční stav (inventura) + stočeno do dnešního dne. Odpis = fasování + odpisy + objednávky + prodejna + akce + sudy ze stáčení lahví. Rozdíl = stav − odpis.
                </p>
              </div>
            )}
          </Modal>

          {/* Excise Tax Report */}
          <div className="card p-4 shadow-sm border-neutral-200/80 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <BarChart2 size={18} className="text-amber-600" />
                Spotřební daň – přehled
              </h2>
              <button
                onClick={() => exportExciseTaxReportToExcel(rows)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-sm transition"
              >
                <Download size={14} />
                Export Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase text-neutral-400 border-b border-neutral-200">
                    <th className="text-left py-2 pr-2">Pivo</th>
                    <th className="text-right py-2 px-2">Sudů</th>
                    <th className="text-right py-2 px-2">Lahví</th>
                    <th className="text-right py-2 px-2">Celkem ks</th>
                    <th className="text-right py-2 pl-2">hl</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.beer.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-2 font-bold text-neutral-800">{r.beer.name}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.stockKegs}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.stockBottles}</td>
                      <td className="py-2 px-2 text-right font-mono font-black">{r.stockTotal}</td>
                      <td className="py-2 pl-2 text-right font-mono font-black">{fmtHl(r.stockLiters)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Brewed Section */}
          <div className="card p-4 shadow-sm border-neutral-200/80 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <PackageCheck size={18} className="text-amber-600" />
                Stočeno za období
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={brewFrom} onChange={(e) => setBrewFrom(e.target.value)} className="input !py-1 !px-2 text-xs font-black text-amber-800 border-amber-300 w-auto" />
                <span className="text-neutral-400 font-black">–</span>
                <input type="date" value={brewTo} onChange={(e) => setBrewTo(e.target.value)} className="input !py-1 !px-2 text-xs font-black text-amber-800 border-amber-300 w-auto" />
                <div className="flex gap-1">
                  {(['week', 'month', 'year', 'all'] as const).map((t) => (
                    <button key={t} onClick={() => setQuickRange(t)} className="px-2 py-1 rounded-lg bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-950 text-[11px] font-black border border-neutral-300 hover:border-amber-400 transition">
                      {t === 'week' ? 'Týden' : t === 'month' ? 'Měsíc' : t === 'year' ? 'Rok' : 'Vše'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-black uppercase text-amber-800">Sudů</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalKegs} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded-2xl bg-primary-50 border border-primary-200">
                <div className="text-[10px] font-black uppercase text-primary-800">Lahví</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalBottles} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-black uppercase text-emerald-800">Celkem</div>
                <div className="text-xl font-display font-black text-neutral-900">{fmtHl(brewTotalLiters)} <span className="text-xs text-neutral-500 font-normal">hl</span></div>
              </div>
            </div>

            {brewLoading ? <Spinner /> : brewStats.length === 0 ? <EmptyState text="Žádné stočení v tomto období." icon="🍺" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brewStats.map((s) => (
                  <div key={s.beer.id} className="rounded-2xl border border-neutral-200 bg-white p-4" style={{ borderColor: beerBorder(s.beer) }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={\`font-display font-black text-base \${beerText(s.beer)}\`}>{s.beer.name}</h3>
                      <span className="px-2.5 py-1 rounded-lg bg-neutral-900 text-amber-300 font-mono font-black text-xs">{fmtHl(s.totalLiters)} hl</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
                        <div className="text-[9px] font-black uppercase text-amber-800">Sudy</div>
                        <div className="text-sm font-mono font-black text-neutral-900">{s.totalKegs}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-primary-50 border border-primary-200 text-center">
                        <div className="text-[9px] font-black uppercase text-primary-800">Lahve</div>
                        <div className="text-sm font-mono font-black text-neutral-900">{s.totalBottles}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {s.byPkg.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-neutral-600">{p.label}</span>
                          <span className="font-mono font-black text-neutral-900">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
`;

writeFileSync(file, content + rest, 'utf8');
console.log('Fixed Stock.tsx');
