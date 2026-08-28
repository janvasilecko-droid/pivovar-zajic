import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Place } from '../lib/supabase';
import { getOrCreatePlace } from '../lib/orderParser';

/**
 * Combobox pro výběr / zadání odběratele.
 * - Napovídá existující odběratele (autocomplete)
 * - Umožňuje napsat nový název — při uložení se vytvoří záznam v `places`
 * - Hlídá duplicity (case-insensitive, bez diakritiky)
 * - Rozbalovací menu zůstává otevřené, dokud uživatel nevybere nebo neuloží
 */
export function PlaceCombobox({ value, onChange, places, onPlacesChanged, placeholder = 'Napiš nebo vyber odběratele…' }: {
  value: string;
  onChange: (placeId: string, placeName: string) => void;
  places: Place[];
  onPlacesChanged?: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = places.find((x) => x.id === value || x.name === value);
    setText(p?.name ?? value ?? '');
  }, [value, places]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const matches = useMemo(() => {
    const q = norm(text);
    if (!q) return places.slice(0, 8);
    return places.filter((p) => norm(p.name).includes(q)).slice(0, 8);
  }, [text, places]);

  const exactDup = useMemo(() => {
    const q = norm(text);
    return q ? places.find((p) => norm(p.name) === q) : undefined;
  }, [text, places]);

  const isNew = text.trim().length > 0 && !exactDup;

  function pick(p: Place) {
    onChange(p.id, p.name);
    setText(p.name);
    setOpen(false);
    setMsg(null);
  }

  async function ensurePlace(): Promise<Place | null> {
    const name = text.trim();
    if (!name) return null;
    setCreating(true);
    setMsg(null);
    try {
      const place = await getOrCreatePlace(name, places);
      setCreating(false);
      if (!place) {
        setMsg({ type: 'err', text: `❌ Nepodařilo se uložit ani vyhledat odběratele.` });
        return null;
      }
      onPlacesChanged?.();
      onChange(place.id, place.name);
      setText(place.name);
      setOpen(false);
      setMsg({ type: 'ok', text: `✓ Odběratel „${place.name}“ byl uložen.` });
      return place;
    } catch (err: any) {
      setCreating(false);
      setMsg({ type: 'err', text: `❌ Chyba při ukládání: ${err?.message ?? String(err)}` });
      return null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) setOpen(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (isNew && active === matches.length) {
        ensurePlace();
      } else if (matches[active] && norm(text) !== norm(matches[active].name)) {
        pick(matches[active]);
      } else if (isNew) {
        ensurePlace();
      }
    } else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); setMsg(null); onChange('', e.target.value); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {creating && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400">vytváření…</div>}

      {open && (matches.length > 0 || isNew) && (
        <div className="absolute z-20 left-0 right-0 mt-1 card !p-0 max-h-64 overflow-auto scrollbar-thin animate-fade-in">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${i === active ? 'bg-primary-50' : 'hover:bg-primary-50/50'}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
            >
              <span className="text-primary-800">{p.name}</span>
              {exactDup && exactDup.id === p.id && <span className="chip bg-amber-100 text-amber-700 text-[11px]">existuje</span>}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-t border-primary-100 transition-colors ${matches.length === active ? 'bg-primary-50' : 'hover:bg-primary-50/50'}`}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => ensurePlace()}
            >
              <span className="text-emerald-600 font-bold">+ Uložit nového odběratele:</span>
              <span className="text-primary-800 font-medium">{text.trim()}</span>
            </button>
          )}
        </div>
      )}

      {isNew && (
        <button
          type="button"
          className="mt-1.5 w-full px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-sm flex items-center justify-center gap-1.5"
          onClick={() => ensurePlace()}
          disabled={creating}
        >
          {creating ? 'Ukládám…' : `+ Uložit nového odběratele „${text.trim()}“`}
        </button>
      )}

      {exactDup && (
        <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
          <span><AlertTriangle className="ikona-text" /></span> Odběratel „{exactDup.name}“ už existuje — bude použit stávající záznam.
        </div>
      )}

      {msg && (
        <div className={`text-[11px] mt-1 font-semibold ${msg.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
