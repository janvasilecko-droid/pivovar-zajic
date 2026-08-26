// 🎨 Vlastní ikony pivovaru ve stylu lucide.
// ---------------------------------------------------------------------------
// lucide nemá sud ani pivní lahev. Dosud se braly náhražky, které vypadaly
// jinak, než co znamenají: KEG měl `Cylinder` (obyčejný válec, spíš nádrž)
// a lahve `Wine` (sklenka na víno) — v textech k tomu ještě emoji 🍾, tedy
// lahev od šampusu. Tyhle ikony kreslí to, o co jde: sud s obručemi a
// naražečem a pivní lahev s korunkovým uzávěrem.
//
// Rozhraní je schválně stejné jako u lucide (size, strokeWidth, className,
// currentColor), aby šly dosadit kamkoli místo lucide ikony — včetně NAV
// v Layout.tsx a dlaždic na Domů, takže se vzhled nerozejde.
import { forwardRef, type SVGProps, type ReactNode } from 'react';

export type IkonaProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

// forwardRef, aby šly ikony dosadit všude, kde se čeká lucide ikona
// (NavItem.icon je typovaný jako LucideIcon = ForwardRefExoticComponent).
const Zaklad = forwardRef<SVGSVGElement, IkonaProps & { children: ReactNode }>(
  function Zaklad({ size = 24, strokeWidth = 2, children, ...rest }, ref) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
});

/** 🛢️ KEG sud — vypouklé tělo, dvě obruče a naražeč nahoře. */
export const IkonaSud = forwardRef<SVGSVGElement, IkonaProps>(function IkonaSud(props, ref) {
  return (
    <Zaklad ref={ref} {...props}>
      {/* naražeč */}
      <path d="M10.5 2h3v2h-3z" />
      {/* tělo sudu — nahoře i dole užší, uprostřed vypouklé */}
      <path d="M8 4h8c1 2.5 1.5 5 1.5 8s-.5 5.5-1.5 8H8c-1-2.5-1.5-5-1.5-8S7 6.5 8 4Z" />
      {/* obruče */}
      <path d="M6.8 9.5h10.4M6.8 14.5h10.4" />
    </Zaklad>
  );
});

/** 🍺 Pivní lahev — krátké hrdlo, korunkový uzávěr, etiketa. */
export const IkonaLahev = forwardRef<SVGSVGElement, IkonaProps>(function IkonaLahev(props, ref) {
  return (
    <Zaklad ref={ref} {...props}>
      {/* korunkový uzávěr */}
      <path d="M10 2h4v2h-4z" />
      {/* hrdlo a ramena přecházející do těla */}
      <path d="M10 4v2.5c0 1.2-2 2.3-2 4.5v9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-9c0-2.2-2-3.3-2-4.5V4" />
      {/* etiketa */}
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </Zaklad>
  );
});

/** PET lahev — vyšší, s vroubkovaným tělem a šroubovacím uzávěrem. */
export const IkonaPet = forwardRef<SVGSVGElement, IkonaProps>(function IkonaPet(props, ref) {
  return (
    <Zaklad ref={ref} {...props}>
      <path d="M9.5 2h5v1.5h-5z" />
      <path d="M10 3.5v2C10 7 8.5 7.6 8.5 9.5V20a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V9.5C15.5 7.6 14 7 14 5.5v-2" />
      <path d="M8.7 11.5h6.6M8.7 14.5h6.6" />
    </Zaklad>
  );
});

/** 🚰 Výčep — kohout s pákou. */
export const IkonaVycep = forwardRef<SVGSVGElement, IkonaProps>(function IkonaVycep(props, ref) {
  return (
    <Zaklad ref={ref} {...props}>
      <path d="M6 4h6a3 3 0 0 1 3 3v3" />
      <path d="M12 2v4" />
      <path d="M15 10h-3v3" />
      <path d="M9 17h6v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
      <path d="M12 13v4" />
    </Zaklad>
  );
});
