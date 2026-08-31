import { useState, useEffect, useMemo } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { Archive, BarChart3, Calendar, Castle, Clock, Download, CheckCircle2, ChevronDown, ChevronUp, Landmark, Plus, Trash2, User, UserCheck, UserRound, Users } from 'lucide-react';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { chyba as chybaOznam, oznam, potvrd } from '../lib/toast';
import { KLIC_EXKURZE, nactiExkurze, prenesZProhlizece, smazExkurzi, ulozExkurzi } from '../lib/exkurzeData';
import { rozdilProUlozeni } from '../lib/vycepyData';

export type ExkurzeEntry = {
  id: string;
  tour_date: string;       // YYYY-MM-DD
  tour_time: string;       // HH:MM
  people_count: number;    // Počet lidí
  guide_name: string;      // Kdo exkurzi prováděl
  revenue?: number;        // Tržba v Kč
  note?: string;           // Poznámka
  archived_month?: string; // YYYY-MM pokud je archivována v měsíční statistice
  created_at?: string;
};

export default function ExkurzeScreen() {
  const [entries, setEntries] = useState<ExkurzeEntry[]>(() => {
    try {
      const saved = localStorage.getItem('exkurze_entries_v1');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [currentMonth, setCurrentMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  // Form State - Default guide: František, Default people: 1
  const [tourDate, setTourDate] = useState(new Date().toISOString().slice(0, 10));
  const [tourTime, setTourTime] = useState('14:00');
  const [peopleCount, setPeopleCount] = useState<string>('1');
  const [guideName, setGuideName] = useState('František');
  const [revenue, setRevenue] = useState<string>('');
  const [note, setNote] = useState('');

  // Selected guide for drilldown stats
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // 🌐 Načtení z databáze. Do 31. 8. 2026 žily exkurze jen v prohlížeči —
  // rezervace zadaná na tabletu nebyla na mobilu a s ní ani tržba, což je
  // účetní údaj. Co komu zůstalo v prohlížeči, se při prvním načtení přenese.
  async function nactiZCloudu() {
    await prenesZProhlizece();
    setEntries(await nactiExkurze());
  }
  useEffect(() => { void nactiZCloudu(); }, []);
  // Zápis z jiného zařízení se projeví hned.
  useRealtime(['exkurze'], () => { void nactiZCloudu(); });

  // Stav v appce se překreslí hned, databáze se dorovná na pozadí. Posílá se
  // jen to, co se opravdu změnilo (viz rozdilProUlozeni).
  function saveEntries(newEntries: ExkurzeEntry[]) {
    const stare = entries;
    setEntries(newEntries);
    localStorage.setItem(KLIC_EXKURZE, JSON.stringify(newEntries));
    void (async () => {
      const { kUlozeni, kSmazani } = rozdilProUlozeni(stare, newEntries);
      for (const id of kSmazani) await smazExkurzi(id);
      for (const e of kUlozeni) {
        const chyba = await ulozExkurzi(e);
        if (chyba) chybaOznam('Exkurzi se nepodařilo uložit: ' + chyba);
      }
    })();
  }

  function handleAddExkurze(e: React.FormEvent) {
    e.preventDefault();
    const count = Number(peopleCount);
    if (!count || count <= 0) {
      oznam('Zadejte platný počet lidí.');
      return;
    }
    if (!guideName.trim()) {
      oznam('Zadejte jméno průvodce.');
      return;
    }

    const newE: ExkurzeEntry = {
      id: crypto.randomUUID(),
      tour_date: tourDate,
      tour_time: tourTime,
      people_count: count,
      guide_name: guideName.trim(),
      revenue: revenue ? Number(revenue) : undefined,
      note: note.trim() || undefined,
    };

    saveEntries([newE, ...entries]);
    setPeopleCount('1');
    setRevenue('');
    setNote('');
    oznam(`Exkurze pro ${count} ${count === 1 ? 'osobu' : count < 5 ? 'osoby' : 'osob'} (průvodce ${guideName}) byla úspěšně naplánována na ${new Date(tourDate).toLocaleDateString('cs-CZ')} v ${tourTime}!`);
  }

  async function handleDelete(id: string) {
    if (!(await potvrd('Smazat tuto exkurzi?'))) return;
    saveEntries(entries.filter((e) => e.id !== id));
  }

  // Active unarchived entries for the current view
  const activeEntries = useMemo(() => {
    return entries.filter((e) => !e.archived_month && e.tour_date.startsWith(currentMonth));
  }, [entries, currentMonth]);

  // Per-Guide statistics breakdown
  const guideStats = useMemo(() => {
    const map = new Map<string, { guideName: string; toursCount: number; peopleTotal: number; revenueTotal: number; items: ExkurzeEntry[] }>();

    entries.forEach((e) => {
      const g = e.guide_name?.trim() || 'Nespecifikovaný průvodce';
      const cur = map.get(g) || { guideName: g, toursCount: 0, peopleTotal: 0, revenueTotal: 0, items: [] };
      cur.toursCount += 1;
      cur.peopleTotal += Number(e.people_count || 0);
      cur.revenueTotal += Number(e.revenue || 0);
      cur.items.push(e);
      map.set(g, cur);
    });

    return [...map.values()].sort((a, b) => b.peopleTotal - a.peopleTotal);
  }, [entries]);

  // Archived month statistics
  const monthStats = useMemo(() => {
    const map = new Map<string, { month: string; toursCount: number; peopleTotal: number; revenueTotal: number; guides: Set<string> }>();

    entries.forEach((e) => {
      const monthKey = e.archived_month || e.tour_date.slice(0, 7);
      const cur = map.get(monthKey) || { month: monthKey, toursCount: 0, peopleTotal: 0, revenueTotal: 0, guides: new Set() };
      cur.toursCount += 1;
      cur.peopleTotal += Number(e.people_count || 0);
      cur.revenueTotal += Number(e.revenue || 0);
      if (e.guide_name) cur.guides.add(e.guide_name);
      map.set(monthKey, cur);
    });

    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [entries]);

  // Overall Totals
  const totalTours = useMemo(() => entries.reduce((s, e) => s + 1, 0), [entries]);
  const totalPeople = useMemo(() => entries.reduce((s, e) => s + Number(e.people_count || 0), 0), [entries]);
  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + Number(e.revenue || 0), 0), [entries]);

  // Archive current month
  async function handleArchiveMonth() {
    if (!activeEntries.length) {
      oznam('V tomto měsíci nejsou žádné aktivní exkurze k přesunu do statistiky.');
      return;
    }
    if (!(await potvrd(`Opravdu přesunout ${activeEntries.length} exkurzí měsíce ${currentMonth} do statistiky a vyčistit aktivní pole?`))) return;

    const next = entries.map((e) => {
      if (!e.archived_month && e.tour_date.startsWith(currentMonth)) {
        return { ...e, archived_month: currentMonth };
      }
      return e;
    });

    saveEntries(next);
    oznam(`Měsíc ${currentMonth} byl úspěšně přesunut do statistiky! Použijte jiný měsíc nebo přidejte nové exkurze.`);
  }

  function exportExcel() {
    const dataToExport = entries.map((e) => ({
      Datum: new Date(e.tour_date).toLocaleDateString('cs-CZ'),
      Čas: e.tour_time,
      'Počet lidí': e.people_count,
      Průvodce: e.guide_name,
      'Tržba (Kč)': e.revenue || 0,
      Stav: e.archived_month ? `Archivováno (${e.archived_month})` : 'Aktivní',
      Poznámka: e.note || '—',
    }));

    exportHistoryDetailToExcel(
      dataToExport,
      ['Datum', 'Čas', 'Počet lidí', 'Průvodce', 'Tržba (Kč)', 'Stav', 'Poznámka'],
      ['Datum', 'Čas', 'Počet lidí', 'Průvodce', 'Tržba (Kč)', 'Stav', 'Poznámka'],
      `Exkurze_Statistika_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Users size={18} />
            <span>Pivovarská turistika & Prohlídky</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span><Castle className="ikona-text" /> Exkurze v pivovaru & Rezervace</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Plánování termínů exkurzí s ochutnávkou, počty návštěvníků, evidencí průvodců a měsíční statistikou.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded text-xs font-bold">
            <Calendar size={15} className="text-amber-400" />
            <span>Měsíc:</span>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent text-amber-300 font-mono font-black border-none focus:outline-none"
            />
          </div>

          <button
            onClick={exportExcel}
            className="px-3.5 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Grid: Formulář nahoře + Seznam vpravo/dole */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulář Nová Exkurze */}
        <div className="card p-5 sm:p-6 bg-white border border-amber-200 rounded shadow-sm space-y-4 lg:col-span-1">
          <div className="border-b border-amber-100 pb-3">
            <h3 className="font-display font-black text-base sm:text-lg text-neutral-900 flex items-center gap-2">
              <Plus size={20} className="text-amber-500" />
              <span>Naplánovat novou exkurzi</span>
            </h3>
          </div>

          <form onSubmit={handleAddExkurze} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Datum exkurze</label>
                <input
                  type="date"
                  required
                  value={tourDate}
                  onChange={(e) => setTourDate(e.target.value)}
                  className="input font-mono font-bold text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Čas</label>
                <input
                  type="time"
                  required
                  value={tourTime}
                  onChange={(e) => setTourTime(e.target.value)}
                  className="input font-mono font-bold text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Počet lidí (osob)</label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPeopleCount(String(Math.max(1, (Number(peopleCount) || 0) - 1)))} className="w-9 h-9 shrink-0 grid place-items-center rounded bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="- 1 osoba">−</button>
                <span className="min-w-[3rem] px-3 text-center font-mono font-black text-lg bg-white border border-neutral-200 rounded py-2 shadow-2xs">
                  {peopleCount || '1'}
                </span>
                <button type="button" onClick={() => setPeopleCount(String((Number(peopleCount) || 0) + 1))} className="w-9 h-9 shrink-0 grid place-items-center rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm select-none active:scale-95 transition shadow-2xs" title="+ 1 osoba">+</button>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[1, 2, 5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPeopleCount(String((Number(peopleCount) || 0) + num))}
                    className="px-2 py-1 rounded text-xs font-black bg-amber-100 text-amber-950 hover:bg-amber-200 border border-amber-300 transition"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Průvodce (Kdo prováděl)</label>
                <span className="text-[11px] font-bold text-neutral-500">Primárně: František</span>
              </div>
              <input
                type="text"
                required
                placeholder="Např. František / Sládek Petr"
                value={guideName}
                onChange={(e) => setGuideName(e.target.value)}
                className="input font-bold text-xs"
              />
              <div className="flex gap-1.5 mt-1.5">
                {['František', 'Sládek Petr Bednář', 'Jan Novák'].map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setGuideName(name)}
                    className={`px-2 py-1 rounded text-[11px] font-black border transition ${
                      guideName === name
                        ? 'bg-white text-amber-900 border-amber-400 ring-2 ring-amber-300 shadow-2xs'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border-neutral-300'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Tržba / Vybraná částka (Kč)</label>
              <input
                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                min={0}
                placeholder="Např. 3000 Kč"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                className="input font-mono font-bold text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka / Jméno skupiny</label>
              <input
                type="text"
                placeholder="Např. Skupina z Německa / Svatba"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input text-xs"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Zarezervovat exkurzi
              </button>
            </div>
          </form>
        </div>

        {/* Aktivní seznam exkurzí pro zvolený měsíc */}
        <div className="card p-5 sm:p-6 bg-white border border-neutral-200 rounded shadow-sm space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span>Plánované a proběhlé exkurze pro měsíc {currentMonth} ({activeEntries.length})</span>
              </h3>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                Aktivní exkurze v tomto měsíci. Po skončení měsíce klikněte na tlačítko "Přesunout do statistiky".
              </p>
            </div>

            {activeEntries.length > 0 && (
              <button
                onClick={handleArchiveMonth}
                className="px-3.5 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-black text-xs transition shadow-xs flex items-center gap-1.5"
              >
                <Archive size={16} /> Přesunout měsíc do statistiky
              </button>
            )}
          </div>

          {activeEntries.length === 0 ? (
            <EmptyState text={`Pro měsíc ${currentMonth} nejsou žádné aktivní nearchivované exkurze.`} icon={Landmark} />
          ) : (
            <>
            {/* Mobilní karty */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {activeEntries.map((e) => (
                <div key={e.id} className="rounded border border-neutral-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 font-bold text-sm text-neutral-900">
                      <Calendar size={14} className="text-amber-600" />
                      {new Date(e.tour_date).toLocaleDateString('cs-CZ')}
                      <span className="font-mono text-neutral-500 text-xs">({e.tour_time})</span>
                    </span>
                    <button onClick={() => handleDelete(e.id)} className="w-9 h-9 grid place-items-center rounded hover:bg-rose-100 text-rose-600 transition shrink-0" title="Smazat">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-extrabold text-neutral-900">
                      <UserCheck size={14} className="text-amber-600" /> {e.guide_name}
                    </span>
                    <span className="font-mono font-black text-neutral-950">{e.people_count} osob</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-600 font-medium truncate">{e.note || '—'}</span>
                    <span className="font-mono font-black text-emerald-800 shrink-0">{e.revenue ? `${e.revenue.toLocaleString('cs-CZ')} Kč` : '—'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th>Datum & Čas</th>
                    <th className="text-right">Osob</th>
                    <th>Průvodce</th>
                    <th className="text-right">Tržba</th>
                    <th>Poznámka</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="font-bold text-[11px] text-neutral-900 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} className="text-amber-600" />
                          {new Date(e.tour_date).toLocaleDateString('cs-CZ')}
                          <span className="font-mono text-neutral-500 ml-1">({e.tour_time})</span>
                        </span>
                      </td>
                      <td className="text-right font-mono font-black text-[11px] text-neutral-950">
                        {e.people_count} osob
                      </td>
                      <td className="font-extrabold text-[11px] text-neutral-900">
                        <span className="flex items-center gap-1">
                          <UserCheck size={14} className="text-amber-600" /> {e.guide_name}
                        </span>
                      </td>
                      <td className="text-right font-mono font-black text-[11px] text-emerald-800">
                        {e.revenue ? `${e.revenue.toLocaleString('cs-CZ')} Kč` : '—'}
                      </td>
                      <td className="text-[11px] text-neutral-600 font-medium">{e.note || '—'}</td>
                      <td className="text-right">
                        <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition" title="Smazat">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>

      {/* <UserRound className="ikona-text" /> ROZKLIKÁVACÍ STATISTIKA PODLE PRŮVODCŮ */}
      <div className="card p-6 bg-white border border-amber-200 rounded shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-amber-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-lg shadow-sm">
              <UserRound className="ikona-text" />
            </div>
            <div>
              <h3 className="font-display font-black text-lg text-neutral-900">
                Přehled a statistika podle průvodců (Rozklikávací)
              </h3>
              <p className="text-xs text-neutral-500 font-medium">
                Klikněte na kteréhokoliv průvodce pro zobrazení jeho seznamu provedených exkurzí a počtu provedených lidí.
              </p>
            </div>
          </div>
        </div>

        {guideStats.length === 0 ? (
          <EmptyState text="Zatím nebyly zapsány žádné exkurze s průvodci." icon={UserRound} />
        ) : (
          <div className="space-y-3">
            {guideStats.map((gs) => {
              const isExpanded = expandedGuide === gs.guideName;
              return (
                <div
                  key={gs.guideName}
                  className={`rounded border transition-all overflow-hidden ${
                    isExpanded
                      ? 'bg-amber-50/70 border-amber-300 shadow-md'
                      : 'bg-neutral-50/80 border-neutral-200 hover:border-amber-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedGuide(isExpanded ? null : gs.guideName)}
                    className="w-full p-4 flex flex-wrap items-center justify-between gap-4 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black shadow-xs">
                        <User size={20} />
                      </div>
                      <div>
                        <div className="font-display font-black text-base text-neutral-950">
                          {gs.guideName}
                        </div>
                        <div className="text-xs text-neutral-500 font-bold">
                          {gs.toursCount} {gs.toursCount === 1 ? 'exkurze' : gs.toursCount < 5 ? 'exkurze' : 'exkurzí'} • Celkem {gs.peopleTotal} navštívených lidí
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-mono font-black text-lg text-emerald-800">
                          {gs.revenueTotal.toLocaleString('cs-CZ')} Kč
                        </div>
                        <div className="text-[11px] text-neutral-400 font-bold uppercase">Celková tržba</div>
                      </div>
                      {isExpanded ? <ChevronUp size={20} className="text-amber-700" /> : <ChevronDown size={20} className="text-neutral-400" />}
                    </div>
                  </button>

                  {/* Expanded detail table of tours for this guide */}
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-amber-200/80 bg-white space-y-3">
                      <div className="text-xs font-black text-neutral-800 uppercase tracking-wider">
                        Seznam exkurzí prováděných průvodcem: <strong className="text-amber-900">{gs.guideName}</strong> ({gs.items.length})
                      </div>
                      <div className="overflow-x-auto scrollbar-thin">
                        <table className="table text-xs">
                          <thead>
                            <tr>
                              <th>Datum & Čas</th>
                              <th className="text-right">Počet navštívených lidí</th>
                              <th className="text-right">Tržba (Kč)</th>
                              <th>Poznámka / Skupina</th>
                              <th>Stav</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gs.items.map((it) => (
                              <tr key={it.id} className="hover:bg-amber-50/40 transition">
                                <td className="font-bold text-neutral-900">
                                  {new Date(it.tour_date).toLocaleDateString('cs-CZ')} ({it.tour_time})
                                </td>
                                <td className="text-right font-mono font-black text-amber-950">
                                  {it.people_count} osob
                                </td>
                                <td className="text-right font-mono font-black text-emerald-800">
                                  {it.revenue ? `${it.revenue.toLocaleString('cs-CZ')} Kč` : '—'}
                                </td>
                                <td className="text-neutral-600 font-medium">{it.note || '—'}</td>
                                <td>
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                                    it.archived_month
                                      ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                      : 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                  }`}>
                                    {it.archived_month ? `Archiv (${it.archived_month})` : 'Aktivní'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📊 MĚSÍČNÍ STATISTIKA EXKURZÍ A CELKOVÉ ARCHIVNÍ SOUHRNY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <BarChart3 className="text-amber-600" size={20} />
            <span>Měsíční statistika exkurzí a archivní přehledy</span>
          </h2>
        </div>

        {/* 4 Karty souhrnů */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 bg-white border border-neutral-200 rounded shadow-xs space-y-1">
            <span className="text-[11px] font-black uppercase text-neutral-500 tracking-wider">Celkem exkurzí</span>
            <div className="font-display font-black text-3xl text-neutral-950">{totalTours} exkurzí</div>
          </div>

          <div className="card p-5 bg-white border border-neutral-200 rounded shadow-xs space-y-1">
            <span className="text-[11px] font-black uppercase text-neutral-500 tracking-wider">Celkem návštěvníků</span>
            <div className="font-display font-black text-3xl text-amber-600">{totalPeople.toLocaleString('cs-CZ')} lidí</div>
          </div>

          <div className="card p-5 bg-white border border-neutral-200 rounded shadow-xs space-y-1">
            <span className="text-[11px] font-black uppercase text-neutral-500 tracking-wider">Celková tržba</span>
            <div className="font-display font-black text-3xl text-emerald-700">{totalRevenue.toLocaleString('cs-CZ')} Kč</div>
          </div>
        </div>

        {/* Tabulka po měsících */}
        <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-4">
          <h3 className="font-display font-black text-base text-neutral-900">Přehled exkurzí podle měsíců</h3>

          {monthStats.length === 0 ? (
            <EmptyState text="Zatím žádná historie." icon={BarChart3} />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table">
                <thead>
                  <tr>
                    <th>Měsíc</th>
                    <th className="text-right">Počet exkurzí</th>
                    <th className="text-right">Celkem lidí</th>
                    <th>Průvodci</th>
                    <th className="text-right">Tržba (Kč)</th>
                  </tr>
                </thead>
                <tbody>
                  {monthStats.map((ms) => (
                    <tr key={ms.month} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="font-mono font-black text-xs text-neutral-950">{ms.month}</td>
                      <td className="text-right font-mono font-bold text-xs text-neutral-900">{ms.toursCount} exkurzí</td>
                      <td className="text-right font-mono font-black text-sm text-amber-950">{ms.peopleTotal} lidí</td>
                      <td className="text-xs font-bold text-neutral-700">{[...ms.guides].join(', ') || '—'}</td>
                      <td className="text-right font-mono font-black text-xs text-emerald-800">{ms.revenueTotal.toLocaleString('cs-CZ')} Kč</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
