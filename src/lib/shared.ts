export type DayValue = 'po' | 'ut' | 'st' | 'ct' | 'pa' | 'so' | 'ne';

export type DayOption = { v: DayValue; label: string };

export const DAYS: DayOption[] = [
  { v: 'po', label: 'Po' },
  { v: 'ut', label: 'Út' },
  { v: 'st', label: 'St' },
  { v: 'ct', label: 'Čt' },
  { v: 'pa', label: 'Pá' },
  { v: 'so', label: 'So' },
  { v: 'ne', label: 'Ne' },
];
