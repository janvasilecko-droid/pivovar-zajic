import { useState, useEffect, useMemo } from 'react';
import { Modal } from './ui';
import { Plus, Bell, BellRing, Check, Trash2, StickyNote, LayoutGrid, AlertTriangle, Users } from 'lucide-react';
import { getHomeNotes, addHomeNote, toggleHomeNote, toggleHomeNoteImportant, deleteHomeNote, clearCompletedNotes, HOME_NOTES_CHANGED_EVENT, type HomeNote } from '../lib/homeNotes';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/supabase';
import { chyba as chybaOznam, oznam } from '../lib/toast';
import { nactiSdilene, pridejSdilenou, prepniHotovo, prepniDulezite, smazSdilenou, SDILENE_POZNAMKY_ZMENA, type SdilenaPoznamka } from '../lib/sdilenePoznamky';
import { getHomeLayout, saveHomeLayout, addTile } from '../lib/homeLayout';
import { ReminderItem, acknowledgeReminder, createReminder, deleteReminder, fetchReminders } from '../lib/reminders';
import { isNotificationSupported, requestNotificationPermission } from '../lib/notifications';
import UpozorneniForm from './UpozorneniForm';
import UpozorneniPruh from './UpozorneniPruh';
import {
  NastaveniUpozorneni, nazevUpozorneni, prijemciZNastaveni, terminZNastaveni,
  upozorneniKPoznamce, vychoziNastaveni,
} from '../lib/upozorneniPoznamky';
import { polozkyDlazdice, type PolozkaDlazdice } from '../lib/dlazdicePoznamek';
import { NAV, EXTRA_NAV } from './Layout';

