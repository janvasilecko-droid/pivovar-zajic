import { describe, expect, it } from 'vitest';
import { popisRozdeleni, rozdelSudyDoTanku, zmenaOtevreni, type TankProRozdeleni } from './tankRozdeleni';

const PIVO = 'b-12sv';
const t = (over: Partial<TankProRozdeleni> & { label: string }): TankProRozdeleni => ({
  id: over.label,
  current_beer_id: PIVO,
  current_volume_l: 1000,
  status: 'active',
  started_at: '2026-08-01',
  ...over,
});

describe('rozdelSudyDoTanku', () => {
  it('vejde-li se to do jednoho tanku, druhý nechá být', () => {
    const r = rozdelSudyDoTanku([t({ label: 'T1' }), t({ label: 'T2' })], PIVO, 8, 50);
    expect(r.dily).toEqual([{ tankId: 'T1', label: 'T1', sudy: 8, litry: 400 }]);
    expect(r.nepokrytoSudu).toBe(0);
  });

  it('když tank dojde, plynule pokračuje dalším', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'T1', current_volume_l: 300 }),
      t({ label: 'T2', current_volume_l: 900, started_at: '2026-08-05' }),
    ], PIVO, 20, 50);
    expect(r.dily).toEqual([
      { tankId: 'T1', label: 'T1', sudy: 6, litry: 300 },
      { tankId: 'T2', label: 'T2', sudy: 14, litry: 700 },
    ]);
    expect(r.nepokrytoSudu).toBe(0);
  });

  it('počítá v CELÝCH sudech — zbytek v tanku na další sud nestačí', () => {
    // 120 l dá dvě padesátky, ne dva a půl. Zbylých 20 l zůstane v tanku a
    // třetí sud se načne až z dalšího.
    const r = rozdelSudyDoTanku([
      t({ label: 'T1', current_volume_l: 120 }),
      t({ label: 'T2', current_volume_l: 500, started_at: '2026-08-05' }),
    ], PIVO, 4, 50);
    expect(r.dily).toEqual([
      { tankId: 'T1', label: 'T1', sudy: 2, litry: 100 },
      { tankId: 'T2', label: 'T2', sudy: 2, litry: 100 },
    ]);
  });

  it('projde i přes tři tanky', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'T1', current_volume_l: 100, started_at: '2026-08-01' }),
      t({ label: 'T2', current_volume_l: 100, started_at: '2026-08-02' }),
      t({ label: 'T3', current_volume_l: 500, started_at: '2026-08-03' }),
    ], PIVO, 9, 50);
    expect(r.dily.map((d) => d.sudy)).toEqual([2, 2, 5]);
  });

  it('cizí pivo se nepoužije, i kdyby ho byl plný sklep', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'T1', current_beer_id: 'b-11tm', current_volume_l: 5000 }),
      t({ label: 'T2', current_volume_l: 200 }),
    ], PIVO, 10, 50);
    expect(r.dily).toEqual([{ tankId: 'T2', label: 'T2', sudy: 4, litry: 200 }]);
    expect(r.nepokrytoSudu).toBe(6);
  });

  it('mytý, prázdný ani napouštěný tank se nenačne', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'Mytý', status: 'cleaning', current_volume_l: 900 }),
      t({ label: 'Prázdný', status: 'empty', current_volume_l: 900 }),
      t({ label: 'Napouští se', status: 'filling', current_volume_l: 900 }),
      t({ label: 'Živý', current_volume_l: 400 }),
    ], PIVO, 12, 50);
    expect(r.dily).toEqual([{ tankId: 'Živý', label: 'Živý', sudy: 8, litry: 400 }]);
    expect(r.nepokrytoSudu).toBe(4);
  });

  it('žádný tank se nepřetáhne do záporu — zbytek se přizná', () => {
    // Radši ať je vidět, že na to pivo ve sklepě nebylo, než aby si program
    // vymyslel zápornou ležáckou zásobu.
    const r = rozdelSudyDoTanku([t({ label: 'T1', current_volume_l: 120 })], PIVO, 35, 50);
    expect(r.dily).toEqual([{ tankId: 'T1', label: 'T1', sudy: 2, litry: 100 }]);
    expect(r.nepokrytoSudu).toBe(33);
  });

  it('prázdný sklep nic nevymyslí', () => {
    const r = rozdelSudyDoTanku([], PIVO, 10, 50);
    expect(r.dily).toEqual([]);
    expect(r.nepokrytoSudu).toBe(10);
  });

  it('třicítky se dělí podle svého objemu, ne podle padesátek', () => {
    const r = rozdelSudyDoTanku([t({ label: 'T1', current_volume_l: 100 })], PIVO, 5, 30);
    expect(r.dily).toEqual([{ tankId: 'T1', label: 'T1', sudy: 3, litry: 90 }]);
    expect(r.nepokrytoSudu).toBe(2);
  });

  it('pořadí: nejdřív ten, ze kterého se právě stáčí', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'Starý', started_at: '2026-07-01', current_volume_l: 100 }),
      t({ label: 'Rozstáčený', kegging_active: true, started_at: '2026-08-20', current_volume_l: 100 }),
    ], PIVO, 3, 50);
    expect(r.dily[0].label).toBe('Rozstáčený');
  });

  it('pořadí: rozstáčený (emptying) před netknutým', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'Netknutý', status: 'active', started_at: '2026-07-01', current_volume_l: 100 }),
      t({ label: 'Rozstáčený', status: 'emptying', started_at: '2026-08-20', current_volume_l: 100 }),
    ], PIVO, 3, 50);
    expect(r.dily[0].label).toBe('Rozstáčený');
  });

  it('pořadí: pak nejstarší napuštěný první — starší ležák nesmí stát', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'Nový', started_at: '2026-08-25', current_volume_l: 100 }),
      t({ label: 'Starý', started_at: '2026-07-10', current_volume_l: 100 }),
    ], PIVO, 3, 50);
    expect(r.dily.map((d) => d.label)).toEqual(['Starý', 'Nový']);
  });

  it('nulová nebo záporná potřeba nic neodečte', () => {
    expect(rozdelSudyDoTanku([t({ label: 'T1' })], PIVO, 0, 50).dily).toEqual([]);
    expect(rozdelSudyDoTanku([t({ label: 'T1' })], PIVO, -5, 50).dily).toEqual([]);
  });

  it('sud bez objemu nic nevymyslí — dělení nulou by dalo nekonečno', () => {
    const r = rozdelSudyDoTanku([t({ label: 'T1' })], PIVO, 5, 0);
    expect(r.dily).toEqual([]);
    expect(r.nepokrytoSudu).toBe(0);
  });
});

