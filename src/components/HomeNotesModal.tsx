import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Plus, Bell, BellRing, Check, Trash2, StickyNote, LayoutGrid, AlertTriangle, Users } from 'lucide-react';
import { getHomeNotes, addHomeNote, toggleHomeNote, toggleHomeNoteImportant, deleteHomeNote, clearCompletedNotes, HOME_NOTES_CHANGED_EVENT, type HomeNote } from '../lib/homeNotes';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/supabase';
import { chyba as chybaOznam, oznam } from '../lib/toast';
import { nactiSdilene, pridejSdilenou, prepniHotovo, smazSdilenou, SDILENE_POZNAMKY_ZMENA, type SdilenaPoznamka } from '../lib/sdilenePoznamky';
import { getHomeLayout, saveHomeLayout, addTile } from '../lib/homeLayout';
import { ReminderItem, acknowledgeReminder, createReminder, deleteReminder, fetchReminders } from '../lib/reminders';
import { isNotificationSupported, requestNotificationPermission } from '../lib/notifications';
import UpozorneniForm from './UpozorneniForm';
import UpozorneniPruh from './UpozorneniPruh';
import {
  NastaveniUpozorneni, nazevUpozorneni, prijemciZNastaveni, terminZNastaveni,
  upozorneniKPoznamce, vychoziNastaveni,
} from '../lib/upozorneniPoznamky';
import { NAV, EXTRA_NAV } from './Layout';

