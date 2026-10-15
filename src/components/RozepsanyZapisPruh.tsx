// 💾 Pruh „obnoven rozepsaný zápis" — nad formulářem stáčení a výdeje.
// ---------------------------------------------------------------------------
// Rozepsané řádky se ukládají do telefonu (lib/rozepsanyZapis.ts) a při
// dalším otevření se vrátí. Pruh to řekne nahlas — jinak by člověk nevěděl,
// proč jsou ve formuláři řádky, které nezadal před chvílí — a dá možnost je
// zahodit. Zahodit se ptá: ztratit rozepsanou práci je přesně to, co se nemá
// stát omylem.
import { Save, Trash2 } from 'lucide-react';
import { potvrd } from '../lib/toast';

/** „15. 10. 13:05" — v pražském čase, ať nezáleží na nastavení zařízení. */
export function casUlozeni(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(/\s+/g, ' ').replace(', ', ' ');
}

export default function RozepsanyZapisPruh({
  obnoveno,
  onZahodit,
  className = '',
}: {
  /** `null` = nic se neobnovilo, pruh se nevykreslí. */
  obnoveno: { ulozeno: string | null } | null;
  /** Vyprázdní formulář (uložený koncept se tím smaže sám). */
  onZahodit: () => void;
  className?: string;
}) {
  if (!obnoveno) return null;
  const kdy = casUlozeni(obnoveno.ulozeno);

  async function zahodit() {
    const ok = await potvrd(
      'Zahodit rozepsaný zápis?\n\nSmažou se řádky, které jsi zadal a ještě neuložil. Nic z uloženého v databázi se nemění.',
      { titulek: 'Zahodit rozepsané', potvrdit: 'Zahodit' },
    );
    if (ok) onZahodit();
  }

  return (
    <div
      role="status"
      data-testid="rozepsany-zapis-pruh"
      className={`rounded border-2 border-sky-300 bg-sky-50 text-sky-950 p-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}
    >
      <Save size={20} className="shrink-0" aria-hidden />
      <div className="flex-1 min-w-[12rem] text-sm font-bold">
        Rozepsaný zápis{kdy ? ` z ${kdy}` : ''} je zpátky.
        <div className="text-xs font-semibold mt-0.5">
          Ještě není uložený do databáze. Zůstane tu, dokud ho neuložíš nebo nezahodíš.
        </div>
      </div>
      <button type="button" onClick={() => void zahodit()} className="btn-ghost btn-sm">
        <Trash2 size={14} aria-hidden /> Zahodit
      </button>
    </div>
  );
}
