import { useEffect, useState } from 'react';
import { supabase, Beer, useRealtime } from '../lib/supabase';
import { Spinner, EmptyState, Field } from '../components/ui';
import { BookOpen, Calculator, Cylinder, FileText, Flame, FlaskConical, Check, CheckSquare, NotebookPen, Plus, Scale, Sliders, SprayCan, Truck, User, Wheat, Zap } from 'lucide-react';
import { IkonaSud } from '../components/ikony';

type SrotovaniRow = {
  id?: string;
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  weight_kg: number;
  note: string | null;
};

type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  assigned_to?: string;
};

// ==========================================
// 1. ŠROTOVÁNÍ SLADU
// ==========================================
export function SrotovaniScreen({ setPage }: { setPage?: (p: any, sec?: string) => void } = {}) {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [rows, setRows] = useState<SrotovaniRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Formular
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [beerId, setBeerId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('srotovani').select('*').order('entry_date', { ascending: false }),
    ]);
    setBeers((b as Beer[]) ?? []);
    setRows((s as SrotovaniRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['srotovani', 'beers'], load);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!beerId || !weightKg) return;
    setBusy(true);
    const beer = beers.find((b) => b.id === beerId);
    await supabase.from('srotovani').insert({
      entry_date: entryDate,
      beer_id: beerId,
      beer_name: beer?.name ?? null,
      weight_kg: Number(weightKg),
      note: note.trim() || null,
    });
    setWeightKg(''); setNote(''); setBusy(false);
    load();
  }

  return (
    <div className="space-y-6 pb-12">

      {/* HACCP & WhatsApp Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-2xl"><Wheat className="ikona-text" /></span>
          <div>
            <div className="font-extrabold text-amber-950 text-xs uppercase tracking-wider">Normy HACCP pro Šrotování & Slad</div>
            <div className="text-xs text-neutral-700 font-medium">Smyslová kontrola sladu (Bod 3.1), Vystírání & Rmutování (Bod 3.2), Čištění šrotovníku</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {setPage && (
            <button onClick={() => setPage('haccp', 'sec-3-1')} className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition">
              <BookOpen className="ikona-text" /> Šrotování sladu (3.1)
            </button>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="card p-5 shadow-sm border border-neutral-200/90 bg-white rounded space-y-4">
        <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
          <Plus size={18} className="text-amber-600" />
          <span>Záznam o šrotování</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Datum">
            <input type="date" required className="input font-bold" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
          <Field label="Druh piva">
            <select required className="input font-bold" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
              <option value="">— Vyber pivo —</option>
              {beers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Našrotováno sladu (kg)">
            <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min="0" required className="input font-mono font-black text-base" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="0.0 kg" />
          </Field>
        </div>

        <Field label="Poznámka / Šarže">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="např. Šarže #2026-04, Plzeňský slad 120 kg + Karamel 15 kg" />
        </Field>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={busy || !beerId || !weightKg} className="btn-primary !rounded !py-2.5 font-black text-sm shadow-md">
            {busy ? 'Ukládám…' : '+ Uložit šrotování'}
          </button>
        </div>
      </form>

      {/* List */}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Zatím žádné záznamy o šrotování." icon={Wheat} /> : (
        <div className="card p-5 bg-white border border-neutral-200 shadow-sm rounded space-y-3">
          <h3 className="font-display font-black text-lg text-neutral-900">Historie šrotování</h3>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.id || i} className="p-3.5 rounded bg-neutral-50 border border-neutral-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-black text-base text-neutral-950">{r.beer_name ?? '—'}</span>
                    <span className="text-xs font-mono font-bold text-neutral-500 bg-white border border-neutral-300 px-2 py-0.5 rounded">{new Date(r.entry_date).toLocaleDateString('cs-CZ')}</span>
                  </div>
                  {r.note && <p className="text-xs text-neutral-600 font-medium mt-1"><NotebookPen className="ikona-text" /> {r.note}</p>}
                </div>
                <div className="shrink-0">
                  <span className="px-3.5 py-1.5 rounded bg-amber-500 text-neutral-950 font-mono font-black text-sm shadow-2xs">
                    {r.weight_kg} kg sladu
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. CHECKLISTY & NÁVODY
// ==========================================
export function ChecklistsScreen() {
  const [tasks, setTasks] = useState<ChecklistItem[]>([
    { id: '1', title: 'Sanitace ležáckých tanků (CIP)', completed: false, assigned_to: 'Sládek' },
    { id: '2', title: 'Kontrola tlaku CO2 a teploty ve sklepě', completed: true, assigned_to: 'Sládek' },
    { id: '3', title: 'Ranní kontrola vozidel a stavu paliva', completed: false, assigned_to: 'Závozník' },
    { id: '4', title: 'Kontrola zásoby čistých KEG sudů (30 L / 50 L)', completed: false, assigned_to: 'Expedice' },
    { id: '5', title: 'Pravidelný odkalovací cyklus cylindrokónických tanků', completed: true, assigned_to: 'Sládek' },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  function toggleTask(id: string) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTasks([...tasks, { id: String(Date.now()), title: newTaskTitle.trim(), completed: false }]);
    setNewTaskTitle('');
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5 bg-white border border-neutral-200/90 rounded shadow-sm space-y-4">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <CheckSquare size={18} className="text-amber-600" />
            <span>Denní kontrolní seznam (Check-list)</span>
          </h3>

          <form onSubmit={addTask} className="flex gap-2">
            <input
              type="text"
              className="input flex-1 font-bold text-sm"
              placeholder="+ Přidat nový úkol do checklistu..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="submit" className="btn-primary !rounded !py-2.5 text-xs font-black shrink-0">Přidat</button>
          </form>

          <div className="space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className={`p-3.5 rounded border-2 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  t.completed ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 opacity-80' : 'bg-neutral-50 border-neutral-200 text-neutral-900 hover:border-amber-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded border-2 grid place-items-center font-black text-xs ${t.completed ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-white border-neutral-300'}`}>
                    {t.completed ? <Check className="ikona-text" /> : ''}
                  </span>
                  <span className={`font-extrabold text-sm ${t.completed ? 'line-through' : ''}`}>{t.title}</span>
                </div>
                {t.assigned_to && (
                  <span className="px-2.5 py-0.5 rounded bg-neutral-900 text-amber-300 font-mono font-bold text-xs shrink-0">
                    <User className="ikona-text" /> {t.assigned_to}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Manuals / Navody section */}
        <div className="card p-5 bg-white border border-neutral-200/90 rounded shadow-sm space-y-4">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <FileText size={18} className="text-amber-600" />
            <span>Provozní Návody</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
              <div className="font-black text-sm"><FlaskConical className="ikona-text" /> Postup sanitace stáčecí linky</div>
              <p className="text-xs text-amber-900/80 font-medium">1. Proplach studenou vodou 10 min. 2. Cirkulace 2% hydroxidu při 60°C. 3. Proplach minerální vodou.</p>
            </div>
            <div className="p-3 rounded bg-neutral-50 border border-neutral-200 text-neutral-900 space-y-1">
              <div className="font-black text-sm"><Truck className="ikona-text" /> Pokyny pro zavezování</div>
              <p className="text-xs text-neutral-600 font-medium">Vždy zkontrolovat neporušenost zátek u KEG sudů a správně vyplnit dodací list pro odběratele.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. CHYTRÉ KALKULAČKY PIVOVARU (KEGy, Chemie, Energie, Jednotky)
// ==========================================

export function ConcentrationScreen({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<'keg_calc' | 'srot_calc' | 'chem_calc' | 'energy_calc' | 'units_calc'>((initialSubTab as any) || 'keg_calc');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || 'keg_calc');
  }, [initialSubTab]);

  function selectTab(t: 'keg_calc' | 'srot_calc' | 'chem_calc' | 'energy_calc' | 'units_calc') {
    if (setPage) setPage('concentration', undefined, t);
    else setActiveTab(t);
  }

  // --- Helper Stepper Input Component ---
  function NumberStepper({
    value,
    onChange,
    step = 1,
    min = 0,
    placeholder,
    className = '',
  }: {
    value: string | number;
    onChange: (val: string) => void;
    step?: number;
    min?: number;
    placeholder?: string;
    className?: string;
  }) {
    const numVal = Number(value) || 0;
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(min, Number((numVal - step).toFixed(2)))))}
          className="w-8 h-8 shrink-0 grid place-items-center rounded bg-neutral-200 hover:bg-amber-200 text-neutral-900 font-black text-sm select-none active:scale-95 transition"
          title={`- ${step}`}
        >
          −
        </button>
        <span className={`w-20 min-w-[4rem] px-2 text-center font-mono font-black bg-white border border-neutral-200 rounded py-2 shadow-2xs ${className ?? ''}`}>
          {value || '0'}
        </span>
        <button
          type="button"
          onClick={() => onChange(String(Number((numVal + step).toFixed(2))))}
          className="w-8 h-8 shrink-0 grid place-items-center rounded bg-amber-950 hover:bg-amber-900 text-white font-black text-sm select-none active:scale-95 transition"
          title={`+ ${step}`}
        >
          +
        </button>
      </div>
    );
  }

  // --- 1. KEG Kalkulačka dotáčení z tanku ---
  const [tankVolumeHl, setTankVolumeHl] = useState<string>('15');
  const [trubkyLossPct, setTrubkyLossPct] = useState<string>('2.5');

  const tankLiters = Math.max(0, (Number(tankVolumeHl) || 0) * 100);
  const netLiters = tankLiters * (1 - (Number(trubkyLossPct) || 0) / 100);

  const pure50 = Math.floor(netLiters / 50);
  const rem50 = netLiters - pure50 * 50;

  const pure30 = Math.floor(netLiters / 30);
  const rem30 = netLiters - pure30 * 30;

  const pure20 = Math.floor(netLiters / 20);
  const rem20 = netLiters - pure20 * 20;

  const pure15 = Math.floor(netLiters / 15);
  const rem15 = netLiters - pure15 * 15;

  const mix1_50 = Math.floor(netLiters / 50);
  const remAfter50 = netLiters - mix1_50 * 50;
  const mix1_30 = Math.floor(remAfter50 / 30);
  const remM1 = remAfter50 - mix1_30 * 30;

  const halfVol = netLiters * 0.5;
  const mix2_50 = Math.floor(halfVol / 50);
  const remAfterMix2_50 = netLiters - mix2_50 * 50;
  const mix2_30 = Math.floor(remAfterMix2_50 / 30);
  const remM2 = remAfterMix2_50 - mix2_30 * 30;

  const target50_30pct = netLiters * 0.3;
  const mix3_50 = Math.floor(target50_30pct / 50);
  const remAfterMix3_50 = netLiters - mix3_50 * 50;
  const mix3_30 = Math.floor(remAfterMix3_50 / 30);
  const remM3 = remAfterMix3_50 - mix3_30 * 30;

  const [calcMode, setCalcMode] = useState<'fix30' | 'fix50'>('fix30');
  const [custom30Input, setCustom30Input] = useState<string>('10');
  const [custom50Input, setCustom50Input] = useState<string>('15');

  const custom30Count = Math.max(0, Number(custom30Input) || 0);
  const litersInCustom30 = custom30Count * 30;
  const remainingFor50 = Math.max(0, netLiters - litersInCustom30);
  const auto50Count = Math.floor(remainingFor50 / 50);
  const remFinalFix30 = remainingFor50 - auto50Count * 50;
  const totalHlFix30 = ((custom30Count * 30 + auto50Count * 50) / 100).toFixed(2);

  const custom50Count = Math.max(0, Number(custom50Input) || 0);
  const litersInCustom50 = custom50Count * 50;
  const remainingFor30 = Math.max(0, netLiters - litersInCustom50);
  const auto30Count = Math.floor(remainingFor30 / 30);
  const remFinalFix50 = remainingFor30 - auto30Count * 30;
  const totalHlFix50 = ((custom50Count * 50 + auto30Count * 30) / 100).toFixed(2);

  // --- 2. ŠROTOVÁNÍ (plán šrotování: pivo → kg sladu → pytle 25 kg) ---
  const [beers, setBeers] = useState<Beer[]>([]);
  const [srotRows, setSrotRows] = useState<{ beerId: string; kg: string }[]>(
    Array.from({ length: 4 }, () => ({ beerId: '', kg: '' }))
  );

  useEffect(() => {
    supabase
      .from('beers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setBeers((data as Beer[]) ?? []));
  }, []);

  const srotTotalKg = srotRows.reduce((sum, r) => sum + (Number(r.kg) || 0), 0);
  const srotTotalBags = Math.ceil(srotTotalKg / 25);
  const setSrotRow = (i: number, patch: Partial<{ beerId: string; kg: string }>) =>
    setSrotRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // --- 3. Sanitační chemie ---
  const [chemType, setChemType] = useState<'louh' | 'persteril' | 'dusicna' | 'chlornan'>('louh');
  const [targetVolumeL, setTargetVolumeL] = useState('100');
  const [stockPct, setStockPct] = useState('100');
  const [targetPct, setTargetPct] = useState('2.0');

  function selectPreset(type: 'louh' | 'persteril' | 'dusicna' | 'chlornan') {
    setChemType(type);
    if (type === 'louh') { setStockPct('100'); setTargetPct('2.0'); }
    else if (type === 'persteril') { setStockPct('15'); setTargetPct('0.5'); }
    else if (type === 'dusicna') { setStockPct('53'); setTargetPct('1.5'); }
    else if (type === 'chlornan') { setStockPct('15'); setTargetPct('0.5'); }
  }

  const vTotal = Number(targetVolumeL) || 0;
  const cStock = Number(stockPct) || 0;
  const cTarget = Number(targetPct) || 0;
  const vChem = cStock > 0 ? (cTarget * vTotal) / cStock : 0;
  const vWater = Math.max(0, vTotal - vChem);

  // --- 4. Energetická náročnost ---
  const [energyBatchHl, setEnergyBatchHl] = useState<string>('10');
  const [elecKwh, setElecKwh] = useState<string>('200');
  const [elecKwc, setElecKwc] = useState<string>('5.50');
  const [gasM3, setGasM3] = useState<string>('18');
  const [gasKwc, setGasKwc] = useState<string>('18.50');
  const [waterM3, setWaterM3] = useState<string>('5.0');
  const [waterKwc, setWaterKwc] = useState<string>('110.00');
  const [co2Kg, setCo2Kg] = useState<string>('10');
  const [co2Kwc, setCo2Kwc] = useState<string>('25.00');

  const bHl = Math.max(0.1, Number(energyBatchHl) || 10);
  const costElec = (Number(elecKwh) || 0) * (Number(elecKwc) || 0);
  const costGas = (Number(gasM3) || 0) * (Number(gasKwc) || 0);
  const costWater = (Number(waterM3) || 0) * (Number(waterKwc) || 0);
  const costCo2 = (Number(co2Kg) || 0) * (Number(co2Kwc) || 0);

  const totalEnergyCostBatch = costElec + costGas + costWater + costCo2;
  const costPerHl = totalEnergyCostBatch / bHl;
  const costPerPint = costPerHl / 200;

  // --- 5. Přepočet jednotek ---
  const [volInputHl, setVolInputHl] = useState<string>('10');
  const [platoInput, setPlatoInput] = useState<string>('12');
  const [ogInput, setOgInput] = useState<string>('12');
  const [fgInput, setFgInput] = useState<string>('2.5');
  const [kgInput, setKgInput] = useState<string>('100');
  const [tempCInput, setTempCInput] = useState<string>('65');

  const vHl = Math.max(0, Number(volInputHl) || 0);
  const vLiters = vHl * 100;
  const vPints = vLiters * 2;
  const vKegs50 = vLiters / 50;
  const vKegs30 = vLiters / 30;
  const vUsBbl = vLiters / 117.3477;
  const vUsGal = vLiters / 3.78541;
  const vUkBbl = vLiters / 163.659;
  const vUkPints = vLiters / 0.568261;

  const degPlato = Math.max(0, Number(platoInput) || 0);
  const sgExact = degPlato > 0 ? 1 + (degPlato / (258.6 - (degPlato / 258.2) * 227.1)) : 1.000;
  const degBrix = degPlato / 0.96;

  const ogVal = Number(ogInput) || 0;
  const fgVal = Number(fgInput) || 0;
  const estAbv = Math.max(0, (ogVal - fgVal) * 0.52);
  const estAbw = estAbv * 0.8;

  const weightKgVal = Math.max(0, Number(kgInput) || 0);
  const weightLbs = weightKgVal * 2.20462;
  const weightGrams = weightKgVal * 1000;
  const weightOz = weightGrams / 28.3495;

  const tC = Number(tempCInput) || 0;
  const tF = tC * 1.8 + 32;

  return (
    <div className="space-y-6 pb-12">
      {/* Uvítací banner (nadpis „Kalkulačky pro sládka & technologa" a popis
          toho, co obrazovka umí) je pryč. Na telefonu zabíral půl displeje a
          neříkal nic, co by uživatel nevěděl — přišel sem schválně a názvy
          jednotlivých kalkulaček jsou hned pod tím. */}

      {/* Tabs — přilepené nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 overflow-x-auto scrollbar-thin pb-2 border-b border-neutral-200">
        <button
          onClick={() => selectTab('keg_calc')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'keg_calc'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Cylinder size={16} />
          <span>Dotáčení KEG sudů</span>
        </button>

        <button
          onClick={() => selectTab('srot_calc')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'srot_calc'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Wheat size={16} />
          <span>Šrotování sladu</span>
        </button>

        <button
          onClick={() => selectTab('chem_calc')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'chem_calc'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <FlaskConical size={16} />
          <span>Sanitační chemie</span>
        </button>

        <button
          onClick={() => selectTab('energy_calc')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'energy_calc'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Flame size={16} />
          <span>Náročnost várky</span>
        </button>

        <button
          onClick={() => selectTab('units_calc')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'units_calc'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Calculator size={16} />
          <span>Přepočet jednotek</span>
        </button>
      </div>

      {/* TAB 1: KEG KALKULAČKA */}
      {activeTab === 'keg_calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 bg-white border border-neutral-200 rounded space-y-5 shadow-sm">
            <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
              <Cylinder className="text-amber-600" size={20} />
              <span>Kalkulačka potřebných sudů na stáčení z tanku</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Objem piva v tanku (hl)">
                <NumberStepper value={tankVolumeHl} onChange={setTankVolumeHl} step={1} min={0.5} />
              </Field>

              <Field label="Výtrata kalů / trubek (%)">
                <NumberStepper value={trubkyLossPct} onChange={setTrubkyLossPct} step={0.5} min={0} />
              </Field>
            </div>

            <div className="p-4 rounded bg-neutral-900 text-white space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-400">Hrubý objem piva:</span>
                <span className="font-black text-amber-400">{tankLiters} l ({(tankLiters / 100).toFixed(2)} hl)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Čistý stočitelný objem (-{trubkyLossPct}% kaly):</span>
                <span className="font-black text-emerald-400">{netLiters.toFixed(0)} l ({(netLiters / 100).toFixed(2)} hl)</span>
              </div>
            </div>

            {/* Simulátor */}
            <div className="p-5 rounded bg-amber-50/80 border-2 border-amber-300 space-y-4">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <h4 className="font-display font-black text-base text-amber-950"><Sliders className="ikona-text" /> Ruční volba sudů (30L vs 50L)</h4>
                <div className="flex items-center gap-1 bg-white p-1 rounded border border-amber-300">
                  <button type="button" onClick={() => setCalcMode('fix30')} className={`px-3 py-1 rounded text-xs font-black ${calcMode === 'fix30' ? 'bg-white text-amber-900 ring-2 ring-amber-300' : 'text-neutral-600'}`}>Zadám 30L</button>
                  <button type="button" onClick={() => setCalcMode('fix50')} className={`px-3 py-1 rounded text-xs font-black ${calcMode === 'fix50' ? 'bg-white text-amber-900 ring-2 ring-amber-300' : 'text-neutral-600'}`}>Zadám 50L</button>
                </div>
              </div>

              {calcMode === 'fix30' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-black text-neutral-800">Chci stočit přesně 30L sudů:</label>
                    <NumberStepper value={custom30Input} onChange={setCustom30Input} step={1} min={0} />
                  </div>
                  <div className="p-3.5 rounded bg-neutral-900 text-amber-300 font-mono text-xs space-y-1">
                    <div>• Zadala jsi: <strong className="text-amber-400 font-black">{custom30Count}× 30L sudů</strong> ({custom30Count * 30} L)</div>
                    <div>• Automaticky dopočítáno: <strong className="text-emerald-400 font-black">{auto50Count}× 50L sudů</strong> ({auto50Count * 50} L)</div>
                    <div className="pt-1 border-t border-neutral-700 flex justify-between text-xs">
                      <span>Celkem stočeno: <strong>{totalHlFix30} hl</strong></span>
                      <span className="text-amber-400">Zbytek: <strong>{remFinalFix30.toFixed(0)} L</strong></span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-black text-neutral-800">Chci stočit přesně 50L sudů:</label>
                    <NumberStepper value={custom50Input} onChange={setCustom50Input} step={1} min={0} />
                  </div>
                  <div className="p-3.5 rounded bg-neutral-900 text-amber-300 font-mono text-xs space-y-1">
                    <div>• Zadala jsi: <strong className="text-amber-400 font-black">{custom50Count}× 50L sudů</strong> ({custom50Count * 50} L)</div>
                    <div>• Automaticky dopočítáno: <strong className="text-emerald-400 font-black">{auto30Count}× 30L sudů</strong> ({auto30Count * 30} L)</div>
                    <div className="pt-1 border-t border-neutral-700 flex justify-between text-xs">
                      <span>Celkem stočeno: <strong>{totalHlFix50} hl</strong></span>
                      <span className="text-amber-400">Zbytek: <strong>{remFinalFix50.toFixed(0)} L</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 bg-white border-2 border-amber-300 rounded space-y-4 shadow-md">
            <h3 className="font-display font-black text-lg text-amber-950"><IkonaSud className="ikona-text" /> Varianty v sudování</h3>
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded bg-white border border-amber-300 space-y-1">
                <span className="text-[11px] font-black uppercase text-amber-900">1 Typ sudů:</span>
                <div>• {pure50}× 50L (zb. {rem50.toFixed(0)}l)</div>
                <div>• {pure30}× 30L (zb. {rem30.toFixed(0)}l)</div>
              </div>
              <div className="p-3 rounded bg-neutral-900 text-amber-300 space-y-1">
                <div className="text-[11px] font-black text-white uppercase">MIX 1 (Max 50L):</div>
                <div>• {mix1_50}× 50L + {mix1_30}× 30L</div>
              </div>
              <div className="p-3 rounded bg-neutral-900 text-emerald-300 space-y-1">
                <div className="text-[11px] font-black text-white uppercase">MIX 2 (50% / 50%):</div>
                <div>• {mix2_50}× 50L + {mix2_30}× 30L</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ŠROTOVÁNÍ SLADU */}
      {activeTab === 'srot_calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 bg-white border border-neutral-200 rounded space-y-4 shadow-sm">
            <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
              <Wheat className="text-amber-600" size={20} />
              <span>Plán šrotování — kolik sladu se šrotuje</span>
            </h3>

            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 text-[11px] font-black uppercase tracking-widest text-neutral-500">
              <span>Pivo</span>
              <span className="w-36 text-center">Slad (kg)</span>
              <span className="w-24 text-center">Pytlů 25 kg</span>
            </div>

            {srotRows.map((row, i) => {
              const kg = Number(row.kg) || 0;
              const bags = kg > 0 ? Math.ceil(kg / 25) : 0;
              return (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <select
                    className="input font-bold text-sm"
                    value={row.beerId}
                    onChange={(e) => setSrotRow(i, { beerId: e.target.value })}
                  >
                    <option value="">— vyber pivo —</option>
                    {beers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <div className="w-36">
                    <NumberStepper value={row.kg} onChange={(v) => setSrotRow(i, { kg: v })} step={5} min={0} />
                  </div>
                  <div className="w-24 text-center font-mono font-black text-sm bg-neutral-100 border border-neutral-200 rounded py-2">
                    {bags}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card p-6 bg-white border-2 border-amber-300 rounded space-y-4 shadow-md h-fit">
            <h3 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
              <span><Wheat className="ikona-text" /> Celkem na šrotování</span>
            </h3>

            <div className="p-4 rounded bg-neutral-900 text-white">
              <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Slad celkem</div>
              <div className="text-3xl font-mono font-black text-amber-400 mt-1">{srotTotalKg.toFixed(0)} kg</div>
            </div>

            <div className="p-4 rounded bg-white border border-amber-200 font-mono text-xs">
              <div className="flex justify-between">
                <span className="font-bold text-neutral-500">Pytle 25 kg:</span>
                <span className="font-black text-amber-950">{srotTotalBags} ks</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 font-medium leading-relaxed">
              Kolik sladu se našrotuje pro danou várku. Počet pytlů 25 kg se zaokrouhluje nahoru.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: SANITAČNÍ CHEMIE */}
      {activeTab === 'chem_calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-5 bg-white border border-neutral-200/90 rounded shadow-sm space-y-4">
            <h3 className="font-display font-black text-lg text-neutral-900">1. Výběr chemické látky & Parametry</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button type="button" onClick={() => selectPreset('louh')} className={`p-3 rounded font-black text-xs transition shadow-2xs flex flex-col items-center gap-1 ${chemType === 'louh' ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400 scale-[1.02]' : 'bg-neutral-50 text-neutral-800 hover:bg-neutral-100 border border-neutral-200'}`}>
                <span className="text-lg"><FlaskConical className="ikona-text" /></span><span>Louh 100%</span>
              </button>
              <button type="button" onClick={() => selectPreset('persteril')} className={`p-3 rounded font-black text-xs transition shadow-2xs flex flex-col items-center gap-1 ${chemType === 'persteril' ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400 scale-[1.02]' : 'bg-neutral-50 text-neutral-800 hover:bg-neutral-100 border border-neutral-200'}`}>
                <span className="text-lg"><SprayCan className="ikona-text" /></span><span>Persteril 15%</span>
              </button>
              <button type="button" onClick={() => selectPreset('dusicna')} className={`p-3 rounded font-black text-xs transition shadow-2xs flex flex-col items-center gap-1 ${chemType === 'dusicna' ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400 scale-[1.02]' : 'bg-neutral-50 text-neutral-800 hover:bg-neutral-100 border border-neutral-200'}`}>
                <FlaskConical className="ikona-text" /><span>Kyselina dusičná 53%</span>
              </button>
              <button type="button" onClick={() => selectPreset('chlornan')} className={`p-3 rounded font-black text-xs transition shadow-2xs flex flex-col items-center gap-1 ${chemType === 'chlornan' ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400 scale-[1.02]' : 'bg-neutral-50 text-neutral-800 hover:bg-neutral-100 border border-neutral-200'}`}>
                <SprayCan className="ikona-text" /><span>Chlornan 15%</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <Field label="Požadovaný objem roztoku (L)">
                <NumberStepper value={targetVolumeL} onChange={setTargetVolumeL} step={10} min={1} />
              </Field>
              <Field label="Koncentrace nezředěného roztoku (%)">
                <NumberStepper value={stockPct} onChange={setStockPct} step={5} min={0.1} />
              </Field>
              <Field label="Požadovaná cílová síla (%)">
                <NumberStepper value={targetPct} onChange={setTargetPct} step={0.5} min={0.1} />
              </Field>
            </div>
          </div>

          <div className="card p-5 bg-white border-2 border-amber-300 rounded shadow-md space-y-4">
            <h3 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
              <span><Scale className="ikona-text" /> Výsledek dávkování</span>
            </h3>

            <div className="space-y-3">
              <div className="p-3.5 rounded bg-white border border-amber-300 shadow-2xs">
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Množství chemie (koncentrátu)</div>
                <div className="text-2xl font-mono font-black text-amber-950 mt-1">
                  {vChem.toFixed(2)} L <span className="text-sm font-bold text-neutral-500">({(vChem * 1000).toFixed(0)} ml / g)</span>
                </div>
              </div>

              <div className="p-3.5 rounded bg-white border border-sky-200 shadow-2xs">
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Množství vody k doplnění</div>
                <div className="text-2xl font-mono font-black text-sky-950 mt-1">
                  {vWater.toFixed(2)} L
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ENERGETICKÁ NÁROČNOST */}
      {activeTab === 'energy_calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 bg-white border border-neutral-200 rounded space-y-5 shadow-sm">
            <div>
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Flame className="text-amber-600" size={20} />
                <span>Kalkulačka energetické náročnosti a médií (Varna & Sklep)</span>
              </h3>
            </div>

            <div className="p-4 rounded bg-amber-50 border border-amber-200">
              <label className="block text-xs font-black text-amber-950 mb-1">Velikost várky (Objem v hl)</label>
              <NumberStepper value={energyBatchHl} onChange={setEnergyBatchHl} step={1} min={0.5} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Elektřina */}
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="font-black text-xs text-neutral-900 uppercase"><Zap className="ikona-text" /> Elektřina (Chlazení + Čerpadla)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="kWh"><NumberStepper value={elecKwh} onChange={setElecKwh} step={10} min={0} /></Field>
                  <Field label="Kč/kWh"><NumberStepper value={elecKwc} onChange={setElecKwc} step={0.5} min={0} /></Field>
                </div>
              </div>

              {/* Plyn */}
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="font-black text-xs text-neutral-900 uppercase"><Flame className="ikona-text" /> Zemní plyn (Varna)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="m³ plynu"><NumberStepper value={gasM3} onChange={setGasM3} step={2} min={0} /></Field>
                  <Field label="Kč/m³"><NumberStepper value={gasKwc} onChange={setGasKwc} step={0.5} min={0} /></Field>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 bg-white border-2 border-amber-300 rounded shadow-md space-y-4">
            <h3 className="font-display font-black text-lg text-amber-950"><Zap className="ikona-text" /> Výsledné náklady</h3>
            <div className="space-y-3 font-mono">
              <div className="p-4 rounded bg-neutral-900 border border-neutral-800">
                <div className="text-[11px] text-neutral-400 uppercase">Celkem na 1 várku ({bHl} hl)</div>
                <div className="text-2xl font-black text-amber-400">{totalEnergyCostBatch.toLocaleString('cs-CZ')} Kč</div>
              </div>
              <div className="p-4 rounded bg-amber-500 text-neutral-950">
                <div className="text-[11px] font-black uppercase">Na 1 PŮLLITR (0.5 l)</div>
                <div className="text-3xl font-black">{costPerPint.toFixed(2)} Kč</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PŘEPOČET JEDNOTEK */}
      {activeTab === 'units_calc' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 bg-white border-2 border-amber-200 rounded space-y-4 shadow-sm">
            <h4 className="font-display font-black text-base text-amber-950"><IkonaSud className="ikona-text" /> Přepočet objemu (Hektolimetry hl)</h4>
            <NumberStepper value={volInputHl} onChange={setVolInputHl} step={1} min={0} />
            <div className="p-4 rounded bg-neutral-900 text-amber-300 font-mono text-xs space-y-1">
              <div>• Litry: <strong>{vLiters.toLocaleString('cs-CZ')} L</strong></div>
              <div>• Půllitry: <strong>{vPints.toLocaleString('cs-CZ')} ks</strong></div>
              <div>• Sudy 50L: <strong>{vKegs50.toFixed(1)} ks</strong></div>
              <div>• Sudy 30L: <strong>{vKegs30.toFixed(1)} ks</strong></div>
            </div>
          </div>

          <div className="card p-6 bg-white border-2 border-emerald-200 rounded space-y-4 shadow-sm">
            <h4 className="font-display font-black text-base text-emerald-950"><FlaskConical className="ikona-text" /> Stupňovitost (°P) a hustota (SG)</h4>
            <NumberStepper value={platoInput} onChange={setPlatoInput} step={0.5} min={0} />
            <div className="p-4 rounded bg-neutral-900 text-emerald-300 font-mono text-xs space-y-1">
              <div>• Specific Gravity: <strong>{sgExact.toFixed(3)} SG</strong></div>
              <div>• Brix: <strong>{degBrix.toFixed(1)} °Bx</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

