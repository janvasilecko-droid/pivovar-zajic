// 🌙 Navigace obloukem pod palcem (29. 10. 2026).
// ---------------------------------------------------------------------------
// Majitel nakreslil lištu jako oblouk od pravého okraje dolů ke středu — po
// dráze palce pravé ruky. Domů je kulaté tlačítko v pravém dolním rohu a je
// tam POŘÁD („domů tam bude furt"); ostatní položky se rozvinou po oblouku
// tlačítkem Menu a po výběru se samy sbalí. Pro leváka zrcadlově v levém
// rohu. Jedna z voleb v Nastavení → Poloha navigační lišty (lib/polohaDoku.ts).
import { useState, type CSSProperties } from 'react';
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

/** Rozmístění na čtvrtkruh kolem rohu: první čtyři blíž, zbytek ve vnějším oblouku. */
export function poziceNaOblouku(pocet: number): { r: number; uhel: number }[] {
  const vnitrni = Math.min(pocet, 4);
  const vnejsi = pocet - vnitrni;
  const rozloz = (n: number, r: number) => Array.from({ length: n }, (_, i) => ({
    r,
    uhel: n === 1 ? 135 : 180 - (i * 90) / (n - 1),
  }));
  return [...rozloz(vnitrni, 112), ...rozloz(vnejsi, 196)];
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
  const strana = levak ? 'left' : 'right';
  const odRohu = (px: number, osa: 'x' | 'y') =>
    `calc(${px}px + env(safe-area-inset-${osa === 'x' ? strana : 'bottom'}, 0px))`;
  const pozice = poziceNaOblouku(polozky.length);

  return (
    <>
      {otevreno && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setOtevreno(false)} aria-hidden="true" />}
      <div
        className={`hs-glass-chrome fixed z-30 rounded-full shadow-2xl border transition-all duration-200 pointer-events-none ${otevreno ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        style={{ width: 520, height: 520, bottom: -260 + 46, [strana]: -260 + 46, transformOrigin: 'center' } as CSSProperties}
        aria-hidden="true"
      />
      <nav aria-label="Hlavní navigace" className="contents">
        {polozky.map((p, i) => {
          const { r, uhel } = pozice[i];
          const rad = (uhel * Math.PI) / 180;
          const x = STRED - r * Math.cos(rad) - POLOVINA; // od kraje (cos je záporný → dál od kraje)
          const y = STRED + r * Math.sin(rad) - POLOVINA;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { setOtevreno(false); onVyber(p.id); }}
              aria-current={p.aktivni ? 'page' : undefined}
              tabIndex={otevreno ? 0 : -1}
              aria-hidden={!otevreno}
              className={`fixed z-40 w-[60px] h-[60px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold transition-all duration-200 ${otevreno ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'} ${p.aktivni ? 'shadow-md' : ''}`}
              style={{
                [strana]: odRohu(otevreno ? x : STRED - POLOVINA, 'x'),
                bottom: odRohu(otevreno ? y : STRED - POLOVINA, 'y'),
                transitionDelay: otevreno ? `${i * 20}ms` : '0ms',
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