// 📝 JEDNY poznámky — jeden seznam, jedno okno.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „udělej jen jedny poznámky, a to ty na hlavní straně,
// ostatní vymaž, ale ať ty jedny mají všechny funkce těch 3."
//
// V appce bývaly TŘI: samostatná obrazovka Poznámky (tabulka `notes`, zrušená
// dřív), tenhle blok na ploše (OSOBNÍ, lib/homeNotes.ts) a vzkazy celé směně
// (SDÍLENÉ, lib/sdilenePoznamky.ts). Obrazovka je pryč. Osobní a sdílené
// zůstávají — jsou to dvě různé věci (moje vs. pro všechny, s jinými právy
// na odškrtnutí) a dvě tabulky v databázi — ale v OKNĚ se ukazují jako JEDEN
// seznam, ne jako dva oddělené bloky nad sebou. Pořadí je stejné jako na
// dlaždici (lib/dlazdicePoznamek.ts): vzkazy směně napřed jako skupina,
// uvnitř důležité napřed; sdílenost nese jen odznak a barevný pruh vlevo.
//
// Obě funkce mají teď STEJNÁ práva: upozornění, důležitost i smazání jdou
// nastavit na obou druzích poznámky — dřív šlo upozornění přidat jen
// k osobní, u sdíleného vzkazu ne.
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

  // 🔔 Upozornění k poznámkám — funguje na OBOU druzích (osobní i sdílené).
  const [upozorneni, setUpozorneni] = useState<ReminderItem[]>([]);
  const [chciUpozorneni, setChciUpozorneni] = useState(false);
  const [nastaveni, setNastaveni] = useState<NastaveniUpozorneni>(() => vychoziNastaveni());
  /** Klíč `o:<id>` (osobní) nebo `s:<id>` (sdílená) — pro kterou poznámku je
   *  právě otevřené nastavení upozornění. Prefix brání kolizi, kdyby si ID
   *  z lokálního úložiště a z databáze náhodou byla stejná. */
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

  /**
   * Upozornění, která k žádné poznámce nepatří — typicky ta starší, co vznikla
   * ještě na zrušené obrazovce „Upozornění". Bez tohohle seznamu by z aplikace
   * zmizela úplně, i když pořád platí a mají zazvonit.
   */
  const upozorneniBezPoznamky = useMemo(() => {
    const zabrane = new Set<string>();
    for (const n of notes) {
      const u = upozorneniKPoznamce({ title: null, body: n.text }, upozorneni);
      if (u) zabrane.add(u.id);
    }
    for (const v of sdilene) {
      const u = upozorneniKPoznamce({ title: null, body: v.text }, upozorneni);
      if (u) zabrane.add(u.id);
    }
    return upozorneni.filter((u) => !zabrane.has(u.id) && !u.is_completed);
  }, [notes, sdilene, upozorneni]);

  /** Upozornění, které k danému TEXTU visí — nebo null. Text je společný klíč
   *  bez ohledu na to, jestli jde o osobní, nebo sdílenou poznámku. */
  function upozorneniK(text: string): ReminderItem | null {
    return upozorneniKPoznamce({ title: null, body: text }, upozorneni);
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

  /** Připne dlaždici Poznámky na plochu, když tam ještě není. Platí pro obě
   *  přihrádky — je to jedna společná dlaždice (viz lib/dlazdicePoznamek.ts). */
  function pripniDlazdiciNaPlochu() {
    if (!pinToHome) return;
    const allNavIds = [...NAV.map((n) => n.id), ...EXTRA_NAV.map((n) => n.id)];
    const layout = getHomeLayout(profile?.home_layout, allNavIds, []);
    const isPinned = layout.pages.some((page) => page.includes('notes'));
    if (isPinned) return;
    const nextLayout = addTile(layout, 'notes', 0);
    patchProfile({ home_layout: nextLayout as any });
    if (user?.id) void saveHomeLayout(user.id, nextLayout);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    const text = newText;
    const chtelaUpozornit = chciUpozorneni;
    const nastaveniPriZapisu = nastaveni;

    setNewText('');
    setChciUpozorneni(false);
    setNastaveni(vychoziNastaveni());
    pripniDlazdiciNaPlochu();

    if (proVsechny) {
      // Vzkaz pro směnu se neukládá mezi moje osobní poznámky — jinak by ho
      // pisatel viděl dvakrát, jednou jako svůj a jednou jako společný.
      // Upozornění se ale zakládá STEJNĚ jako u osobní — jsou to teď dvě
      // rovnocenné poznámky, ne poznámka a její chudší sourozenec.
      void pridejSdilenou(text, jmeno).then(async (potiz) => {
        if (potiz) { chybaOznam('Vzkaz se nepodařilo odeslat: ' + potiz); return; }
        if (!chtelaUpozornit) { oznam('Vzkaz vidí celá směna.'); return; }
        const potizUpozorneni = await zalozUpozorneni(text, nastaveniPriZapisu);
        oznam(potizUpozorneni ? 'Vzkaz vidí celá směna (upozornění se nepodařilo: ' + potizUpozorneni + ').' : 'Vzkaz vidí celá směna, upozornění nastavené.');
      });
      return;
    }

    addHomeNote(text, undefined, selectedColor);
    // Upozornění až po poznámce: kdyby uložení poznámky selhalo, nesmí zbýt
    // připomínka na text, který nikde není.
    if (chtelaUpozornit) {
      void zalozUpozorneni(text, nastaveniPriZapisu).then((potiz) => {
        if (potiz) chybaOznam(potiz);
        else oznam('Poznámka uložená, upozornění nastavené.');
      });
    }
  }

  const COLOR_STYLES: Record<NonNullable<HomeNote['color']>, { bg: string; border: string; text: string; badge: string }> = {
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-950', badge: 'bg-amber-400' },
    blue: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-950', badge: 'bg-sky-400' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-950', badge: 'bg-emerald-400' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-950', badge: 'bg-rose-400' },
    amber: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-950', badge: 'bg-primary-400' },
  };

  // 📋 JEDEN seznam pro obě přihrádky — stejná funkce jako na dlaždici
  // (lib/dlazdicePoznamek.ts), ať se pořadí na obou místech neliší.
  const polozky = useMemo(() => polozkyDlazdice(notes, sdilene), [notes, sdilene]);
  const sdilenaById = useMemo(() => new Map(sdilene.map((p) => [p.id, p])), [sdilene]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const prvniHotovaIdx = polozky.findIndex((p) => p.hotovo);
  const aktivniPolozky = prvniHotovaIdx === -1 ? polozky : polozky.slice(0, prvniHotovaIdx);
  const hotovePolozky = prvniHotovaIdx === -1 ? [] : polozky.slice(prvniHotovaIdx);
  const jeOsobnichHotovych = notes.some((n) => n.completed);

  function prepniHotovost(p: PolozkaDlazdice) {
    if (p.sdilena) {
      const vzkaz = sdilenaById.get(p.id);
      if (vzkaz) void prepniHotovo(vzkaz, jmeno);
    } else {
      toggleHomeNote(p.id);
    }
  }

  function prepniDulezitost(p: PolozkaDlazdice) {
    if (p.sdilena) {
      const vzkaz = sdilenaById.get(p.id);
      if (vzkaz) void prepniDulezite(vzkaz);
    } else {
      toggleHomeNoteImportant(p.id);
    }
  }

  function smazPolozku(p: PolozkaDlazdice) {
    const maUpozorneni = upozorneniK(p.text);
    if (p.sdilena) void smazSdilenou(p.id);
    else deleteHomeNote(p.id);
    if (maUpozorneni) void zrusUpozorneni(maUpozorneni.id);
  }

  function radekPoznamky(p: PolozkaDlazdice) {
    const klic = `${p.sdilena ? 's' : 'o'}:${p.id}`;
    const vzkaz = p.sdilena ? sdilenaById.get(p.id) : undefined;
    const note = !p.sdilena ? noteById.get(p.id) : undefined;
    const maUpozorneni = upozorneniK(p.text);
    const style = note ? COLOR_STYLES[note.color || 'yellow'] : null;

    // Barva nese PŮVOD poznámky: důležitá je vždycky červená (nejsilnější
    // signál), sdílená modrá (a pruh vlevo, ať je „Směna" vidět i na první
    // pohled bez čtení odznaku), osobní podle zvolené barvičky.
    const barva = p.dulezite
      ? 'bg-rose-50 border-rose-300 text-rose-950'
      : p.sdilena
      ? 'bg-sky-50 border-sky-200 text-sky-950'
      : `${style?.bg ?? 'bg-amber-50'} ${style?.border ?? 'border-amber-200'} ${style?.text ?? 'text-amber-950'}`;

    return (
      <div
        key={klic}
        className={`rounded-xl border shadow-xs transition ${barva} ${p.sdilena ? 'border-l-4 border-l-sky-400' : ''} ${p.hotovo ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3 p-3">
          <button
            type="button"
            onClick={() => prepniHotovost(p)}
            className="mt-0.5 w-5 h-5 rounded-md border-2 border-neutral-400/80 bg-white/90 grid place-items-center shrink-0 hover:border-amber-600 transition tap"
            title={p.hotovo ? 'Vrátit jako nesplněné' : (p.sdilena ? 'Odškrtnout pro všechny' : 'Označit jako hotové')}
            aria-label={p.hotovo ? 'Vrátit jako nesplněné' : (p.sdilena ? 'Odškrtnout pro všechny' : 'Označit jako hotové')}
          >
            {p.hotovo && <Check size={14} className="text-emerald-700 font-bold" />}
          </button>
          <div className="flex-1 min-w-0">
            {p.sdilena && (
              <span className="inline-flex items-center gap-1 text-udaj font-black uppercase tracking-wider text-sky-700 mb-0.5">
                <Users size={11} /> Směna
              </span>
            )}
            <p className={`lze-vybrat text-sm font-semibold whitespace-pre-wrap leading-snug ${p.hotovo ? 'line-through' : ''}`}>
              {p.text}
            </p>
            {p.sdilena && (
              <div className="text-udaj text-neutral-500 font-medium mt-0.5">
                {vzkaz?.autor || 'Neznámý'}
                {p.hotovo && vzkaz?.hotovo_kdo ? ` · odškrtl ${vzkaz.hotovo_kdo}` : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => prepniDulezitost(p)}
            className={`tap p-1 shrink-0 transition rounded ${p.dulezite ? 'text-rose-600' : 'text-neutral-300 hover:text-rose-500'}`}
            title={p.dulezite ? 'Zrušit důležitost' : 'Označit jako důležité'}
            aria-label={p.dulezite ? 'Zrušit důležitost' : 'Označit jako důležité'}
          >
            <AlertTriangle size={16} className={p.dulezite ? 'fill-rose-200' : ''} />
          </button>
          {!p.hotovo && !maUpozorneni && (
            <button
              type="button"
              onClick={() => {
                setNastavujiProId(nastavujiProId === klic ? null : klic);
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
            onClick={() => smazPolozku(p)}
            className="text-neutral-400 hover:text-rose-600 p-1 shrink-0 transition tap"
            title={p.sdilena ? 'Smazat vzkaz pro všechny' : 'Smazat poznámku'}
            aria-label={p.sdilena ? 'Smazat vzkaz pro všechny' : 'Smazat poznámku'}
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
        {nastavujiProId === klic && !maUpozorneni && (
          <div className="px-3 pb-3 space-y-2">
            <div className="rounded-lg border border-amber-200 bg-white/80 p-2.5">
              <UpozorneniForm hodnota={nastaveniProPoznamku} zmen={setNastaveniProPoznamku} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const potiz = await zalozUpozorneni(p.text, nastaveniProPoznamku);
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
  }

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
          {/* 🔔 Upozornění — nepovinné, ale na VLASTNÍM ŘÁDKU hned pod textem.
              Funguje i pro vzkaz celé směně (zadání z 19. 9. 2026: „ať ty
              jedny mají všechny funkce těch 3"). */}
          <label className={`flex items-center gap-2 text-sm font-black cursor-pointer select-none px-2.5 py-2 rounded-lg border-2 transition ${
            chciUpozorneni ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-white border-neutral-200 text-neutral-700 hover:border-amber-300'
          }`}>
            <input
              type="checkbox"
              checked={chciUpozorneni}
              onChange={(e) => setChciUpozorneni(e.target.checked)}
              className="w-5 h-5 shrink-0 accent-amber-500"
            />
            <Bell size={16} className="text-amber-500 shrink-0" />
            <span>Upozornit</span>
            <span className="text-udaj font-bold text-neutral-400 truncate">— kdy, komu a kde</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Barva se týká jen OSOBNÍ poznámky — sdílený vzkaz barvu v
                databázi nemá, takže při „Poslat všem" nedává smysl. */}
            {!proVsechny && (
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
            )}
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

        {/* 📋 JEDEN seznam — osobní poznámky i vzkazy celé směně dohromady,
            ve stejném pořadí jako na dlaždici (lib/dlazdicePoznamek.ts).
            Sdílenost nese jen odznak „Směna" a modrý pruh vlevo u té
            konkrétní karty, ne samostatný blok nad seznamem. */}
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {polozky.length === 0 ? (
            <div className="text-center py-6 text-neutral-400 text-sm">
              <StickyNote size={32} className="mx-auto mb-2 opacity-40 text-neutral-500" />
              Žádné zapsané poznámky. Přidejte první vzkaz výše.
            </div>
          ) : (
            <>
              {aktivniPolozky.map(radekPoznamky)}

              {hotovePolozky.length > 0 && (
                <div className="pt-3 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="text-xs font-bold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
                    >
                      Hotové ({hotovePolozky.length})
                    </button>
                    {jeOsobnichHotovych && (
                      <button
                        type="button"
                        onClick={clearCompletedNotes}
                        className="text-xs font-semibold text-rose-600 hover:underline"
                        title="Smaže jen moje hotové poznámky, sdílené vzkazy nechá být"
                      >
                        Vyčistit hotové
                      </button>
                    )}
                  </div>
                  {showCompleted && (
                    <div className="space-y-1.5 opacity-75">
                      {hotovePolozky.map(radekPoznamky)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 🔔 Upozornění, která k žádné poznámce nepatří — starší, z doby, kdy
            měla vlastní obrazovku. Bez toho by z aplikace zmizela úplně. */}
        {upozorneniBezPoznamky.length > 0 && (
          <div className="pt-3 border-t border-neutral-200 space-y-2">
            <div className="flex items-center gap-1.5 text-udaj font-black uppercase tracking-wider text-amber-800">
              <Bell size={14} /> Upozornění bez poznámky ({upozorneniBezPoznamky.length})
            </div>
            {upozorneniBezPoznamky.map((u) => (
              <UpozorneniPruh
                key={u.id}
                upozorneni={u}
                jaEmail={user?.email || ''}
                odkliknout={(id) => void odkliknout(id)}
                smazat={(id) => void zrusUpozorneni(id)}
                samostatne
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
