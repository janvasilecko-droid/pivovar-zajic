import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isChecklistCompleteForDate, isStartChecklistCompleteForDate, isMonthlyChecklistCompleteForDate, DEFAULT_ITEMS, START_CATEGORY_PREFIX, MONTHLY_CATEGORY_PREFIX, MONTHLY_CATEGORY, getChecklistItemsForPhase, getWeekStartDate, isWeeklyItemDoneForWeek } from './BottlingChecklistModal';

// Checklist „Stáčecí den" se ukládá do localStorage jako bottling_checklist_<datum>.
const key = (dateKey: string) => 'bottling_checklist_' + dateKey;
const allChecked = () => Object.fromEntries(DEFAULT_ITEMS.map((it) => [it.id, true]));

describe('isChecklistCompleteForDate', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('není splněno, když pro dané datum není nic uloženo', () => {
    expect(isChecklistCompleteForDate('2026-08-10')).toBe(false);
  });

  it('není splněno, když je odškrtnuta jen část položek', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ start_1: true, start_2: true }));
    expect(isChecklistCompleteForDate('2026-08-10')).toBe(false);
  });

  it('je splněno, když jsou odškrtnuté všechny položky', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify(allChecked()));
    expect(isChecklistCompleteForDate('2026-08-10')).toBe(true);
  });

  it('platí jen pro dané datum — jiný den se nesplní', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify(allChecked()));
    expect(isChecklistCompleteForDate('2026-08-11')).toBe(false);
  });

  it('vrátí false při poškozeném JSON v localStorage', () => {
    localStorage.setItem(key('2026-08-10'), 'toto-neni-json');
    expect(isChecklistCompleteForDate('2026-08-10')).toBe(false);
  });
});

describe('isStartChecklistCompleteForDate (povinná brána pro vstup do zápisu stáčení)', () => {
  const startOnlyChecked = () =>
    Object.fromEntries(
      DEFAULT_ITEMS.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX)).map((it) => [it.id, true])
    );

  it('pokrývá přesně sekci „1. Začátek stáčení" (id start_*)', () => {
    const startIds = DEFAULT_ITEMS.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX)).map((it) => it.id);
    expect(startIds).toEqual(DEFAULT_ITEMS.filter((it) => it.id.startsWith('start_')).map((it) => it.id));
    expect(startIds.length).toBeGreaterThan(0);
  });

  it('není splněno, když není uloženo nic', () => {
    expect(isStartChecklistCompleteForDate('2026-08-10')).toBe(false);
  });

  it('není splněno, když je odškrtnuta jen část sekce „Začátek stáčení"', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ start_1: true }));
    expect(isStartChecklistCompleteForDate('2026-08-10')).toBe(false);
  });

  it('je splněno, když jsou odškrtnuté všechny položky „1. Začátek stáčení" i bez sekcí Konec/kontroly/údržba', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify(startOnlyChecked()));
    expect(isStartChecklistCompleteForDate('2026-08-10')).toBe(true);
  });

  it('je splněno, když je splněno úplně vše', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify(allChecked()));
    expect(isStartChecklistCompleteForDate('2026-08-10')).toBe(true);
  });

  it('platí jen pro dané datum — jiný den zůstává nesplněný', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify(startOnlyChecked()));
    expect(isStartChecklistCompleteForDate('2026-08-11')).toBe(false);
  });

  it('vrátí false při poškozeném JSON v localStorage', () => {
    localStorage.setItem(key('2026-08-10'), 'toto-neni-json');
    expect(isStartChecklistCompleteForDate('2026-08-10')).toBe(false);
  });
});


describe('getChecklistItemsForPhase („nech jen tohle, zbytek až na konci")', () => {
  it("fáze 'start' vrací jen sekci „1. Začátek stáčení\" (id start_*)", () => {
    const startItems = getChecklistItemsForPhase('start');
    expect(startItems.length).toBeGreaterThan(0);
    expect(startItems.every((it) => it.id.startsWith('start_'))).toBe(true);
    expect(startItems.every((it) => it.category.startsWith(START_CATEGORY_PREFIX))).toBe(true);
  });

  it("fáze 'end' vrací zbytek (end_*, week_*, month_*) a neobsahuje start_*", () => {
    const endItems = getChecklistItemsForPhase('end');
    expect(endItems.length).toBeGreaterThan(0);
    expect(endItems.some((it) => it.id.startsWith('end_'))).toBe(true);
    expect(endItems.some((it) => it.id.startsWith('week_'))).toBe(true);
    expect(endItems.some((it) => it.id.startsWith('month_'))).toBe(true);
    expect(endItems.some((it) => it.id.startsWith('start_'))).toBe(false);
  });

  it('start + end = kompletní DEFAULT_ITEMS (nic nechybí, nic navíc)', () => {
    const combined = [...getChecklistItemsForPhase('start'), ...getChecklistItemsForPhase('end')]
      .map((it) => it.id)
      .sort();
    expect(combined).toEqual(DEFAULT_ITEMS.map((it) => it.id).sort());
  });
});


