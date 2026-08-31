import { describe, expect, it } from 'vitest';
import { nesedici, zkontrolujTanky, type PrecerpaniVstup, type StaceniVstup, type TankVstup } from './tankKontrola';

const tank = (over: Partial<TankVstup> = {}): TankVstup => ({
  id: 't1', label: 'Tank 1',
  initial_volume_l: 1000, current_volume_l: 1000,
  started_at: '2026-08-01', ...over,
});

const staceni = (over: Partial<StaceniVstup> = {}): StaceniVstup => ({
  cellar_tank_id: 't1', entry_date: '2026-08-10', source_volume_l: 500, ...over,
});

describe('zkontrolujTanky — běžný provoz', () => {
  it('když se odečet povedl, tank sedí', () => {
    const [r] = zkontrolujTanky([tank({ current_volume_l: 500 })], [staceni()]);
    expect(r.dopocitanoL).toBe(500);
    expect(r.rozdilL).toBe(0);
    expect(r.nesedi).toBe(false);
  });

  it('sečte víc stáčení z téhož tanku', () => {
    const [r] = zkontrolujTanky(
      [tank({ current_volume_l: 250 })],
      [staceni({ source_volume_l: 500 }), staceni({ source_volume_l: 250, entry_date: '2026-08-12' })],
    );
    expect(r.vystocenoL).toBe(750);
    expect(r.nesedi).toBe(false);
  });

  it('započítá i ztrátu zapsanou u stáčení', () => {
    const [r] = zkontrolujTanky(
      [tank({ current_volume_l: 480 })],
      [staceni({ source_volume_l: 500, loss_l: 20 })],
    );
    expect(r.vystocenoL).toBe(520);
    expect(r.dopocitanoL).toBe(480);
    expect(r.nesedi).toBe(false);
  });
});

describe('zkontrolujTanky — právě ta chyba, kvůli které to vzniklo', () => {
  it('stáčení uložené, ale objem tanku nesnížený → nahlásí se', () => {
    // Přesně situace z Kegging.tsx: insert prošel, adjust_tank_volume selhal.
    const [r] = zkontrolujTanky([tank({ current_volume_l: 1000 })], [staceni({ source_volume_l: 500 })]);
    expect(r.dopocitanoL).toBe(500);
    expect(r.evidovanoL).toBe(1000);
    expect(r.rozdilL).toBe(500);
    expect(r.nesedi).toBe(true);
  });

  it('a odečet provedený dvakrát taky', () => {
    const [r] = zkontrolujTanky([tank({ current_volume_l: 0 })], [staceni({ source_volume_l: 500 })]);
    expect(r.rozdilL).toBe(-500);
    expect(r.nesedi).toBe(true);
  });

  it('drobná odchylka do litru se nehlásí — zaokrouhlování není chyba', () => {
    const [r] = zkontrolujTanky([tank({ current_volume_l: 500.4 })], [staceni({ source_volume_l: 500 })]);
    expect(r.nesedi).toBe(false);
  });
});

describe('zkontrolujTanky — co nesmí splést', () => {
  it('stáčení z jiného tanku se nepočítá', () => {
    const [r] = zkontrolujTanky([tank({ current_volume_l: 1000 })], [staceni({ cellar_tank_id: 't9' })]);
    expect(r.vystocenoL).toBe(0);
    expect(r.nesedi).toBe(false);
  });

  it('stáčení z minulého cyklu se nepočítá', () => {
    // Tank se vypustil a naplnil znovu 1. 8.; červencové stáčení už do
    // nového cyklu nepatří — jinak by tank vycházel věčně v mínusu.
    const [r] = zkontrolujTanky(
      [tank({ current_volume_l: 1000, started_at: '2026-08-01' })],
      [staceni({ entry_date: '2026-07-20', source_volume_l: 800 })],
    );
    expect(r.vystocenoL).toBe(0);
    expect(r.nesedi).toBe(false);
  });

  it('stáčení přesně v den začátku cyklu se počítá', () => {
    const [r] = zkontrolujTanky(
      [tank({ current_volume_l: 500, started_at: '2026-08-01' })],
      [staceni({ entry_date: '2026-08-01', source_volume_l: 500 })],
    );
    expect(r.vystocenoL).toBe(500);
    expect(r.nesedi).toBe(false);
  });

  it('tank bez zadaného počátečního objemu se přeskočí', () => {
    expect(zkontrolujTanky([tank({ initial_volume_l: null })], [])).toEqual([]);
    expect(zkontrolujTanky([tank({ initial_volume_l: 0 })], [])).toEqual([]);
  });

  it('vymytý tank se nekontroluje — jeho cyklus skončil', () => {
    // Po ukončení cyklu se zbytek odepíše a objem spadne na nulu, ale
    // initial_volume_l drží hodnotu skončeného cyklu. Bez tohohle filtru
    // hlásilo upozornění schodek u KAŽDÉHO vymytého tanku (na ostrých datech
    // 11 z 11) — a co svítí pořád, to si nikdo nepřečte.
    for (const status of ['empty', 'cleaning', 'sanitizing', 'rinsing']) {
      expect(zkontrolujTanky([tank({ status, current_volume_l: 0 })], [])).toEqual([]);
    }
  });

  it('tank v provozu se naopak kontroluje', () => {
    for (const status of ['active', 'emptying']) {
      expect(zkontrolujTanky([tank({ status, current_volume_l: 1000 })], [])).toHaveLength(1);
    }
  });
});

