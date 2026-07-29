export type DensityMode = 'xs' | 'compact' | 'normal' | 'large' | 'xl';

export const DENSITY_OPTIONS: { value: DensityMode; label: string; desc: string }[] = [
  { value: 'xs',      label: 'XS',    desc: 'Velmi husté' },
  { value: 'compact', label: 'S',     desc: 'Husté' },
  { value: 'normal',  label: 'M',     desc: 'Výchozí' },
  { value: 'large',   label: 'L',     desc: 'Větší' },
  { value: 'xl',      label: 'XL',    desc: 'Velmi velké' },
];

export function getDensity(): DensityMode {
  if (typeof window === 'undefined') return 'normal';
  const saved = localStorage.getItem('minipivovar_density');
  if (saved === 'xs' || saved === 'compact' || saved === 'normal' || saved === 'large' || saved === 'xl') return saved;
  return 'normal';
}

export function setDensity(mode: DensityMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('minipivovar_density', mode);
  document.documentElement.classList.remove('density-xs', 'density-compact', 'density-normal', 'density-large', 'density-xl');
  document.documentElement.classList.add(`density-${mode}`);
}

export function initDensity() {
  setDensity(getDensity());
}