describe('týdenní položka start_2 (čištění stáčeček studeným louhem 2%)', () => {
  const WEEKLY_ID = 'start_2';

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('start_2 je označená weekly: true a má text se 2% louhem a „na kterých se bude stáčet\"', () => {
    const item = DEFAULT_ITEMS.find((it) => it.id === WEEKLY_ID);
    expect(item?.weekly).toBe(true);
    expect(item?.text).toContain('studeným louhem o koncentraci 2%');
    expect(item?.text).toContain('na kterých se bude stáčet');
  });

  it('getWeekStartDate vrací pondělí aktuálního ISO týdne', () => {
    expect(getWeekStartDate('2026-08-10')).toBe('2026-08-10'); // pondělí
    expect(getWeekStartDate('2026-08-14')).toBe('2026-08-10'); // pátek téhož týdne
    expect(getWeekStartDate('2026-08-16')).toBe('2026-08-10'); // neděle téhož týdne
    expect(getWeekStartDate('2026-08-17')).toBe('2026-08-17'); // další pondělí
  });

  it('isWeeklyItemDoneForWeek — splněno v dřívější den téhož týdne → true', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ [WEEKLY_ID]: true }));
    expect(isWeeklyItemDoneForWeek('2026-08-12', WEEKLY_ID)).toBe(true);
  });

  it('isWeeklyItemDoneForWeek — splněno v JINÉM týdnu → false', () => {
    localStorage.setItem(key('2026-08-03'), JSON.stringify({ [WEEKLY_ID]: true }));
    expect(isWeeklyItemDoneForWeek('2026-08-10', WEEKLY_ID)).toBe(false);
  });

  it('isWeeklyItemDoneForWeek — nikde nesplněno → false', () => {
    expect(isWeeklyItemDoneForWeek('2026-08-12', WEEKLY_ID)).toBe(false);
  });

  it("fáze 'start' s dateKey skrývá start_2, když už je tento týden splněná (2. stáčení v týdnu)", () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ [WEEKLY_ID]: true }));
    const startItems = getChecklistItemsForPhase('start', '2026-08-12');
    expect(startItems.some((it) => it.id === WEEKLY_ID)).toBe(false);
  });

  it("fáze 'start' bez splnění tento týden start_2 stále obsahuje", () => {
    const startItems = getChecklistItemsForPhase('start', '2026-08-12');
    expect(startItems.some((it) => it.id === WEEKLY_ID)).toBe(true);
  });

  it('isStartChecklistCompleteForDate — start_2 nesplněno dnes, ale dříve v týdnu → brána splněna (nepřekáží)', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ [WEEKLY_ID]: true }));
    const otherStart = Object.fromEntries(
      DEFAULT_ITEMS
        .filter((it) => it.category.startsWith(START_CATEGORY_PREFIX) && it.id !== WEEKLY_ID)
        .map((it) => [it.id, true])
    );
    localStorage.setItem(key('2026-08-12'), JSON.stringify(otherStart));
    expect(isStartChecklistCompleteForDate('2026-08-12')).toBe(true);
  });

  it('isStartChecklistCompleteForDate — start_2 není splněno tento týden → brána nesplněna', () => {
    const otherStart = Object.fromEntries(
      DEFAULT_ITEMS
        .filter((it) => it.category.startsWith(START_CATEGORY_PREFIX) && it.id !== WEEKLY_ID)
        .map((it) => [it.id, true])
    );
    localStorage.setItem(key('2026-08-12'), JSON.stringify(otherStart));
    expect(isStartChecklistCompleteForDate('2026-08-12')).toBe(false);
  });

  it('isChecklistCompleteForDate — chybějící start_2 v dnešním dni je prominuto, když je splněno dřív v týdnu', () => {
    localStorage.setItem(key('2026-08-10'), JSON.stringify({ [WEEKLY_ID]: true }));
    const todayWithoutWeekly = Object.fromEntries(
      DEFAULT_ITEMS.filter((it) => it.id !== WEEKLY_ID).map((it) => [it.id, true])
    );
    localStorage.setItem(key('2026-08-12'), JSON.stringify(todayWithoutWeekly));
    expect(isChecklistCompleteForDate('2026-08-12')).toBe(true);
  });
});

describe('isMonthlyChecklistCompleteForDate a fáze „monthly" (okno s měsíčním checklistem)', () => {
  const monthlyOnlyChecked = () =>
    Object.fromEntries(
      DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX)).map((it) => [it.id, true])
    );

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('pokrývá přesně sekci „4. Měsíční údržba" (id month_*)', () => {
    const monthIds = DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX)).map((it) => it.id);
    expect(monthIds).toEqual(DEFAULT_ITEMS.filter((it) => it.id.startsWith('month_')).map((it) => it.id));
    expect(monthIds.length).toBeGreaterThan(0);
  });

  it('obsahuje novou položku o proplachu cest louhem do nejbližšího stáčení', () => {
    const item = DEFAULT_ITEMS.find((it) => it.id === 'month_11');
    expect(item?.category).toBe(MONTHLY_CATEGORY);
    expect(item?.text).toContain('veškeré cesty, včetně odtokové na pivo');
    expect(item?.text).toContain('nevyčerpat louh ze sudu všechen');
    expect(item?.text).toContain('nechat do nejbližšího stáčení na stáčečky na louhu');
  });

  it('není splněno, když není uloženo nic', () => {
    expect(isMonthlyChecklistCompleteForDate('2026-08-25')).toBe(false);
  });

  it('není splněno, když je odškrtnuta jen část sekce „4. Měsíční údržba"', () => {
    localStorage.setItem(key('2026-08-25'), JSON.stringify({ month_1: true }));
    expect(isMonthlyChecklistCompleteForDate('2026-08-25')).toBe(false);
  });

  it('je splněno, když jsou odškrtnuté všechny položky „4. Měsíční údržba" i bez ostatních sekcí', () => {
    localStorage.setItem(key('2026-08-25'), JSON.stringify(monthlyOnlyChecked()));
    expect(isMonthlyChecklistCompleteForDate('2026-08-25')).toBe(true);
    expect(isStartChecklistCompleteForDate('2026-08-25')).toBe(false);
  });

  it("fáze 'monthly' vrací jen položky sekce „4. Měsíční údržba\" (11 položek)", () => {
    const monthlyItems = getChecklistItemsForPhase('monthly', '2026-08-25');
    expect(monthlyItems.length).toBe(11);
    expect(monthlyItems.every((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))).toBe(true);
  });
});