export function HomeNotesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile, patchProfile } = useAuth();
  const [notes, setNotes] = useState<HomeNote[]>(() => getHomeNotes());
  const [newText, setNewText] = useState('');
  const [selectedColor, setSelectedColor] = useState<HomeNote['color']>('yellow');
  const [showCompleted, setShowCompleted] = useState(true);
  const [pinToHome, setPinToHome] = useState(true);
  // 📌 Vzkaz pro celou směnu. Běžná poznámka je OSOBNÍ (jen moje, přenese se
  // mi mezi mými zařízeními); tohle ji pošle všem do společné nástěnky.
  const [proVsechny, setProVsechny] = useState(false);
  const [sdilene, setSdilene] = useState<SdilenaPoznamka[]>([]);

  // 🔔 Upozornění k poznámkám — zadání z 19. 9. 2026: „plus tam přidej
  // možnost upozornění." Stejný mechanismus jako u Poznámek (screens/Notes.tsx):
  // připomínka se páruje s poznámkou podle jejího textu, viz lib/upozorneniPoznamky.ts.
  const [upozorneni, setUpozorneni] = useState<ReminderItem[]>([]);
  const [chciUpozorneni, setChciUpozorneni] = useState(false);
  const [nastaveni, setNastaveni] = useState<NastaveniUpozorneni>(() => vychoziNastaveni());
  /** U které už napsané poznámky je právě otevřené nastavení upozornění. */
  const [nastavujiProId, setNastavujiProId] = useState<string | null>(null);
  const [nastaveniProPoznamku, setNastaveniProPoznamku] = useState<NastaveniUpozorneni>(() => vychoziNastaveni());

  const jmeno = (profile as any)?.display_name || user?.email || null;

  async function nactiSpolecne() { setSdilene(await nactiSdilene()); }

  useEffect(() => {
    const handleUpdate = () => setNotes(getHomeNotes());
    window.addEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
    window.addEventListener(SDILENE_POZNAMKY_ZMENA, nactiSpolecne);
    return () => {
      window.removeEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
      window.removeEventListener(SDILENE_POZNAMKY_ZMENA, nactiSpolecne);
    };
  }, []);

  // Společná nástěnka se načte při otevření okna a při změně od kolegy.
  useEffect(() => { if (isOpen) void nactiSpolecne(); }, [isOpen]);
  useRealtime(['sdilene_poznamky'], () => { void nactiSpolecne(); });

  async function nactiUpozorneni() { setUpozorneni(await fetchReminders()); }
  useEffect(() => { if (isOpen) void nactiUpozorneni(); }, [isOpen]);
  useRealtime(['reminders'], () => { void nactiUpozorneni(); });

  /** Upozornění, které u téhle poznámky visí — nebo null. */
  function upozorneniK(note: HomeNote): ReminderItem | null {
    return upozorneniKPoznamce({ title: null, body: note.text }, upozorneni);
  }

  /** Založí upozornění k textu. Vrací hlášku, když to nejde — ne výjimku. */
  async function zalozUpozorneni(text: string, n: NastaveniUpozorneni): Promise<string | null> {
    const nazev = nazevUpozorneni({ title: null, body: text });
    if (!nazev) return 'Napište nejdřív poznámku — z čeho jinak upozornění udělat.';
    const prijemci = prijemciZNastaveni(n);
    if ('chyba' in prijemci) return prijemci.chyba;
    // Bez svolení prohlížeče by push nikam nedorazil a nikdo by se to nedozvěděl.
    if ((n.zobrazeni === 'desktop_push' || n.zobrazeni === 'both') && isNotificationSupported()
        && Notification.permission !== 'granted') {
      await requestNotificationPermission();
    }
    await createReminder({
      title: nazev,
      note: text,
      date_time: terminZNastaveni(n),
      target_role: prijemci.target_role,
      target_emails: prijemci.target_emails,
      display_mode: n.zobrazeni,
      created_by: jmeno || 'Poznámky',
    });
    await nactiUpozorneni();
    return null;
  }

  async function zrusUpozorneni(id: string) {
    await deleteReminder(id);
    await nactiUpozorneni();
  }
  async function odkliknout(id: string) {
    await acknowledgeReminder(id, user?.email || '');
    await nactiUpozorneni();
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;

    if (proVsechny) {
      // Vzkaz pro směnu se neukládá mezi moje osobní poznámky — jinak by ho
      // pisatel viděl dvakrát, jednou jako svůj a jednou jako společný.
      const text = newText;
      setNewText('');
      void pridejSdilenou(text, jmeno).then((chyba) => {
        if (chyba) chybaOznam('Vzkaz se nepodařilo odeslat: ' + chyba);
        else oznam('Vzkaz vidí celá směna.');
      });
      return;
    }

    addHomeNote(newText, undefined, selectedColor);
    // Upozornění až po poznámce: kdyby uložení poznámky selhalo, nesmí zbýt
    // připomínka na text, který nikde není.
    if (chciUpozorneni) {
      const text = newText;
      const kdy = nastaveni;
      void zalozUpozorneni(text, kdy).then((potiz) => {
        if (potiz) chybaOznam(potiz);
        else oznam('Poznámka uložená, upozornění nastavené.');
      });
      setChciUpozorneni(false);
      setNastaveni(vychoziNastaveni());
    }
    setNewText('');

    if (pinToHome) {
      const allNavIds = [...NAV.map((n) => n.id), ...EXTRA_NAV.map((n) => n.id)];
      const layout = getHomeLayout(profile?.home_layout, allNavIds, []);
      const isPinned = layout.pages.some((page) => page.includes('notes'));
      if (!isPinned) {
        const nextLayout = addTile(layout, 'notes', 0);
        patchProfile({ home_layout: nextLayout as any });
        if (user?.id) void saveHomeLayout(user.id, nextLayout);
      }
    }
  }

  // Důležité poznámky první, ať na ně člověk hned narazí, ne až dole v seznamu.
  const activeNotes = notes.filter((n) => !n.completed).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
  const completedNotes = notes.filter((n) => n.completed);

  const COLOR_STYLES: Record<NonNullable<HomeNote['color']>, { bg: string; border: string; text: string; badge: string }> = {
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-950', badge: 'bg-amber-400' },
    blue: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-950', badge: 'bg-sky-400' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-950', badge: 'bg-emerald-400' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-950', badge: 'bg-rose-400' },
    amber: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-950', badge: 'bg-primary-400' },
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Rychlé poznámky & Nástěnka">
      <div className="space-y-4">
        {/* Formular pro pridani nove poznamky */}
        <form onSubmit={handleAdd} className="space-y-2 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          {/* Klávesnice telefonu tu NESMÍ opravovat slova. Pivovarské názvy
              (tanky, kegy, spilka, zákys) ve slovníku nejsou, takže je Gboard
              přepisoval na nejbližší známé slovo — „víčka na tanky" se uložila
              jako „víčka na zanky" a vzkaz pak neznamenal nic. Velké písmeno
              na začátku věty zůstává, opravy slov ne. */}
          <textarea
            rows={2}
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="w-full text-sm font-medium border border-neutral-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Napište novou poznámku či vzkaz..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd(e);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {(['yellow', 'blue', 'green', 'rose', 'amber'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`tap w-6 h-6 rounded-full transition-transform ${COLOR_STYLES[c].badge} ${selectedColor === c ? 'scale-125 ring-2 ring-neutral-800' : 'opacity-70 hover:opacity-100'}`}
                />
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinToHome}
                onChange={(e) => setPinToHome(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <LayoutGrid size={14} className="text-neutral-500" />
              <span>Umístit dlaždici na plochu</span>
            </label>
            {/* 📌 Vzkaz pro celou směnu. Barva ani dlaždice se u něj neuplatní —
                je to společná nástěnka, ne moje poznámka. */}
            <label className={`inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none px-2 py-1 rounded-lg border transition ${
              proVsechny ? 'bg-sky-50 border-sky-300 text-sky-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
            }`}>
              <input
                type="checkbox"
                checked={proVsechny}
                onChange={(e) => setProVsechny(e.target.checked)}
                className="rounded text-sky-500 focus:ring-sky-400"
              />
              <Users size={14} />
              <span>Poslat všem</span>
            </label>
            {/* 🔔 Upozornění — nepovinné. Nastavení se rozbalí až po zaškrtnutí,
                ať formulář nevypadá složitěji, než je. */}
            <label className={`inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none px-2 py-1 rounded-lg border transition ${
              chciUpozorneni ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
            }`}>
              <input
                type="checkbox"
                checked={chciUpozorneni}
                onChange={(e) => setChciUpozorneni(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <Bell size={14} />
              <span>Upozornit</span>
            </label>
            <button
              type="submit"
              disabled={!newText.trim()}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition ml-auto"
            >
              <Plus size={16} /> {proVsechny ? 'Poslat všem' : chciUpozorneni ? 'Přidat s upozorněním' : 'Přidat poznámku'}
            </button>
          </div>
          {chciUpozorneni && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
              <UpozorneniForm hodnota={nastaveni} zmen={setNastaveni} />
            </div>
          )}
        </form>

        {/* 📌 Společná nástěnka — vzkazy, které poslal někdo celé směně.
            Stojí NAD osobními poznámkami schválně: „došly korunky" se týká
            všech a nemá být schované pod mým vlastním seznamem.
            Odškrtnutí tady platí pro všechny, je to společný úkol. */}
        {sdilene.length > 0 && (
          <div className="rounded-xl border-2 border-sky-200 bg-sky-50/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-udaj font-black uppercase tracking-wider text-sky-800">
              <Users size={14} /> Pro celou směnu
            </div>
            {sdilene.map((p) => (
              <div
                key={p.id}
                className={`flex items-start gap-2 rounded-lg bg-white border border-sky-200 p-2 ${p.hotovo ? 'opacity-55' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => void prepniHotovo(p, jmeno)}
                  className="w-5 h-5 shrink-0 mt-0.5 rounded-md border-2 border-sky-400 grid place-items-center hover:bg-sky-100 transition tap"
                  title={p.hotovo ? 'Vrátit jako nesplněné' : 'Odškrtnout pro všechny'}
                >
                  {p.hotovo && <Check size={12} className="text-emerald-700 stroke-[3]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold leading-snug break-words ${p.hotovo ? 'line-through' : ''}`}>
                    {p.dulezite && <span className="text-rose-600 font-black mr-1">!</span>}
                    {p.text}
                  </p>
                  <div className="text-udaj text-neutral-500 font-medium mt-0.5">
                    {p.autor || 'Neznámý'}
                    {p.hotovo && p.hotovo_kdo ? ` · odškrtl ${p.hotovo_kdo}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void smazSdilenou(p.id)}
                  className="p-1 rounded text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 tap"
                  title="Smazat vzkaz pro všechny" aria-label="Smazat vzkaz pro všechny"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Seznam aktivnich poznamek */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {activeNotes.length === 0 && completedNotes.length === 0 ? (
            <div className="text-center py-6 text-neutral-400 text-sm">
              <StickyNote size={32} className="mx-auto mb-2 opacity-40 text-neutral-500" />
              Žádné zapsané poznámky. Přidejte první vzkaz výše.
            </div>
          ) : (
            <>
              {activeNotes.map((note) => {
                const style = COLOR_STYLES[note.color || 'yellow'];
                const maUpozorneni = upozorneniK(note);
                return (
                  <div
                    key={note.id}
                    className={`rounded-xl border shadow-xs transition ${
                      note.important ? 'bg-rose-50 border-rose-300 text-rose-950' : `${style.bg} ${style.border} ${style.text}`
                    }`}
                  >
                  <div className="flex items-start justify-between gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => toggleHomeNote(note.id)}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 border-neutral-400/80 bg-white/90 grid place-items-center shrink-0 hover:border-amber-600 transition tap"
                      title="Označit jako hotové / odškrtnout"
                    >
                      {note.completed && <Check size={14} className="text-emerald-700 font-bold" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="lze-vybrat text-sm font-semibold whitespace-pre-wrap leading-snug">{note.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleHomeNoteImportant(note.id)}
                      className={`tap p-1 shrink-0 transition rounded ${note.important ? 'text-rose-600' : 'text-neutral-300 hover:text-rose-500'}`}
                      title={note.important ? 'Zrušit důležitost' : 'Označit jako důležité'}
                    >
                      <AlertTriangle size={16} className={note.important ? 'fill-rose-200' : ''} />
                    </button>
                    {!maUpozorneni && (
                      <button
                        type="button"
                        onClick={() => {
                          setNastavujiProId(nastavujiProId === note.id ? null : note.id);
                          setNastaveniProPoznamku(vychoziNastaveni());
                        }}
                        className="text-neutral-400 hover:text-amber-600 p-1 shrink-0 transition tap"
                        title="Přidat upozornění" aria-label="Přidat upozornění"
                      >
                        <Bell size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { void deleteHomeNote(note.id); if (maUpozorneni) void zrusUpozorneni(maUpozorneni.id); }}
                      className="text-neutral-400 hover:text-rose-600 p-1 shrink-0 transition tap"
                      title="Smazat poznámku" aria-label="Smazat poznámku"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Upozornění, které u téhle poznámky visí. */}
                  {maUpozorneni && (
                    <div className="px-3 pb-3">
                      <UpozorneniPruh
                        upozorneni={maUpozorneni}
                        jaEmail={user?.email || ''}
                        odkliknout={(id) => void odkliknout(id)}
                        smazat={(id) => void zrusUpozorneni(id)}
                      />
                    </div>
                  )}

                  {/* Nastavení upozornění u už napsané poznámky. */}
                  {nastavujiProId === note.id && !maUpozorneni && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="rounded-lg border border-amber-200 bg-white/80 p-2.5">
                        <UpozorneniForm hodnota={nastaveniProPoznamku} zmen={setNastaveniProPoznamku} />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const potiz = await zalozUpozorneni(note.text, nastaveniProPoznamku);
                            if (potiz) chybaOznam(potiz);
                            else setNastavujiProId(null);
                          }}
                          className="btn-amber btn-sm"
                        >
                          <BellRing size={14} /> Upozornit
                        </button>
                        <button type="button" onClick={() => setNastavujiProId(null)} className="btn-secondary btn-sm">
                          Zrušit
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}

              {completedNotes.length > 0 && (
                <div className="pt-3 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="text-xs font-bold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
                    >
                      Hotové poznámky ({completedNotes.length})
                    </button>
                    <button
                      type="button"
                      onClick={clearCompletedNotes}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Vyčistit hotové
                    </button>
                  </div>

                  {showCompleted && (
                    <div className="space-y-1.5 opacity-75">
                      {completedNotes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 text-sm"
                        >
                          <button
                            type="button"
                            onClick={() => toggleHomeNote(note.id)}
                            className="w-5 h-5 rounded-md bg-emerald-700 text-white grid place-items-center shrink-0 tap"
                            title="Vrátit mezi aktivní" aria-label="Vrátit mezi aktivní"
                          >
                            <Check size={14} />
                          </button>
                          <span className="flex-1 line-through truncate">{note.text}</span>
                          <button
                            type="button"
                            onClick={() => deleteHomeNote(note.id)}
                            title="Smazat poznámku" aria-label="Smazat poznámku"
                            className="text-neutral-400 hover:text-rose-600 p-1 shrink-0 tap"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