describe('popisRozdeleni', () => {
  it('vypíše tanky, kusy i litry', () => {
    const r = rozdelSudyDoTanku([
      t({ label: 'Tank 3', current_volume_l: 1400 }),
      t({ label: 'Tank 5', current_volume_l: 900, started_at: '2026-08-10' }),
    ], PIVO, 35, 50);
    const s = popisRozdeleni(r);
    expect(s).toContain('Tank 3');
    expect(s).toContain('28 ks');
    expect(s).toContain('Tank 5');
    expect(s).toContain('7 ks');
  });

  it('nepokrytý zbytek řekne nahlas', () => {
    const r = rozdelSudyDoTanku([t({ label: 'Tank 3', current_volume_l: 100 })], PIVO, 10, 50);
    expect(popisRozdeleni(r)).toContain('bez tanku');
  });

  it('prázdný sklep dá srozumitelnou větu, ne prázdný řetězec', () => {
    expect(popisRozdeleni(rozdelSudyDoTanku([], PIVO, 10, 50))).toContain('bez tanku');
  });
});

describe('zmenaOtevreni — když tank dojde, otevři další', () => {
  it('dojetý tank zavře a otevře další se stejným pivem', () => {
    const tanky = [
      t({ label: 'T1', current_volume_l: 500, started_at: '2026-07-01' }),
      t({ label: 'T2', current_volume_l: 900, started_at: '2026-08-05' }),
    ];
    const r = rozdelSudyDoTanku(tanky, PIVO, 14, 50); // 10 z T1 (500 l), 4 z T2
    const z = zmenaOtevreni(tanky, PIVO, r);
    expect(z.dojely.map((d) => d.label)).toEqual(['T1']);
    expect(z.otevrit?.label).toBe('T2');
  });

  it('když tank po odečtu ještě něco má, zůstane otevřený on', () => {
    const tanky = [t({ label: 'T1', current_volume_l: 6000 })];
    const r = rozdelSudyDoTanku(tanky, PIVO, 35, 50); // 1750 l z 6000
    const z = zmenaOtevreni(tanky, PIVO, r);
    expect(z.dojely).toEqual([]);
    expect(z.otevrit?.label).toBe('T1');
  });

  it('když dojdou všechny, není co otevřít — ale nic se nevymyslí', () => {
    const tanky = [
      t({ label: 'T1', current_volume_l: 100, started_at: '2026-07-01' }),
      t({ label: 'T2', current_volume_l: 100, started_at: '2026-08-01' }),
    ];
    const r = rozdelSudyDoTanku(tanky, PIVO, 10, 50);
    const z = zmenaOtevreni(tanky, PIVO, r);
    expect(z.dojely.map((d) => d.label)).toEqual(['T1', 'T2']);
    expect(z.otevrit).toBeNull();
  });

  it('nesahá na sklep, když se odečet netýkal žádného tanku', () => {
    // Zápis bez tanku (prázdný sklep) nesmí přepnout stáčecí příznak.
    const z = zmenaOtevreni([t({ label: 'T1' })], PIVO, { dily: [], nepokrytoSudu: 35 });
    expect(z.dojely).toEqual([]);
    expect(z.otevrit).toBeNull();
  });

  it('neotevře tank s jiným pivem', () => {
    const tanky = [
      t({ label: 'T1', current_volume_l: 100 }),
      t({ label: 'Cizí', current_beer_id: 'b-11tm', current_volume_l: 5000 }),
    ];
    const r = rozdelSudyDoTanku(tanky, PIVO, 2, 50);
    const z = zmenaOtevreni(tanky, PIVO, r);
    expect(z.otevrit).toBeNull();
  });

  it('otevře nejstarší z těch, co zbyly — ne ten nejbližší v seznamu', () => {
    const tanky = [
      t({ label: 'Dojede', current_volume_l: 100, kegging_active: true, started_at: '2026-08-20' }),
      t({ label: 'Nový', current_volume_l: 900, started_at: '2026-08-25' }),
      t({ label: 'Starý', current_volume_l: 900, started_at: '2026-07-10' }),
    ];
    const r = rozdelSudyDoTanku(tanky, PIVO, 2, 50);
    const z = zmenaOtevreni(tanky, PIVO, r);
    expect(z.dojely.map((d) => d.label)).toEqual(['Dojede']);
    expect(z.otevrit?.label).toBe('Starý');
  });
});