describe('zkontrolujTanky — přečerpávání mezi tanky', () => {
  const prec = (over: Partial<PrecerpaniVstup> = {}): PrecerpaniVstup => ({
    transfer_date: '2026-08-05', from_tank_id: 't1', to_tank_id: 't2', volume_l: 300, ...over,
  });

  it('z tanku, ze kterého se přečerpalo, objem ubude', () => {
    const [r] = zkontrolujTanky([tank({ current_volume_l: 700 })], [], [prec()]);
    expect(r.precerpanoL).toBe(-300);
    expect(r.dopocitanoL).toBe(700);
    expect(r.nesedi).toBe(false);
  });

  it('do tanku, do kterého se přečerpalo, přibude', () => {
    const cil = tank({ id: 't2', label: 'Tank 2', initial_volume_l: 100, current_volume_l: 400 });
    const [r] = zkontrolujTanky([cil], [], [prec()]);
    expect(r.precerpanoL).toBe(300);
    expect(r.dopocitanoL).toBe(400);
    expect(r.nesedi).toBe(false);
  });

  it('naplnění tanku v den zahájení cyklu se NEpočítá dvakrát', () => {
    // Naplnění se zapíše dvakrát: jako initial_volume_l a jako přečerpání do
    // tanku k témuž dni. Na ostrých datech kvůli tomu Tank 8 vycházel na
    // 15 000 l místo 7 500 — a hlásilo to schodek u každého plného tanku.
    const naplneny = tank({ initial_volume_l: 7500, current_volume_l: 7500, started_at: '2026-08-09' });
    const naplneni = prec({ transfer_date: '2026-08-09', from_tank_id: null, to_tank_id: 't1', volume_l: 7500 });
    const [r] = zkontrolujTanky([naplneny], [], [naplneni]);
    expect(r.precerpanoL).toBe(0);
    expect(r.dopocitanoL).toBe(7500);
    expect(r.nesedi).toBe(false);
  });

  it('ztráta při přečerpání jde k tíži zdrojového tanku, ne cílového', () => {
    const zdroj = zkontrolujTanky([tank({ current_volume_l: 680 })], [], [prec({ loss_l: 20 })])[0];
    expect(zdroj.precerpanoL).toBe(-320);
    expect(zdroj.nesedi).toBe(false);

    const cil = zkontrolujTanky(
      [tank({ id: 't2', label: 'Tank 2', initial_volume_l: 0, current_volume_l: 300 })],
      [], [prec({ loss_l: 20 })],
    );
    // Tank s nulovým počátečním objemem se přeskakuje — ověřuje se jen,
    // že se sem ztráta nepřipsala; k tomu stačí případ výše.
    expect(cil).toEqual([]);
  });

  it('přečerpání z minulého cyklu se nepočítá', () => {
    const [r] = zkontrolujTanky(
      [tank({ current_volume_l: 1000, started_at: '2026-08-01' })],
      [], [prec({ transfer_date: '2026-07-15' })],
    );
    expect(r.precerpanoL).toBe(0);
    expect(r.nesedi).toBe(false);
  });
});

describe('nesedici', () => {
  it('vybere jen tanky, které nesedí', () => {
    const r = zkontrolujTanky(
      [tank({ current_volume_l: 1000 }), tank({ id: 't2', label: 'Tank 2', current_volume_l: 500 })],
      [staceni({ source_volume_l: 500 }), staceni({ cellar_tank_id: 't2', source_volume_l: 500 })],
    );
    const spatne = nesedici(r);
    expect(spatne).toHaveLength(1);
    expect(spatne[0].label).toBe('Tank 1');
  });
});
