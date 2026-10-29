// 🌙 Navigace obloukem pod palcem (29. 10. 2026).
// ---------------------------------------------------------------------------
// Majitel nakreslil lištu jako oblouk od pravého okraje dolů ke středu — po
// dráze palce pravé ruky. Domů je kulaté tlačítko v pravém dolním rohu a je
// tam POŘÁD („domů tam bude furt"); ostatní položky se rozvinou po oblouku
// tlačítkem Menu a po výběru se samy sbalí. Pro leváka zrcadlově v levém
// rohu. Jedna z voleb v Nastavení → Poloha navigační lišty (lib/polohaDoku.ts).
//
// Položky jsou v JEDNÉ řadě a oblouk se dá prstem točit jako kolečko
// (29. 10. 2026: „udělej to na jeden řádek a bude se moct točit") — co se
// do čtvrtkruhu nevejde, se dotočí tahem.
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Home, Menu, type LucideIcon } from 'lucide-react';

export type PolozkaOblouku = {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Barva ikony a popisku (čitelná na podkladu lišty). */
  barva: string;
  aktivni: boolean;
  /** Číslo v kolečku (např. čekající objednávky z WhatsAppu). */
  odznak?: number;
};

/** Poloměr oblouku a rozestup položek ve stupních. */
export const POLOMER = 150;
export const KROK = 30;

/** Úhel položky (180° = vlevo od Domů, 90° = nad ním) při natočení `otoceni`. */
export function uhelPolozky(i: number, otoceni: number): number {
  return 180 - i * KROK + otoceni;
}

/** O kolik stupňů se dá oblouk nejvýš otočit, aby se dalo dojet na poslední položku. */
export function maxOtoceni(pocet: number): number {
  return Math.max(0, (pocet - 1) * KROK - 90);
}

/** Je položka v viditelném čtvrtkruhu (s malou rezervou na krajích)? */
export function jeVidet(uhel: number): boolean {
  return uhel >= 84 && uhel <= 186;
}

const STRED = 46; // střed Domů od rohu (px)
const POLOVINA = 30; // polovina tlačítka položky

export function ObloukNavigace({
  polozky,
  domuAktivni,
  barvaDomu,
  onVyber,
  onDomu,
  levak = false,
}: {
  polozky: PolozkaOblouku[];
  domuAktivni: boolean;
  barvaDomu: string;
  onVyber: (id: string) => void;
  onDomu: () => void;
  levak?: boolean;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const [otoceni, setOtoceni] = useState(0);
  const tah = useRef<{ uhel: number; otoceni: number; posun: number } | null>(null);
  const strana = levak ? 'left' : 'right';
  const max = maxOtoceni(polozky.length);

  // Úhel prstu kolem středu Domů (180° = vlevo, 90° = nahoru).
  const uhelPrstu = (e: ReactPointerEvent) => {
    const dx = levak ? e.clientX - STRED : window.innerWidth - e.clientX - STRED;
    const dy = window.innerHeight - e.clientY - STRED;
    return (Math.atan2(dy, -dx) * 180) / Math.PI;
  };
  const zacniTah = (e: ReactPointerEvent) => {
    tah.current = { uhel: uhelPrstu(e), otoceni, posun: 0 };
  };
  const tahni = (e: ReactPointerEvent) => {
    if (!tah.current) return;
    const d = tah.current.uhel - uhelPrstu(e);
    tah.current.posun = Math.max(tah.current.posun, Math.abs(d));
    setOtoceni(Math.min(max, Math.max(0, tah.current.otoceni + d)));
  };
  const ukonciTah = () => { setTimeout(() => { tah.current = null; }, 0); };
  /** Klepnutí po tahu se nepočítá jako výběr položky. */
  const bylTah = () => (tah.current?.posun ?? 0) > 4;
  const odRohu = (px: number, osa: 'x' | 'y') =>
    `calc(${px}px + env(safe-area-inset-${osa === 'x' ? strana : 'bottom'}, 0px))`;

  return (
    <>
      {otevreno && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setOtevreno(false)} aria-hidden="true" />}
      <div
        className={`hs-glass-chrome fixed z-30 rounded-full shadow-2xl border transition-[opacity,transform] duration-200 touch-none ${otevreno ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
        style={{ width: 2 * (POLOMER + 50), height: 2 * (POLOMER + 50), bottom: STRED - POLOMER - 50, [strana]: STRED - POLOMER - 50, transformOrigin: 'center' } as CSSProperties}
        onPointerDown={zacniTah}
        onPointerMove={tahni}
        onPointerUp={ukonciTah}
        onPointerCancel={ukonciTah}
        aria-hidden="true"
      />
      <nav aria-label="Hlavní navigace" className="contents">
        {polozky.map((p, i) => {
          const uhel = uhelPolozky(i, otoceni);
          const vidno = otevreno && jeVidet(uhel);
          const rad = (uhel * Math.PI) / 180;
          const x = STRED - POLOMER * Math.cos(rad) - POLOVINA; // od kraje (cos je záporný → dál od kraje)
          const y = STRED + POLOMER * Math.sin(rad) - POLOVINA;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (bylTah()) return; setOtevreno(false); onVyber(p.id); }}
              onPointerDown={zacniTah}
              onPointerMove={tahni}
              onPointerUp={ukonciTah}
              aria-current={p.aktivni ? 'page' : undefined}
              tabIndex={vidno ? 0 : -1}
              aria-hidden={!vidno}
              className={`fixed z-40 w-[60px] h-[60px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold transition-all duration-200 touch-none ${vidno ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'} ${p.aktivni ? 'shadow-md' : ''}`}
              style={{
                [strana]: odRohu(otevreno ? x : STRED - POLOVINA, 'x'),
                bottom: odRohu(otevreno ? y : STRED - POLOVINA, 'y'),

                ...(p.aktivni ? { background: p.barva, color: '#fff' } : { color: p.barva }),
              } as CSSProperties}
            >
              <span className="relative">
                <p.Icon size={22} strokeWidth={2.2} />
                {!!p.odznak && p.odznak > 0 && (
                  <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[11px] font-black rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">
                    {p.odznak > 9 ? '9+' : p.odznak}
                  </span>
                )}
              </span>
              <span className="text-[11px] leading-tight text-center whitespace-nowrap">{p.label}</span>
            </button>
          );
        })}
        {!otevreno && (
          <button
            type="button"
            onClick={() => setOtevreno(true)}
            aria-expanded={otevreno}
            className="hs-glass-chrome fixed z-40 h-12 px-4 rounded-full border shadow-lg flex items-center gap-1.5 font-black text-sm text-neutral-800 dark:text-neutral-100"
            style={{ [strana]: odRohu(88, 'x'), bottom: odRohu(22, 'y') } as CSSProperties}
          >
            <Menu size={18} /> Menu
          </button>
        )}
        <button
          type="button"
          onClick={() => { setOtevreno(false); onDomu(); }}
          aria-current={domuAktivni ? 'page' : undefined}
          className="fixed z-40 w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-black text-xs text-white shadow-xl active:scale-95 transition"
          style={{ [strana]: odRohu(STRED - 36, 'x'), bottom: odRohu(STRED - 36, 'y'), background: barvaDomu } as CSSProperties}
        >
          <Home size={26} strokeWidth={2.4} />
          Domů
        </button>
      </nav>
    </>
  );
}
