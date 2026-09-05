// 📅 Kalendář — na telefonu seznam, na velkém displeji měsíc.
// ---------------------------------------------------------------------------
// Původní podoba byla měsíční mřížka převzatá z počítače: sedm sloupců na
// šířku telefonu vychází kolem 50 px, takže se do buňky vešly jen tři
// oříznuté názvy v písmu 10 px, které se stejně nedaly přečíst. Nový výchozí
// pohled je proto SEZNAM (agenda) — chronologicky po dnech, každý řádek přes
// celou šířku a s dotykovým cílem přes 56 px. Měsíc zůstal jako druhý pohled;
// v jeho buňkách jsou místo textu barevné tečky, které jsou čitelné i na 50 px.
//
// Druhá změna je věcná: kalendář byl do téhle chvíle izolovaný zápisník, který
// o pivovaru nevěděl nic. Teď do něj přibyly ZÁVOZY a NAPLÁNOVANÉ STÁČENÍ
// (jen ke čtení), takže odpovídá na otázku „co se ten den děje", ne jen „co
// jsem si sem napsal".
import { useEffect, useMemo, useState } from 'react';
import {
  Bell, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Trash2, Truck, X,
} from 'lucide-react';
import { CalendarEvent, fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { chyba, toastZpet, uspech } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import { businessDateISO } from '../lib/businessDate';
import { IkonaLahev } from '../components/ikony';

const BARVY: Record<string, { tecka: string; pruh: string; popis: string }> = {
  primary: { tecka: 'bg-primary-500', pruh: 'bg-primary-500', popis: 'Modrá' },
  accent: { tecka: 'bg-primary-500', pruh: 'bg-primary-500', popis: 'Tyrkysová' },
  success: { tecka: 'bg-emerald-500', pruh: 'bg-emerald-500', popis: 'Zelená' },
  warning: { tecka: 'bg-amber-500', pruh: 'bg-amber-500', popis: 'Oranžová' },
  danger: { tecka: 'bg-rose-500', pruh: 'bg-rose-500', popis: 'Červená' },
};

const MESICE = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const DNY_ZKRATKY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const DNY_PLNE = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

function posun(iso: string, dnu: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dnu);
  return d.toISOString().slice(0, 10);
}
function denVTydnu(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
}
function formatDen(iso: string, dnes: string): string {
  if (iso === dnes) return 'Dnes';
  if (iso === posun(dnes, 1)) return 'Zítra';
  if (iso === posun(dnes, -1)) return 'Včera';
  const d = new Date(iso + 'T00:00:00Z');
  return `${DNY_PLNE[denVTydnu(iso)]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** Závoz nebo naplánované stáčení — do kalendáře jen ke čtení. */
type Provoz = { datum: string; druh: 'zavoz' | 'staceni'; popis: string };

export default function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [provoz, setProvoz] = useState<Provoz[]>([]);
  const [loading, setLoading] = useState(true);
  const [pohled, setPohled] = useState<'seznam' | 'mesic'>('seznam');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [vybranyDen, setVybranyDen] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);

  const dnes = businessDateISO();
  const [form, setForm] = useState({ title: '', description: '', reminder: false, reminder_time: '09:00', color: 'primary' });

  async function load() {
    const { data } = await supabase.from('calendar_events').select('*').order('event_date');
    setEvents((data as CalendarEvent[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['calendar_events'], load);

  // Provoz kolem dneška — dva měsíce dozadu a dopředu bohatě stačí a je to
  // jeden malý dotaz, ne tahání celé historie.
  useEffect(() => {
    let zruseno = false;
    (async () => {
      const od = posun(dnes, -62);
      const doKdy = posun(dnes, 62);
      try {
        const [{ data: obj }, { data: plany }] = await Promise.all([
          fetchAllRows('orders', 'delivery_date, place_name, status')
            .gte('delivery_date', od).lte('delivery_date', doKdy).neq('status', 'storno'),
          supabase.from('bottling_plans').select('planned_date, note, status')
            .gte('planned_date', od).lte('planned_date', doKdy).eq('status', 'planned'),
        ]);
        if (zruseno) return;
        const out: Provoz[] = [];
        (obj ?? []).forEach((o: any) => {
          if (o.delivery_date) out.push({ datum: o.delivery_date, druh: 'zavoz', popis: o.place_name || 'Objednávka' });
        });
        (plany ?? []).forEach((p: any) => {
          if (p.planned_date) out.push({ datum: p.planned_date, druh: 'staceni', popis: p.note || 'Naplánované stáčení' });
        });
        setProvoz(out);
      } catch {
        // Kalendář funguje i bez provozních dat — jsou jen doplněk.
      }
    })();
    return () => { zruseno = true; };
  }, [dnes]);

  async function pridej(datum: string) {
    if (!form.title.trim()) return;
    setUkladam(true);
    const { data, error } = await supabase.from('calendar_events').insert({
      event_date: datum,
      title: form.title.trim(),
      description: form.description || null,
      reminder: form.reminder,
      reminder_time: form.reminder ? form.reminder_time : null,
      color: form.color,
    }).select().single();
    setUkladam(false);
    if (error) { chyba(error); return; }
    if (data) setEvents((e) => [...e, data as CalendarEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    setForm({ title: '', description: '', reminder: false, reminder_time: '09:00', color: 'primary' });
    zavibruj('hotovo');
    uspech('Událost přidána.');
  }

  // Mazání se neptá dopředu — smaže a pár vteřin nabídne návrat. Na telefonu
  // je to o klepnutí míň a beze ztráty jistoty.
  async function smaz(e: CalendarEvent) {
    setEvents((seznam) => seznam.filter((x) => x.id !== e.id));
    const { error } = await supabase.from('calendar_events').delete().eq('id', e.id);
    if (error) { chyba(error); load(); return; }
    zavibruj('odskrtnuto');
    toastZpet(`Smazáno: ${e.title}`, async () => {
      const { data, error: chybaVraceni } = await supabase.from('calendar_events').insert({
        event_date: e.event_date, title: e.title, description: e.description,
        reminder: e.reminder, reminder_time: e.reminder_time, color: e.color,
      }).select().single();
      if (chybaVraceni) throw chybaVraceni;
      if (data) setEvents((seznam) => [...seznam, data as CalendarEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    });
  }

  const provozKDatu = useMemo(() => {
    const mapa = new Map<string, Provoz[]>();
    provoz.forEach((p) => {
      const s = mapa.get(p.datum) ?? [];
      s.push(p);
      mapa.set(p.datum, s);
    });
    return mapa;
  }, [provoz]);

  const udalostiKDatu = useMemo(() => {
    const mapa = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const s = mapa.get(e.event_date) ?? [];
      s.push(e);
      mapa.set(e.event_date, s);
    });
    return mapa;
  }, [events]);

  // ── Seznam: dny, kde se něco děje, od dneška dál (a kousek dozadu) ──────
  const dnySeznamu = useMemo(() => {
    const vsechny = new Set<string>([...udalostiKDatu.keys(), ...provozKDatu.keys()]);
    return [...vsechny]
      .filter((d) => d >= posun(dnes, -7))
      .sort()
      .slice(0, 60);
  }, [udalostiKDatu, provozKDatu, dnes]);

  // ── Měsíc: buňky mřížky ────────────────────────────────────────────────
  const bunky = useMemo(() => {
    const prvni = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const zacatek = (prvni.getUTCDay() + 6) % 7;
    const dnuVMesici = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < zacatek; i++) out.push(null);
    for (let d = 1; d <= dnuVMesici; d++) {
      out.push(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  if (loading) return <Spinner />;

  const denniKarta = (datum: string) => {
    const udalosti = udalostiKDatu.get(datum) ?? [];
    const provozDne = provozKDatu.get(datum) ?? [];
    const zavozu = provozDne.filter((p) => p.druh === 'zavoz').length;
    const staceni = provozDne.filter((p) => p.druh === 'staceni');
    const jeDnes = datum === dnes;

    return (
      <section key={datum} className={`card p-3 sm:p-4 ${jeDnes ? 'ring-2 ring-primary-400' : ''}`}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className={`font-display font-extrabold text-base first-letter:uppercase ${jeDnes ? 'text-primary-700' : 'text-neutral-900'}`}>
            {formatDen(datum, dnes)}
          </h3>
          <button
            onClick={() => { setVybranyDen(datum); zavibruj('klik'); }}
            className="shrink-0 min-h-[40px] px-3 rounded-xl text-xs font-black text-primary-700 hover:bg-primary-50 active:scale-95 transition inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Přidat
          </button>
        </div>

        <div className="space-y-1.5">
          {zavozu > 0 && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-sky-50 border border-sky-200/70 text-sky-900">
              <Truck className="w-5 h-5 shrink-0" />
              <span className="text-sm font-bold">
                {zavozu} {zavozu === 1 ? 'objednávka' : zavozu < 5 ? 'objednávky' : 'objednávek'} k závozu
              </span>
            </div>
          )}
          {staceni.map((p, i) => (
            <div key={`s-${i}`} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-900">
              <IkonaLahev className="w-5 h-5 shrink-0" />
              <span className="text-sm font-bold truncate">{p.popis}</span>
            </div>
          ))}
          {udalosti.map((e) => (
            <div key={e.id} className="flex items-start gap-2.5 p-2.5 rounded-xl border border-neutral-200/80 min-h-[56px]">
              <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${BARVY[e.color]?.tecka ?? BARVY.primary.tecka}`} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-neutral-900 flex items-center gap-1.5 flex-wrap">
                  {e.title}
                  {e.reminder && (
                    <span className="inline-flex items-center gap-1 text-udaj font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                      <Bell className="w-3 h-3" /> {e.reminder_time?.slice(0, 5)}
                    </span>
                  )}
                </div>
                {e.description && <p className="text-xs text-neutral-500 font-medium mt-0.5 whitespace-pre-line">{e.description}</p>}
              </div>
              <button
                onClick={() => smaz(e)}
                aria-label={`Smazat ${e.title}`}
                className="shrink-0 w-11 h-11 grid place-items-center rounded-xl text-neutral-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {udalosti.length === 0 && zavozu === 0 && staceni.length === 0 && (
            <p className="text-sm text-neutral-400 font-medium py-1">Nic naplánováno.</p>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-3">
      {/* Přepínač pohledu a posun měsíce — ukotvený nahoře, ať jde přepnout
          i uprostřed rolování dlouhého seznamu. */}
      <div className="sticky top-0 z-10 bg-neutral-100 py-1.5 -mx-3.5 px-3.5 sm:mx-0 sm:px-0 flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 shrink-0">
          {([['seznam', 'Seznam', List], ['mesic', 'Měsíc', CalendarDays]] as const).map(([id, popis, Ikona]) => (
            <button
              key={id}
              onClick={() => { setPohled(id); zavibruj('klik'); }}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 ${
                pohled === id ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Ikona className="w-4 h-4" /> {popis}
            </button>
          ))}
        </div>

        {pohled === 'mesic' && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              aria-label="Předchozí měsíc"
              onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))}
              className="w-11 h-11 grid place-items-center rounded-xl border border-neutral-200 bg-white active:scale-95 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-display font-extrabold text-sm text-neutral-900 min-w-[104px] text-center">
              {MESICE[cursor.m]} {cursor.y}
            </span>
            <button
              aria-label="Další měsíc"
              onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))}
              className="w-11 h-11 grid place-items-center rounded-xl border border-neutral-200 bg-white active:scale-95 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {pohled === 'seznam' && (
          <button
            onClick={() => { setVybranyDen(dnes); zavibruj('klik'); }}
            className="ml-auto btn-primary !rounded-xl !min-h-[40px] !px-3 text-xs"
          >
            <Plus className="w-4 h-4" /> Nová událost
          </button>
        )}
      </div>

      {pohled === 'seznam' ? (
        dnySeznamu.length === 0 ? (
          <div className="card p-8 text-center">
            <CalendarDays className="w-10 h-10 mx-auto text-neutral-300 mb-3" />
            <p className="font-bold text-neutral-700">Zatím tu nic není</p>
            <p className="text-sm text-neutral-500 mt-1">Přidejte událost nebo se sem propíšou závozy a naplánované stáčení.</p>
            <button onClick={() => setVybranyDen(dnes)} className="btn-primary !rounded-xl mt-4">
              <Plus className="w-4 h-4" /> Nová událost
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">{dnySeznamu.map(denniKarta)}</div>
        )
      ) : (
        <div className="card p-2.5 sm:p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DNY_ZKRATKY.map((d) => (
              <div key={d} className="text-center text-udaj font-black text-neutral-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {bunky.map((datum, i) => {
              if (!datum) return <div key={i} />;
              const udalosti = udalostiKDatu.get(datum) ?? [];
              const provozDne = provozKDatu.get(datum) ?? [];
              const jeDnes = datum === dnes;
              const den = Number(datum.slice(8));
              const vikend = denVTydnu(datum) >= 5;
              // V buňce jen tečky — text v 10 px se na telefonu stejně nedal
              // přečíst a jen dělal šum. Detail je po klepnutí.
              const tecky = [
                ...provozDne.filter((p) => p.druh === 'zavoz').slice(0, 1).map(() => 'bg-sky-500'),
                ...provozDne.filter((p) => p.druh === 'staceni').slice(0, 1).map(() => 'bg-emerald-500'),
                ...udalosti.slice(0, 3).map((e) => BARVY[e.color]?.tecka ?? BARVY.primary.tecka),
              ].slice(0, 4);
              return (
                <button
                  key={datum}
                  onClick={() => { setVybranyDen(datum); zavibruj('klik'); }}
                  className={`min-h-[52px] sm:min-h-[76px] p-1 rounded-xl border flex flex-col items-center justify-start gap-1 transition active:scale-95 ${
                    jeDnes ? 'border-primary-500 bg-primary-50' : vikend ? 'border-neutral-200/70 bg-neutral-50' : 'border-neutral-200/70 hover:bg-neutral-50'
                  }`}
                >
                  <span className={`text-xs font-black ${jeDnes ? 'text-primary-700' : 'text-neutral-600'}`}>{den}</span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {tecky.map((t, j) => <span key={j} className={`w-1.5 h-1.5 rounded-full ${t}`} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail dne — spodní list, stejně jako potvrzovací dialog v celé appce. */}
      {vybranyDen && (
        <div
          className="fixed inset-0 z-potvrzeni flex items-end sm:items-center justify-center bg-neutral-900/50 backdrop-blur-[2px]"
          onClick={() => setVybranyDen(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="p-4 border-b border-neutral-200 flex items-center gap-3 shrink-0">
              <h2 className="flex-1 font-display font-extrabold text-base text-neutral-900 first-letter:uppercase">
                {formatDen(vybranyDen, dnes)}
              </h2>
              <button
                onClick={() => setVybranyDen(null)}
                aria-label="Zavřít"
                className="w-11 h-11 grid place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {denniKarta(vybranyDen)}

              <div className="space-y-2.5 border-t border-neutral-200 pt-4">
                <h4 className="font-black text-xs uppercase tracking-wider text-neutral-500">Nová událost</h4>
                <input
                  className="input"
                  placeholder="Název"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <textarea
                  className="input"
                  placeholder="Popis / poznámka"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, reminder: !form.reminder })}
                    className={`min-h-[44px] px-3 rounded-xl text-xs font-black border inline-flex items-center gap-1.5 transition ${
                      form.reminder ? 'bg-amber-500 border-amber-500 text-neutral-950' : 'bg-white border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <Bell className="w-4 h-4" /> Upomínka
                  </button>
                  {form.reminder && (
                    <input
                      type="time"
                      className="input !w-auto !min-h-[44px]"
                      value={form.reminder_time}
                      onChange={(e) => setForm({ ...form, reminder_time: e.target.value })}
                    />
                  )}
                </div>

                {/* Barvy jako kolečka — vybrat prstem je rychlejší a je hned
                    vidět, jak bude tečka v mřížce vypadat. */}
                <div className="flex items-center gap-2">
                  {Object.entries(BARVY).map(([klic, b]) => (
                    <button
                      key={klic}
                      type="button"
                      aria-label={b.popis}
                      title={b.popis}
                      onClick={() => setForm({ ...form, color: klic })}
                      className={`w-11 h-11 rounded-xl grid place-items-center border-2 transition active:scale-95 ${
                        form.color === klic ? 'border-neutral-900' : 'border-transparent'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full ${b.tecka}`} />
                    </button>
                  ))}
                </div>

                <button
                  className="btn-primary !rounded-xl w-full !min-h-[48px]"
                  disabled={!form.title.trim() || ukladam}
                  onClick={() => pridej(vybranyDen)}
                >
                  {ukladam ? 'Ukládám…' : 'Přidat událost'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
