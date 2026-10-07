// 🎨 Barvy spodní lišty podle dlaždic na ploše.
// ---------------------------------------------------------------------------
// Z provozu 7. 10. 2026: „v tom panelu Domů, Obj, Obj nové zkus nadělat ty
// ikony a nápisy barvou, jakou má dlaždice, ať je to trochu výraznější" a
// „ať jde líp vidět, když je ta strana aktuální — to bílé podbarvení nejde
// vidět". Lišta je bílé sklo (HomeScreen.css .hs-glass-chrome), takže bílé
// podbarvení aktivní položky na ní splývalo.
//
// Neaktivní položka: ikona a nápis v barvě dlaždice, jen ztmavené (v tmavém
// režimu zesvětlené) tak, aby se daly přečíst — žlutá dlaždice by na bílé
// liště jinak zmizela. Aktivní položka: vyplněná plnou barvou dlaždice
// s bílým nebo tmavým písmem podle toho, co je na ní čitelnější.

type Rgb = [number, number, number];

/** Podklad lišty ve světlém a tmavém režimu (HomeScreen.css .hs-glass-chrome). */
export const PODKLAD_SVETLY = '#ffffff';
export const PODKLAD_TMAVY = '#0f172a';
const PISMO_TMAVE = '#111827';
/** Malý nápis potřebuje aspoň 4,5 : 1 (WCAG AA). */
const MIN_KONTRAST = 4.5;

function naRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const naHex = (c: Rgb) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function jas([r, g, b]: Rgb): number {
  const k = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}

export function kontrast(a: string, b: string): number {
  const ra = naRgb(a), rb = naRgb(b);
  if (!ra || !rb) return 1;
  const [x, y] = [jas(ra), jas(rb)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Barva dlaždice posunutá k černé (nebo bílé) jen o tolik, aby byla na podkladu čitelná. */
export function citelnaNaPodkladu(barva: string, podklad: string): string {
  const c = naRgb(barva);
  const p = naRgb(podklad);
  if (!c || !p) return podklad === PODKLAD_TMAVY ? '#e5e7eb' : '#374151';
  const cil: Rgb = jas(p) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = naHex(c.map((x, i) => x + (cil[i] - x) * t) as Rgb);
    if (kontrast(v, podklad) >= MIN_KONTRAST) return v;
  }
  return naHex(cil);
}

/** Písmo na plné barvě dlaždice: bílé, nebo tmavé — co je čitelnější. */
export function pismoNaBarve(barva: string): string {
  return kontrast('#ffffff', barva) >= kontrast(PISMO_TMAVE, barva) ? '#ffffff' : PISMO_TMAVE;
}
