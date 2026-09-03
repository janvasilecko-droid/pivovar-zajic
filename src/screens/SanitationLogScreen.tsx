import { useEffect, useState } from 'react';
import { supabase, SanitationLog } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { BookOpen, Calendar, Clock, Droplets, Edit3, FileSpreadsheet, FlaskConical, MessageSquare, Pencil, Plus, Search, ShieldCheck, Sparkles, SprayCan, User, X, type LucideIcon } from 'lucide-react';

import { useAuth } from '../lib/auth';


const METHOD_BADGES: Record<string, { label: string; bg: string; text: string; icon: LucideIcon }> = {
  kyselina_dusicna: { label: 'Kyselina dusičná', bg: 'bg-rose-100 border-rose-300', text: 'text-rose-950', icon: FlaskConical },
  louh: { label: 'Louh (NaOH)', bg: 'bg-amber-100 border-amber-300', text: 'text-amber-950', icon: SprayCan },
  oplach_vodou: { label: 'Oplach vodou', bg: 'bg-sky-100 border-sky-300', text: 'text-sky-950', icon: Droplets },
  persteril: { label: 'Persteril', bg: 'bg-violet-100 border-violet-300', text: 'text-violet-950', icon: Sparkles },
  kombinovana: { label: 'Kombinovaná sanitace', bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-950', icon: ShieldCheck },
};

// Skutečná ID ze Supabase (sanitation_logs.id) jsou UUID; lokální záznamy
// (offline fallback, viz handleAdd) mají id = String(Date.now()) — čistě
// číselný řetězec. Dřív se to rozlišovalo přes id.startsWith('17') (funguje
// jen náhodou, protože milisekundové Date.now() timestampy v této dekádě
// začínají "17" — přestane fungovat cca v roce 2027, a i dřív mělo malou
// šanci false-positive shody s náhodným UUID začínajícím "17"). Robustní
// kontrola: je to platný formát UUID, nebo ne.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isLocalOnlyId = (id: string) => !UUID_RE.test(id);

const getCurrentTimeStr = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const getDefaultConcentration = (m: string): number => {
  if (m === 'louh' || m === 'kyselina_dusicna' || m === 'kombinovana') return 2.0;
  if (m === 'persteril') return 0.5;
  return 0;
};

export default function SanitationLogScreen({ setPage }: { setPage?: (p: any) => void }) {
  const { profile, user } = useAuth();
  const defaultUserName = profile?.display_name || user?.email?.split('@')[0] || '';

  const [logs, setLogs] = useState<SanitationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTank, setFilterTank] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Note & time editing state for existing logs
  const [editingLog, setEditingLog] = useState<SanitationLog | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editTimeText, setEditTimeText] = useState('');
  const [editDurationNum, setEditDurationNum] = useState<number | ''>(20);
  const [editConcentrationPct, setEditConcentrationPct] = useState<number | ''>(2.0);
  const [updatingNote, setUpdatingNote] = useState(false);

  // Form states for manual add
  const [tankLabel, setTankLabel] = useState('Tank 1');
  const [method, setMethod] = useState<'kyselina_dusicna' | 'louh' | 'oplach_vodou' | 'persteril' | 'kombinovana'>('louh');
  const [sanitationDate, setSanitationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sanitationTime, setSanitationTime] = useState(getCurrentTimeStr);
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(20);
  const [concentrationPct, setConcentrationPct] = useState<number | ''>(2.0);
  const [performedBy, setPerformedBy] = useState(defaultUserName);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultUserName && !performedBy) {
      setPerformedBy(defaultUserName);
    }
  }, [defaultUserName]);

  async function load() {
    setLoading(true);
    let dbLogs: SanitationLog[] = [];
    try {
      const { data } = await supabase
        .from('sanitation_logs')
        .select('*')
        .order('sanitation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (data) dbLogs = data as SanitationLog[];
    } catch {}

    // Načteme i lokální data z localStorage
    const local = localStorage.getItem('sanitation_logs_data');
    let localLogs: SanitationLog[] = [];
    if (local) {
      try { localLogs = JSON.parse(local); } catch {}
    }

    // Sloučení a odstranění duplicit
    const combined = [...localLogs, ...dbLogs];
    const uniqueMap = new Map<string, SanitationLog>();
    combined.forEach((item) => {
      const key = item.id || `${item.sanitation_date}-${item.tank_label}-${item.method}-${item.created_at}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    const finalLogs = Array.from(uniqueMap.values()).sort((a, b) => {
      return new Date(b.created_at || b.sanitation_date).getTime() - new Date(a.created_at || a.sanitation_date).getTime();
    });

    setLogs(finalLogs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const newLog: Partial<SanitationLog> = {
      sanitation_date: sanitationDate,
      sanitation_time: sanitationTime || getCurrentTimeStr(),
      duration_minutes: durationMinutes !== '' ? Number(durationMinutes) : 20,
      concentration_pct: concentrationPct !== '' ? Number(concentrationPct) : getDefaultConcentration(method),
      tank_label: tankLabel,
      method,
      method_label: METHOD_BADGES[method]?.label ?? method,
      performed_by: performedBy.trim() || null,
      note: note.trim() || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { data } = await supabase.from('sanitation_logs').insert([newLog]).select();
      if (data) {
        setLogs((prev) => [data[0] as SanitationLog, ...prev]);
      } else {
        const item: SanitationLog = { id: String(Date.now()), ...newLog } as SanitationLog;
        const updated = [item, ...logs];
        setLogs(updated);
        localStorage.setItem('sanitation_logs_data', JSON.stringify(updated));
      }
    } catch {
      const item: SanitationLog = { id: String(Date.now()), ...newLog } as SanitationLog;
      const updated = [item, ...logs];
      setLogs(updated);
      localStorage.setItem('sanitation_logs_data', JSON.stringify(updated));
    }

    setSaving(false);
    setShowAddModal(false);
    setNote('');
  }

  async function handleSaveEditedLog() {
    if (!editingLog) return;
    setUpdatingNote(true);

    const updatedNote = editNoteText.trim() || null;
    const updatedTime = editTimeText.trim() || null;
    const updatedDuration = editDurationNum !== '' ? Number(editDurationNum) : 20;
    const updatedConcentration = editConcentrationPct !== '' ? Number(editConcentrationPct) : 2.0;

    const payload = {
      note: updatedNote,
      sanitation_time: updatedTime,
      duration_minutes: updatedDuration,
      concentration_pct: updatedConcentration,
    };

    // Update in state
    setLogs((prev) =>
      prev.map((item) => (item.id === editingLog.id ? { ...item, ...payload } : item))
    );

    // Update in localStorage
    const local = localStorage.getItem('sanitation_logs_data');
    if (local) {
      try {
        const arr = JSON.parse(local);
        const updatedArr = arr.map((item: any) =>
          item.id === editingLog.id ? { ...item, ...payload } : item
        );
        localStorage.setItem('sanitation_logs_data', JSON.stringify(updatedArr));
      } catch {}
    }

    // Update in Supabase if valid ID
    if (editingLog.id && !isLocalOnlyId(editingLog.id.toString())) {
      try {
        await supabase
          .from('sanitation_logs')
          .update(payload)
          .eq('id', editingLog.id);
      } catch {}
    }

    setUpdatingNote(false);
    setEditingLog(null);
  }

  const filtered = logs.filter((l) => {
    if (filterTank && l.tank_label !== filterTank) return false;
    if (filterMethod && l.method !== filterMethod) return false;
    return true;
  });

  const exportExcel = async () => {
    // Knihovna na Excel váží 628 kB — načte se teprve tady, při kliknutí na
    // export. Dřív se importovala staticky, takže se stahovala s obrazovkou
    // i tomu, kdo nikdy nic neexportuje.
    const XLSX = await import('xlsx-js-style');
    const rows = filtered.map((l) => ({
      'Datum sanitace': l.sanitation_date,
      'Čas sanitace': l.sanitation_time ?? (l.created_at ? l.created_at.slice(11, 16) : '—'),
      'Doba trvání (min)': l.duration_minutes ?? 20,
      'Nádoba / Tank': l.tank_label,
      'Metoda sanitace': METHOD_BADGES[l.method]?.label ?? l.method_label,
      'Koncentrace (%)': l.concentration_pct ?? getDefaultConcentration(l.method),
      'Provedl': l.performed_by ?? '—',
      'Poznámka k sanitaci': l.note ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sanitační deník');
    XLSX.writeFile(wb, `Sanitacni_denik_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const tanksList = [
    ...Array.from({ length: 8 }, (_, i) => `Tank ${i + 1}`),
    'Spilka 1', 'Spilka 2', 'Spilka 3',
    'Varna / Potrubí',
    'Myčka KEG sudů',
    'Stáčecí aparatúra'
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner / Toolbar */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          {/* Popisný nadpis obrazovky odstraněn — na telefonu zabíral
              půl displeje a neříkal nic, co by uživatel nevěděl. Ovládací
              prvky banneru zůstávají. */}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {setPage && (
            <button
              onClick={() => setPage('haccp')}
              className="px-3.5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-extrabold text-xs border border-neutral-700 transition shadow-xs flex items-center gap-1.5"
            >
              <BookOpen className="ikona-text" /> Sanitační řád (SOP)
            </button>
          )}
          <button
            onClick={exportExcel}
            className="px-3.5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-extrabold text-xs border border-neutral-700 transition shadow-xs flex items-center gap-1.5"
          >
            <FileSpreadsheet size={16} /> Export do Excelu
          </button>
          <button
            onClick={() => {
              setSanitationTime(getCurrentTimeStr());
              setDurationMinutes(20);
              setConcentrationPct(2.0);
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Plus size={16} /> + Zapsat sanitaci
          </button>
        </div>
      </div>

      <>
      {/* Filters */}
      <div className="card sticky top-0 z-10 p-4 bg-white border border-neutral-200/90 rounded flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
          <span><Search className="ikona-text" /> Filtr:</span>
        </div>
        <select
          value={filterTank}
          onChange={(e) => setFilterTank(e.target.value)}
          className="input !py-1.5 !px-3 text-xs font-semibold"
        >
          <option value="">Všechny tanky / nádoby</option>
          {tanksList.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="input !py-1.5 !px-3 text-xs font-semibold"
        >
          <option value="">Všechny chemie / metody</option>
          <option value="louh">Louh (NaOH 2%)</option>
          <option value="kyselina_dusicna">Kyselina dusičná (2%)</option>
          <option value="oplach_vodou">Oplach vodou</option>
          <option value="persteril">Persteril</option>
          <option value="kombinovana">Kombinovaná sanitace</option>
        </select>
      </div>

      {/* Main Table / List */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState text="Zatím žádné záznamy o sanitaci tanků." icon={Droplets} />
      ) : (
        <>
        <div className="space-y-2.5 md:hidden">
          {filtered.map((log) => {
            const badge = METHOD_BADGES[log.method] ?? {
              label: log.method_label || log.method,
              bg: 'bg-neutral-100 border-neutral-300',
              text: 'text-neutral-900',
              icon: FlaskConical,
            };
            const displayTime = log.sanitation_time || (log.created_at ? log.created_at.slice(11, 16) : null);
            const displayDuration = log.duration_minutes ?? 20;
            const displayConc = log.concentration_pct ?? (log.method === 'louh' || log.method === 'kyselina_dusicna' || log.method === 'kombinovana' ? 2.0 : null);
            return (
              <div key={log.id} className="card bg-white border border-neutral-200/90 rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded bg-neutral-900 text-white font-black text-xs shadow-xs">{log.tank_label}</span>
                  <button
                    onClick={() => {
                      setEditingLog(log);
                      setEditNoteText(log.note || '');
                      setEditTimeText(log.sanitation_time || (log.created_at ? log.created_at.slice(11, 16) : getCurrentTimeStr()));
                      setEditDurationNum(log.duration_minutes ?? 20);
                      setEditConcentrationPct(log.concentration_pct ?? getDefaultConcentration(log.method));
                    }}
                    className="min-h-[44px] px-3 py-1.5 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-900 text-xs font-bold border border-neutral-200 transition flex items-center gap-1"
                  >
                    <Edit3 size={14} />
                    <span>Upravit</span>
                  </button>
                </div>
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-bold text-xs shadow-xs ${badge.bg} ${badge.text}`}>
                    <span><badge.icon className="ikona-text" /></span><span>{badge.label}</span>
                    {displayConc !== null && <span className="ml-1 font-black px-1.5 py-0.5 rounded-md bg-black/10 text-[11px]">{displayConc} %</span>}
                  </span>
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-300 font-bold text-[11px]">
                    <Clock size={12} className="text-amber-700" /><span>{displayDuration} min</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1 text-neutral-500 font-bold">
                    <Calendar size={13} className="text-amber-600 shrink-0" />
                    {new Date(log.sanitation_date).toLocaleDateString('cs-CZ')}{displayTime ? ` · ${displayTime}` : ''}
                  </span>
                  {log.performed_by && (
                    <span className="flex items-center gap-1 text-neutral-700 font-semibold">
                      <User size={13} className="text-neutral-400" />{log.performed_by}
                    </span>
                  )}
                </div>
                {log.note && (
                  <div className="flex items-start gap-1.5 bg-amber-50/60 p-2 rounded border border-amber-200/60 text-xs font-semibold text-neutral-800 leading-snug">
                    <MessageSquare size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-line">{log.note}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden md:block card bg-white border border-neutral-200/90 rounded overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-100/80 border-b border-neutral-200/80 text-neutral-600 font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Datum a čas sanitace</th>
                  <th className="py-3 px-4">Trvání</th>
                  <th className="py-3 px-4">Nádoba / Tank</th>
                  <th className="py-3 px-4">Metoda & Koncentrace</th>
                  <th className="py-3 px-4">Provedl</th>
                  <th className="py-3 px-4">Poznámka sládka / Detaily</th>
                  <th className="py-3 px-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                {filtered.map((log) => {
                  const badge = METHOD_BADGES[log.method] ?? {
                    label: log.method_label || log.method,
                    bg: 'bg-neutral-100 border-neutral-300',
                    text: 'text-neutral-900',
                    icon: FlaskConical,
                  };
                  const displayTime = log.sanitation_time || (log.created_at ? log.created_at.slice(11, 16) : null);
                  const displayDuration = log.duration_minutes ?? 20;
                  const displayConc = log.concentration_pct ?? (log.method === 'louh' || log.method === 'kyselina_dusicna' || log.method === 'kombinovana' ? 2.0 : null);

                  return (
                    <tr key={log.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-neutral-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-amber-600 shrink-0" />
                          <span>{new Date(log.sanitation_date).toLocaleDateString('cs-CZ')}</span>
                          {displayTime && (
                            <span className="text-neutral-600 font-normal text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded-md border border-neutral-200">
                              {displayTime}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-300 font-bold text-[11px]">
                          <Clock size={12} className="text-amber-700" />
                          <span>{displayDuration} min</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-neutral-950 font-display text-sm whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded bg-neutral-900 text-white shadow-xs">
                          {log.tank_label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border font-bold text-xs shadow-xs ${badge.bg} ${badge.text}`}>
                          <span><badge.icon className="ikona-text" /></span>
                          <span>{badge.label}</span>
                          {displayConc !== null && (
                            <span className="ml-1 font-black px-1.5 py-0.5 rounded-md bg-black/10 text-[11px]">
                              {displayConc} %
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.performed_by ? (
                          <span className="flex items-center gap-1 text-neutral-700 font-semibold">
                            <User size={13} className="text-neutral-400" />
                            {log.performed_by}
                          </span>
                        ) : (
                          <span className="text-neutral-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700">
                        {log.note ? (
                          <div className="flex items-start gap-1.5 max-w-md bg-amber-50/60 p-2 rounded border border-amber-200/60 text-xs font-semibold text-neutral-800 leading-snug">
                            <MessageSquare size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <span className="whitespace-pre-line">{log.note}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400 italic text-[11px]">Bez poznámky</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setEditingLog(log);
                            setEditNoteText(log.note || '');
                            setEditTimeText(log.sanitation_time || (log.created_at ? log.created_at.slice(11, 16) : getCurrentTimeStr()));
                            setEditDurationNum(log.duration_minutes ?? 20);
                            setEditConcentrationPct(log.concentration_pct ?? getDefaultConcentration(log.method));
                          }}
                          className="px-2.5 py-1 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-900 text-[11px] font-bold border border-neutral-200 transition flex items-center gap-1 ml-auto"
                        >
                          <Edit3 size={13} />
                          <span>Upravit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Edit Log Modal (Note, Time, Duration, Concentration) */}
      {editingLog && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 bg-white rounded max-w-md w-full border-2 border-amber-400 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span><Pencil className="ikona-text" /> Upravit záznam o sanitaci</span>
              </h3>
              <button type="button" onClick={() => setEditingLog(null)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold" title="Zavřít"><X size={18} /></button>
            </div>

            <div className="bg-neutral-50 p-3 rounded border border-neutral-200 text-xs space-y-1">
              <div><strong className="text-neutral-900">Tank / Nádoba:</strong> {editingLog.tank_label}</div>
              <div><strong className="text-neutral-900">Metoda:</strong> {METHOD_BADGES[editingLog.method]?.label || editingLog.method_label}</div>
              <div><strong className="text-neutral-900">Datum:</strong> {editingLog.sanitation_date} • <strong>Provedl:</strong> {editingLog.performed_by || '—'}</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Čas sanitace</label>
                <input
                  type="time"
                  value={editTimeText}
                  onChange={(e) => setEditTimeText(e.target.value)}
                  className="input w-full font-bold text-xs"
                />
              </div>
              <div>
                <label className="label">Trvání (min)</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  min={1}
                  max={600}
                  value={editDurationNum}
                  onChange={(e) => setEditDurationNum(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full font-bold text-xs"
                />
              </div>
              <div>
                <label className="label">Koncentrace (%)</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  step="0.1"
                  min={0}
                  max={100}
                  value={editConcentrationPct}
                  onChange={(e) => setEditConcentrationPct(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full font-bold text-xs"
                />
              </div>
            </div>

            <div>
              <label className="label">Poznámka sládka / Podrobnosti sanitace</label>
              <textarea
                rows={4}
                value={editNoteText}
                onChange={(e) => setEditNoteText(e.target.value)}
                placeholder="Napište podrobnosti o sanitaci (např. pH 7.0 kontrolováno papírkem, těsnící gumička vyměněna, propláchnuto Persterilem)..."
                className="input w-full leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingLog(null)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button
                type="button"
                onClick={handleSaveEditedLog}
                disabled={updatingNote}
                className="btn-primary !rounded text-xs font-black shadow-md"
              >
                {updatingNote ? 'Ukládám…' : 'Uložit změny'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdd} className="card p-6 bg-white rounded max-w-md w-full border-2 border-amber-400 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span><SprayCan className="ikona-text" /> Zapsat novou sanitaci</span>
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold" title="Zavřít"><X size={18} /></button>
            </div>

            <div>
              <label className="label">Vyber Tank / Nádobu</label>
              <select value={tankLabel} onChange={(e) => setTankLabel(e.target.value)} className="input w-full font-bold">
                {tanksList.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Metoda sanitace / Chemie</label>
              <select
                value={method}
                onChange={(e: any) => {
                  const m = e.target.value;
                  setMethod(m);
                  setConcentrationPct(getDefaultConcentration(m));
                }}
                className="input w-full font-bold"
              >
                <option value="louh">Louh NaOH (výchozí 2%)</option>
                <option value="kyselina_dusicna">Kyselina dusičná (výchozí 2%)</option>
                <option value="oplach_vodou">Oplach vodou</option>
                <option value="kombinovana">Kombinovaná sanitace (2%)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Datum sanitace</label>
                <input type="date" value={sanitationDate} onChange={(e) => setSanitationDate(e.target.value)} className="input w-full font-bold text-xs" />
              </div>
              <div>
                <label className="label">Čas sanitace</label>
                <input type="time" value={sanitationTime} onChange={(e) => setSanitationTime(e.target.value)} className="input w-full font-bold text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Doba trvání (min)</label>
                <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={1} max={600} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))} className="input w-full font-bold text-xs" />
              </div>
              <div>
                <label className="label">Koncentrace (%)</label>
                <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0} max={100} value={concentrationPct} onChange={(e) => setConcentrationPct(e.target.value === '' ? '' : Number(e.target.value))} className="input w-full font-bold text-xs" />
              </div>
              <div>
                <label className="label">Sanitaci provedl</label>
                <input type="text" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Jméno sládka" className="input w-full text-xs" />
              </div>
            </div>

            <div>
              <label className="label">Poznámka k sanitaci (Volitelné)</label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Zadejte poznámku (např. pH 7.0 O.K., ostřik topného dna, výměna gumičky...)"
                className="input w-full leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button type="submit" disabled={saving} className="btn-primary !rounded text-xs font-black shadow-md">
                {saving ? 'Ukládám…' : 'Uložit do Sanitačního deníku'}
              </button>
            </div>
          </form>
        </div>
      )}
      </>
    </div>
  );
}
