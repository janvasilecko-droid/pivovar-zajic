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
//
// Dvě podoby: TRVALÝ úzký pruh, který je pořád vidět („zkus udělat ten pruh
// menší, permanentní a otáčející"), a schovaný oblouk za tlačítkem Menu.
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

/** Rozestup položek na oblouku ve stupních. */
export const KROK = 30;

/** Rozměry: trvalý pruh je menší, ať zakrývá co nejmíň obsahu. */
export function rozmery(trvaly: boolean) {
  return trvaly
    ? { polomer: 104, polozka: 50, domu: 60, stred: 38, pruh: 58 }
    : { polomer: 150, polozka: 60, domu: 72, stred: 46, pruh: 100 };
}

/** Úhel položky (180° = vlevo od Domů, 90° = nad ním) při natočení `otoceni`. */
export function uhelPolozky(i: number, otoceni: number): number {
  return 180 - i * KROK + otoceni;
}

/** O kolik stupňů se dá oblouk nejvýš otočit, aby se dalo dojet na poslední položku. */
export function maxOtoceni(pocet: number): number {
  return Math.max(0, (pocet - 1) * KROK - 90);
}

/** Je položka ve viditelném čtvrtkruhu (s malou rezervou na krajích)? */
export function jeVidet(uhel: number): boolean {
  return uhel >= 84 && uhel <= 186;
}

export function ObloukNavigace({
  polozky,
  domuAktivni,
  barvaDomu,
  onVyber,
  onDomu,
  levak = false,
  trvaly = false,
}: {
  polozky: PolozkaOblouku[];
  domuAktivni: boolean;
  barvaDomu: string;
  onVyber: (id: string) => void;
  onDomu: () => void;
  levak?: boolean;
  /** Pruh je pořád vidět (bez tlačítka Menu). */
  trvaly?: boolean;
}) {
  const [rozbaleno, setRozbaleno] = useState(false);
  const otevreno = trvaly || rozbaleno;
  const [otoceni, setOtoceni] = useState(0);
  const tah = useRef<{ uhel: number; otoceni: number; posun: number } | null>(null);
  const strana = levak ? 'left' : 'right';
  const max = maxOtoceni(polozky.length);
  const { polomer, polozka, domu, stred, pruh } = rozmery(trvaly);
  const pul = polozka / 2;

  // Úhel prstu kolem středu Domů (180° = vlevo, 90° = nahoru).
  const uhelPrstu = (e: ReactPointerEvent) => {
    const dx = levak ? e.clientX - stred : window.innerWidth - e.clientX - stred;
    const dy = window.innerHeight - e.clientY - stred;
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
  const tahy = { onPointerDown: zacniTah, onPointerMove: tahni, onPointerUp: ukonciTah, onPointerCancel: ukonciTah };
  // Pruh = mezikruží pod položkami. Uvnitř a vně je průhledný a klepnutí
  // propouští (pointer-events-none); táhnout se dá za položky.
  const vnejsi = polomer + pruh / 2;

  return (
    <>
      {rozbaleno && !trvaly && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setRozbaleno(false)} aria-hidden="true" />}
      <div
        className={`fixed z-30 rounded-full pointer-events-none transition-[opacity,transform] duration-200 ${otevreno ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        style={{
          width: 2 * vnejsi, height: 2 * vnejsi, bottom: stred - vnejsi, [strana]: stred - vnejsi,
          border: `${pruh}px solid var(--pruh-oblouku, rgba(255,255,255,0.92))`,
          boxShadow: '0 0 24px rgba(0,0,0,0.18)',
        } as CSSProperties}
        aria-hidden="true"
      />
      <nav aria-label="Hlavní navigace" className="contents">
        {polozky.map((p, i) => {
          const uhel = uhelPolozky(i, otoceni);
          const vidno = otevreno && jeVidet(uhel);
          const rad = (uhel * Math.PI) / 180;
          const x = stred - polomer * Math.cos(rad) - pul; // od kraje (cos je záporný → dál od kraje)
          const y = stred + polomer * Math.sin(rad) - pul;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (bylTah()) return; setRozbaleno(false); onVyber(p.id); }}
              {...tahy}
              aria-current={p.aktivni ? 'page' : undefined}
              tabIndex={vidno ? 0 : -1}
              aria-hidden={!vidno}
              className={`fixed z-40 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold transition-[opacity,transform] duration-200 touch-none ${vidno ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'} ${p.aktivni ? 'shadow-md' : ''}`}
              style={{
                width: polozka, height: polozka,
                [strana]: odRohu(otevreno ? x : stred - pul, 'x'),
                bottom: odRohu(otevreno ? y : stred - pul, 'y'),
                ...(p.aktivni ? { background: p.barva, color: '#fff' } : { color: p.barva }),
              } as CSSProperties}
            >
              <span className="relative">
                <p.Icon size={trvaly ? 20 : 22} strokeWidth={2.2} />
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
            onClick={() => { setOtoceni(0); setRozbaleno(true); }}
            aria-expanded={otevreno}
            className="hs-glass-chrome fixed z-40 h-12 px-4 rounded-full border shadow-lg flex items-center gap-1.5 font-black text-sm text-neutral-800 dark:text-neutral-100"
            style={{ [strana]: odRohu(88, 'x'), bottom: odRohu(22, 'y') } as CSSProperties}
          >
            <Menu size={18} /> Menu
          </button>
        )}
        <button
          type="button"
          onClick={() => { setRozbaleno(false); onDomu(); }}
          aria-current={domuAktivni ? 'page' : undefined}
          className="fixed z-40 rounded-full flex flex-col items-center justify-center font-black text-xs text-white shadow-xl active:scale-95 transition"
          style={{ width: domu, height: domu, [strana]: odRohu(stred - domu / 2, 'x'), bottom: odRohu(stred - domu / 2, 'y'), background: barvaDomu } as CSSProperties}
        >
          <Home size={trvaly ? 22 : 26} strokeWidth={2.4} />
          Domů
        </button>
      </nav>
    </>
  );
}
