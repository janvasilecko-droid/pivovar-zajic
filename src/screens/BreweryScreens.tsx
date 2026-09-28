import { useEffect, useState } from 'react';
import { supabase, Beer, useRealtime } from '../lib/supabase';
import { usePosledniNacteni } from '../lib/nacitani';
import { Spinner, EmptyState, Field } from '../components/ui';
import { FileText, FlaskConical, Check, CheckSquare, Flame, NotebookPen, Plus, RotateCcw, Truck, User, Wheat } from 'lucide-react';
import { businessDateISO } from '../lib/businessDate';
import { nactiJson, ulozJson } from '../lib/uloziste';

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

type VarnaChecklistItem = {
  id: string;
  /** Nadpis kroku — po sobě jdoucí položky se stejným nadpisem se seskupí pod jednu hlavičku. */
  fase: string;
  text: string;
};

/**
 * Checklist várky — přepis ručně psaných poznámek ke stáčení várky
 * (z provozu 24. 9. 2026), seřazený chronologicky přesně podle fází výroby:
 * příprava a vystírka → rmutování → scezování a filtrace → whirlpool
 * a chlazení. Nic se nepřeskupovalo ani nezkracovalo.
 */
const VARNA_CHECKLIST: VarnaChecklistItem[] = [
  // --- Fáze 1: Příprava, napouštění a vystírka ---
  { id: 'v1', fase: '1. Příprava — obecné', text: 'Při napouštění louhu z vany: nechat otevřenou výpusť, ať se neředí vodou. Co je v horké i studené sanitaci (sanifore), prostříknout vzduchem a vypustit před tankem.' },
  { id: 'v2', fase: '1. Příprava — obecné', text: 'U stěny (vany) je výpusť vyšší hladiny.' },
  { id: 'v3', fase: '1. Příprava — obecné', text: 'CHECK KLAPEK – vše OFF (zavřeno).' },
  { id: 'v4', fase: '1. Příprava — obecné', text: 'LEDovka: mít připraven aspoň půl tanku. Může se zapnout cirkulace. ZAVŘÍT SANITACI!' },
  { id: 'v5', fase: '1. Krok 1 — Napouštění vody', text: 'Otevřít vypouštění vzduchu (u šoupěte!!!).' },
  { id: 'v6', fase: '1. Krok 1 — Napouštění vody', text: 'Napustit vodu: studená plus bojler (nastavení 1. stupně na čerpadle odpovídá cca 10 °C).' },
  { id: 'v7', fase: '1. Krok 1 — Napouštění vody', text: 'Proplach trubek a čerpadla (u první várky): napřed z kotle do kanálu, pak teprve do scezovačky.' },
  { id: 'v8', fase: '1. Krok 1 — Napouštění vody', text: 'Napouštět vodu „do díry" (cca 20 hl), teplota vody cca 35 °C.' },
  { id: 'v9', fase: '1. Krok 1 — Napouštění vody', text: 'Pustit míchadlo v kotli!!! Pozor, když se točí míchadlo po odkopnutí díry.' },
  { id: 'v10', fase: '1. Krok 1 — Napouštění vody', text: 'Studenou vodu z řadu do vystíradla, pustit na chvilku cca na polovinu.' },
  { id: 'v11', fase: '1. Krok 2 — Sypání sladu (Vystírka)', text: 'Pustit šoupě, pustit slad.' },
  { id: 'v12', fase: '1. Krok 2 — Sypání sladu (Vystírka)', text: 'Otevřít sprchu na kotel (proplach vystíradla).' },
  { id: 'v13', fase: '1. Krok 2 — Sypání sladu (Vystírka)', text: 'Otevřít sprchy na scezovačku. Nastavit otáčky na 4,5.' },
  { id: 'v14', fase: '1. Krok 2 — Sypání sladu (Vystírka)', text: 'Pustit horkou vodu čerpadlem do sprchy.' },

  // --- Fáze 2: Rmutování (pro 1. a 2. rmut) ---
  { id: 'v15', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Míchadlo nastavit na 3–4, na frekvenčním měniči (SP) začít na 1.' },
  { id: 'v16', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Otevřít cestu zezadu.' },
  { id: 'v17', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Pustit čerpadlo na 5, poté na full (naplno).' },
  { id: 'v18', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Otáčky SP na 5.' },
  { id: 'v19', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Osprchovat kroužek a kotel (koli).' },
  { id: 'v20', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Až jde vidět konus (v okénku), snížit otáčky na 5 a sprchovat hustý rmut.' },
  { id: 'v21', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Ke konci vředu.' },
  { id: 'v22', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Nastavit míchadlo nad otvor.' },
  { id: 'v23', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Přehodit cesty.' },
  { id: 'v24', fase: '2. Krok 1 — Převod rmutu a ohřev', text: 'Snížit otáčky na SP.' },
  { id: 'v25', fase: '2. Krok 2', text: 'Hned v 15min pauze po prvním rmutu začít druhý.' },
  { id: 'v26', fase: '2. Krok 2', text: 'Teplotní schody: 62 °C – 7 min → 70–72 °C – 15 min → Var – 10 min.' },
  { id: 'v27', fase: '2. Krok 2', text: 'Vracení 2. rmutu je stejné jako u práce se rmutem.' },
  { id: 'v28', fase: '2. Krok 2', text: 'Pustit čerpadlo na 5, pak 4 a pustit míchadlo v kotli.' },
  { id: 'v29', fase: '2. Krok 2', text: 'Zvýšit otáčky na 5 u SP.' },
  { id: 'v30', fase: '2. Krok 2', text: 'Osprchovat kroužek SP.' },
  { id: 'v31', fase: '2. Krok 2', text: 'Cílový objem 15 hl – ideální teplota 65–66 °C na SP.' },
  { id: 'v32', fase: '2. Krok 2', text: 'Nechat prodlít (pauza) pod síty.' },
  { id: 'v33', fase: '2. Krok 2', text: 'Po vracení otočit, zavřít cestu a čerpadlo.' },
  { id: 'v34', fase: '2. Krok 3 — Čištění po rmutování', text: 'Vypnout čerpadlo, snížit otáčky na 58, na minimum 0,5.' },
  { id: 'v35', fase: '2. Krok 3 — Čištění po rmutování', text: 'Pustit čerpadlo na bojleru.' },
  { id: 'v36', fase: '2. Krok 3 — Čištění po rmutování', text: 'Udělat protlačku trubek PLUS pod síta.' },
  { id: 'v37', fase: '2. Krok 3 — Čištění po rmutování', text: 'Zavřít ventil před čerpadlem, pak ventil pro síta.' },
  { id: 'v38', fase: '2. Krok 3 — Čištění po rmutování', text: 'Vodu pustit pod síta, podrazit horní věnec.' },
  { id: 'v39', fase: '2. Krok 3 — Čištění po rmutování', text: 'Zavřít vodu, vysprchovat scezovací káď (SK) – odrazit mláto.' },
  { id: 'v40', fase: '2. Krok 3 — Čištění po rmutování', text: 'Vypustit a vyčistit kotel.' },

  // --- Fáze 3: Scezování a filtrace (podrážení) ---
  { id: 'v41', fase: '3. Krok 1 — Nastavení filtrace a podrážení', text: 'U druhého rmutu sanitace: louh na tank + sanifore. Tank je zavřený a pod CO₂.' },
  { id: 'v42', fase: '3. Krok 1 — Nastavení filtrace a podrážení', text: 'Podrážení: nastavit cestu podrážení.' },
  { id: 'v43', fase: '3. Krok 1 — Nastavení filtrace a podrážení', text: 'Pustit čerpadlo. Podrazit před čerpadlem.' },
  { id: 'v44', fase: '3. Krok 1 — Nastavení filtrace a podrážení', text: 'Kopačku pustit po cca půl hodině.' },
  { id: 'v45', fase: '3. Krok 1 — Nastavení filtrace a podrážení', text: 'Postupně sjíždět kopačkou až do konce.' },
  { id: 'v46', fase: '3. Krok 2 — Ukončení scezování', text: 'Při objemu 30 hl zastavit (resp. u 3–3,5 hl).' },
  { id: 'v47', fase: '3. Krok 2 — Ukončení scezování', text: 'Vypnout výtlak čerpadla.' },
  { id: 'v48', fase: '3. Krok 2 — Ukončení scezování', text: 'Nastavit otáčky 6–4 na čerpadle bojleru.' },
  { id: 'v49', fase: '3. Krok 2 — Ukončení scezování', text: 'Pustit vodu spodem pod síta, plus na půl do věnce.' },
  { id: 'v50', fase: '3. Krok 2 — Ukončení scezování', text: 'Kopačka dole, otáčky na 5.' },
  { id: 'v51', fase: '3. Krok 2 — Ukončení scezování', text: 'Dopustit vodu „po rameno" cca.' },
  { id: 'v52', fase: '3. Krok 2 — Ukončení scezování', text: 'DŮLEŽITÉ: Zkontrolovat a pustit míchání pro OHŘÍVÁNÍ PRODEJE!!! Než začne vařit.' },
  { id: 'v53', fase: '3. Krok 2 — Ukončení scezování', text: '14 hl vody v bojleru jako v kotli.' },

  // --- Fáze 4: Whirlpool a chlazení ---
  { id: 'v54', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Pustit kroužek, udržovat 0–4 cm s hladinou cca do 10 cm.' },
  { id: 'v55', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Cca 12 hl spodem, spodní část ramen.' },
  { id: 'v56', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Míchadlo na 5, úplně dole, čerpadlo na 7–8 na horní rameno.' },
  { id: 'v57', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Poté rameno na nízké otáčky na horký odpouštěcí kanál.' },
  { id: 'v58', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Podrazit.' },
  { id: 'v59', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Ihned poté otevřít vodu u čerpadla, otevřít kanál, vypustit bordel.' },
  { id: 'v60', fase: '4. Krok 1 — Whirlpool (spínání)', text: 'Přečerpat do Whirlpoolu.' },
  { id: 'v61', fase: '4. Krok 2 — Chladicí okruh', text: 'Nastavit cestu u Whirlpoolu na vratku.' },
  { id: 'v62', fase: '4. Krok 2 — Chladicí okruh', text: 'Hadici našroubovat na vratku na bojleru.' },
  { id: 'v63', fase: '4. Krok 2 — Chladicí okruh', text: 'Nechat vytéct teplou/studenou vodu.' },
  { id: 'v64', fase: '4. Krok 2 — Chladicí okruh', text: 'Přehodit hadici na cestu do Whirlpoolu a nechat cca 10 min cirkulovat.' },
  { id: 'v65', fase: '4. Krok 2 — Chladicí okruh', text: 'Poté přehodit hadici, pustit chladicí okruh.' },
  { id: 'v66', fase: '4. Krok 2 — Chladicí okruh', text: 'Počkat, až jde teplá mladina za průhledítko a pustit vzduch.' },
  { id: 'v67', fase: '4. Krok 3 — LEDovka a konec', text: 'Pustit čerpadlo ledovky na panelu.' },
  { id: 'v68', fase: '4. Krok 3 — LEDovka a konec', text: 'Nastavit cestu podle schématu.' },
  { id: 'v69', fase: '4. Krok 3 — LEDovka a konec', text: 'V LÉTĚ: Vypnout všechno ostatní chlazení v pivovaru!!!' },
  { id: 'v70', fase: '4. Krok 3 — LEDovka a konec', text: 'Pustit naplno „na kuláče" (kulové ventily).' },
  { id: 'v71', fase: '4. Krok 3 — LEDovka a konec', text: 'BOJLER je ledový.' },
];

// ==========================================
// 1. ŠROTOVÁNÍ SLADU
// ==========================================
export function SrotovaniScreen({ setPage }: { setPage?: (p: any, sec?: string) => void } = {}) {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [rows, setRows] = useState<SrotovaniRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Formular
  const [entryDate, setEntryDate] = useState(businessDateISO());
  const [beerId, setBeerId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load() {
    const smiZapsat = zacniNacteni();
    setLoading(true);
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('srotovani').select('*').order('entry_date', { ascending: false }),
    ]);
    if (!smiZapsat()) return;
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
  const [rezim, setRezim] = useState<'denni' | 'varna'>('denni');

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

  // 🍺 Checklist várky — zaškrtnuté kroky se pamatují přes den (localStorage,
  // klíč nese dnešní datum), ať se rozjetá várka nerozsype zavřením appky
  // uprostřed vaření. Nová várka druhý den začíná od nuly sama.
  const dnesVarna = businessDateISO();
  const klicVarny = `varna_checklist_${dnesVarna}`;
  const [varnaHotovo, setVarnaHotovo] = useState<Record<string, boolean>>(() => nactiJson(klicVarny, {}));
  useEffect(() => { ulozJson(klicVarny, varnaHotovo); }, [varnaHotovo, klicVarny]);
  function toggleVarna(id: string) {
    setVarnaHotovo((v) => ({ ...v, [id]: !v[id] }));
  }
  const varnaHotovoPocet = VARNA_CHECKLIST.filter((it) => varnaHotovo[it.id]).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Přepínač: denní úkoly, nebo checklist várky */}
      <div className="flex items-stretch gap-1 rounded bg-neutral-100 border border-neutral-200 p-1 max-w-md">
        <button
          type="button"
          onClick={() => setRezim('denni')}
          className={`flex-1 !rounded !px-3 !py-2.5 !min-h-[44px] font-black text-xs transition ${rezim === 'denni' ? 'btn-amber' : 'btn-ghost !border-none'}`}
        >
          <CheckSquare size={14} /> Denní seznam
        </button>
        <button
          type="button"
          onClick={() => setRezim('varna')}
          className={`flex-1 !rounded !px-3 !py-2.5 !min-h-[44px] font-black text-xs transition ${rezim === 'varna' ? 'btn-amber' : 'btn-ghost !border-none'}`}
        >
          <Flame size={14} /> Várka
        </button>
      </div>

      {rezim === 'denni' && (
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
      )}

      {rezim === 'varna' && (
        <div className="space-y-4">
          <div className="card p-4 bg-white border-2 border-amber-300 rounded shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded bg-amber-500 text-neutral-950 flex items-center justify-center shadow-md shrink-0">
                <Flame className="ikona-text" />
              </div>
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900">Checklist várky — od napouštění po chlazení</h3>
                <p className="text-xs text-neutral-600 font-bold">{varnaHotovoPocet} / {VARNA_CHECKLIST.length} hotovo · ukládá se samo, na nový den se sám vynuluje</p>
              </div>
            </div>
            <button type="button" onClick={() => setVarnaHotovo({})} className="btn-secondary !rounded text-xs font-black">
              <RotateCcw size={16} /> Nová várka
            </button>
          </div>

          <div>
            {VARNA_CHECKLIST.map((item, i) => {
              const novaFase = i === 0 || VARNA_CHECKLIST[i - 1].fase !== item.fase;
              const hotovo = !!varnaHotovo[item.id];
              return (
                <div key={item.id}>
                  {novaFase && (
                    <div className="text-udaj font-black uppercase tracking-wider text-amber-800 mt-4 mb-1.5 first:mt-0">{item.fase}</div>
                  )}
                  <div
                    onClick={() => toggleVarna(item.id)}
                    className={`p-3 mb-1.5 rounded border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      hotovo ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 opacity-80' : 'bg-neutral-50 border-neutral-200 text-neutral-900 hover:border-amber-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded border-2 grid place-items-center font-black text-xs shrink-0 mt-0.5 ${hotovo ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-white border-neutral-300'}`}>
                      {hotovo ? <Check className="ikona-text" /> : ''}
                    </span>
                    <span className={`text-sm font-medium leading-snug ${hotovo ? 'line-through' : ''}`}>{item.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

