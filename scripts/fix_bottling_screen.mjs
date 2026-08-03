import { readFileSync, writeFileSync } from 'fs';

const file = 'src/screens/BottlingScreen.tsx';
let src = readFileSync(file, 'utf8');
// Normalizace řádkových konců (CRLF -> LF), aby SEARCH bloky seděly
src = src.replace(/\r\n/g, '\n');


// 1) State block: add recordsMonthKey, shiftMonth, recordsTab, update filteredRows
const oldState = `  const [recordsView, setRecordsView] = useState<'month' | 'week'>('month');
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const currentMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const filteredRows = useMemo(() => {
    if (recordsView === 'month') {
      return rows.filter((r) => r.entry_date?.startsWith(currentMonthKey));
    }
    return rows.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
  }, [rows, recordsView, currentMonthKey, recordsWeekKey]);`;

const newState = `  const [recordsView, setRecordsView] = useState<'month' | 'week'>('month');
  const [recordsMonthKey, setRecordsMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  // Posun měsíce o delta měsíců (vrací YYYY-MM)
  function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return \`\${d.getUTCFullYear()}-\${String(d.getUTCMonth() + 1).padStart(2, '0')}\`;
  }
  // Záložka záznamů: lahve / KEG / vše
  const [recordsTab, setRecordsTab] = useState<'lahve' | 'keg' | 'vse'>('lahve');
  const filteredRows = useMemo(() => {
    let result = rows;
    if (recordsView === 'month') {
      result = result.filter((r) => r.entry_date?.startsWith(recordsMonthKey));
    } else {
      result = result.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
    }
    if (recordsTab === 'lahve') {
      result = result.filter((r) => {
        const pkg = packages.find((p) => p.id === r.package_id);
        return !pkg || pkg.kind !== 'keg';
      });
    } else if (recordsTab === 'keg') {
      result = result.filter((r) => {
        const pkg = packages.find((p) => p.id === r.package_id);
        return pkg && pkg.kind === 'keg';
      });
    }
    return result;
  }, [rows, recordsView, recordsMonthKey, recordsWeekKey, recordsTab, packages]);`;

if (!src.includes(oldState)) {
  console.error('STATE BLOCK NOT FOUND');
  process.exit(1);
}
src = src.replace(oldState, newState);

// 2) h3 title: currentMonthKey -> recordsMonthKey
const oldH3 = `                🍾 {recordsView === 'month' ? \`Měsíc \${currentMonthKey}\` : \`Týden \${recordsWeekKey}\`}`;
const newH3 = `                🍾 {recordsView === 'month' ? \`Měsíc \${recordsMonthKey}\` : \`Týden \${recordsWeekKey}\`}`;
if (!src.includes(oldH3)) {
  console.error('H3 NOT FOUND');
  process.exit(1);
}
src = src.replace(oldH3, newH3);

// 3) Add month navigation buttons + tab selector in the records header
const oldHeader = `          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setRecordsView('month')}
                  className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                    recordsView === 'month'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }\`}
                >
                  📅 Měsíc
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }\`}
                  >
                    📅 Týden
                  </button>
                  {recordsView === 'week' && (
                    <>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                    </>
                  )}
                </div>
              </>
            )}
            {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
          </div>`;

const newHeader = `          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setRecordsTab('lahve')}
                  className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                    recordsTab === 'lahve'
                      ? 'bg-emerald-200 border-emerald-300 text-emerald-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }\`}
                >
                  🍾 Lahve
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsTab('keg')}
                  className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                    recordsTab === 'keg'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }\`}
                >
                  🛢️ KEG
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsTab('vse')}
                  className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                    recordsTab === 'vse'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }\`}
                >
                  📦 Vše
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsView('month')}
                  className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                    recordsView === 'month'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }\`}
                >
                  📅 Měsíc
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={\`text-xs font-bold px-2.5 py-1 rounded-lg border transition \${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }\`}
                  >
                    📅 Týden
                  </button>
                  {recordsView === 'week' ? (
                    <>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                      <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{recordsMonthKey}</span>
                      <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                    </>
                  )}
                </div>
              </>
            )}
            {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
          </div>`;

if (!src.includes(oldHeader)) {
  console.error('HEADER NOT FOUND');
  process.exit(1);
}
src = src.replace(oldHeader, newHeader);

// 4) Přidat sloupec "🛢️ Sudů" do tabulky záznamů (hlavička, řádky, souhrn)
// 4a) Hlavička: vložit sloupec Sudů mezi Ks a Litry
const oldTh = `                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>`;
const newTh = `                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">🛢️ Sudů</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>`;
if (!src.includes(oldTh)) {
  console.error('TH NOT FOUND');
  process.exit(1);
}
src = src.replace(oldTh, newTh);

// 4b) Data řádek: vložit buňku Sudů mezi Ks a Litry
const oldTd = `                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>`;
const newTd = `                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.kegs_used && r.kegs_used > 0 ? r.kegs_used : '—'}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>`;
if (!src.includes(oldTd)) {
  console.error('TD NOT FOUND');
  process.exit(1);
}
src = src.replace(oldTd, newTd);

// 4c) Souhrnný řádek: vložit buňku celkových sudů mezi Ks a Litry
const oldSum = `                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>`;
const newSum = `                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalKegs > 0 ? totalKegs : '—'}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>`;
if (!src.includes(oldSum)) {
  console.error('SUM NOT FOUND');
  process.exit(1);
}
src = src.replace(oldSum, newSum);

// 4d) Přidat výpočet totalKegs (deduplikace zdroje) do IIFE
const oldCalc = `          const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);
          const totalLiters = sortedRows.reduce((s, r) => {
            const pkg = packages.find((p) => p.id === r.package_id);
            return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
          }, 0);`;
const newCalc = `          const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);
          const totalLiters = sortedRows.reduce((s, r) => {
            const pkg = packages.find((p) => p.id === r.package_id);
            return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
          }, 0);
          // Celkový počet sudů — deduplikace zdroje (jeden sud může plnit více druhů obalů)
          const seenKegs = new Set<string>();
          const totalKegs = sortedRows.reduce((s, r) => {
            if (r.kegs_used && r.kegs_used > 0) {
              const key = \`\${r.entry_date}|\${r.beer_id}|\${r.kegs_used}|\${r.kegs_used_package_id}\`;
              if (!seenKegs.has(key)) { seenKegs.add(key); return s + Number(r.kegs_used); }
            }
            return s;
          }, 0);`;
if (!src.includes(oldCalc)) {
  console.error('CALC NOT FOUND');
  process.exit(1);
}
src = src.replace(oldCalc, newCalc);

writeFileSync(file, src);
console.log('OK - BottlingScreen.tsx updated');


