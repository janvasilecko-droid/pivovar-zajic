// 📝 Kniha jízd — z formuláře na dávku změn (nová jízda, tankování, úprava, smazání).
import { describe, expect, it } from 'vitest';
import {
  type VstupFormulare,
  type ZaznamJizdy,
  HOME_BASE,
  POZNAMKA_UPRAVENO,
  davkaPridani,
  davkaSmazani,
  davkaUpravy,
  dokonciTrasuDomu,
  jeTankovaniZaznam,
  jizdyAutaVMesici,
  klicMesice,
  kolikPosunuteSmazanim,
  planNoveJizdy,
  planUpravy,
  popisPosunu,
  radekProVlozeni,
} from './knihaJizdFormular';
import { POZNAMKA_VYGENEROVANO } from './knihaJizd';

const VELKE = 'Velké auto (Peugeot Boxer / 3K1 2244)';
const KACENA = 'Kačena (Citroën)';
const NIC: ReadonlySet<string> = new Set();

let n = 0;
function zaznam(id: string, date: string, start: number, ujeto: number, extra: Partial<ZaznamJizdy> = {}): ZaznamJizdy {
  n += 1;
  return {
    id, date, vehicle_name: VELKE, driver: 'Petr Bednář', route_from: HOME_BASE, route_to: 'Sokolov → Kynšperk nad Ohří',
    purpose: 'Rozvoz piva', km_start: start, km_end: Math.round((start + ujeto) * 10) / 10, km_driven: ujeto, km_trasa: ujeto,
    km_dorovnani: 0, created_at: `2026-10-01T10:00:${String(n % 60).padStart(2, '0')}Z`, ...extra,
  };
}

/** Říjen: A 1000→1010, B 1010→1030, C 1030→1040 */
const rijen = () => [
  zaznam('A', '2026-10-01', 1000, 10),
  zaznam('B', '2026-10-05', 1010, 20),
  zaznam('C', '2026-10-09', 1030, 10),
];

const vstup = (extra: Partial<VstupFormulare> = {}): VstupFormulare => ({
  rezim: 'jizda', id: 'N', datum: '2026-10-20', vozidlo: VELKE, ridic: 'Petr Bednář', kam: 'Sokolov', ucel: 'Rozvoz',
  ujeto: 12, litry: null, zacatek: null, zacatekRucne: false, poznamka: '', vytvoreno: '2026-10-20T08:00:00Z', ...extra,
});

describe('dokonciTrasuDomu', () => {
  it('doplní návrat do Kynšperka, jen když tam chybí', () => {
    expect(dokonciTrasuDomu('Sokolov')).toBe('Sokolov → Kynšperk nad Ohří');
    expect(dokonciTrasuDomu('Sokolov → Kynšperk nad Ohří')).toBe('Sokolov → Kynšperk nad Ohří');
    expect(dokonciTrasuDomu('  ')).toBe('Okruh po odběratelích → Kynšperk nad Ohří');
  });
});

describe('planNoveJizdy', () => {
  it('jízda na konec měsíce navazuje na poslední jízdu auta a nic neposouvá', () => {
    const p = planNoveJizdy(vstup(), rijen(), NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam).toMatchObject({
      id: 'N', date: '2026-10-20', vehicle_name: VELKE, route_from: HOME_BASE, route_to: 'Sokolov → Kynšperk nad Ohří',
      km_start: 1040, km_end: 1052, km_driven: 12, km_trasa: 12, km_dorovnani: 0,
    });
    expect(p.zdrojZacatku).toBe('navazuje');
    expect(p.zmeny).toEqual([]);
    expect(popisPosunu(p)).toBe('');
  });

  it('zpětně doprostřed měsíce posune pozdější jízdy a řekne to', () => {
    const p = planNoveJizdy(vstup({ datum: '2026-10-07', ujeto: 7 }), rijen(), NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam).toMatchObject({ km_start: 1030, km_end: 1037 });
    expect(p.zmeny).toEqual([{ id: 'C', km_start: 1037, km_end: 1047 }]);
    expect(p.pocetPosunutych).toBe(1);
    expect(popisPosunu(p)).toMatch(/1\sdalší jízdy.*\+7\skm/);
  });

  it('první jízda nového měsíce navazuje na konec minulého', () => {
    const p = planNoveJizdy(vstup({ datum: '2026-11-03' }), rijen(), NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam.km_start).toBe(1040);
  });

  it('auto bez jediné jízdy chce začátek zadat', () => {
    const p = planNoveJizdy(vstup({ vozidlo: KACENA }), rijen(), NIC);
    expect(p).toEqual({ ok: false, chyba: 'Tohle auto zatím nemá žádnou jízdu — zadej stav tachometru na začátku.' });
    const s = planNoveJizdy(vstup({ vozidlo: KACENA, zacatek: 84000 }), rijen(), NIC);
    expect(s.ok && s.zaznam).toMatchObject({ km_start: 84000, km_end: 84012 });
    expect(s.ok && s.zdrojZacatku).toBe('rucne');
  });

  it('ručně přepsaný začátek má přednost před navázáním', () => {
    const p = planNoveJizdy(vstup({ zacatek: 1100, zacatekRucne: true }), rijen(), NIC);
    expect(p.ok && p.zaznam).toMatchObject({ km_start: 1100, km_end: 1112 });
    expect(p.ok && p.zdrojZacatku).toBe('rucne');
  });

  it('nevyplněné nebo nesmyslné údaje se odmítnou srozumitelně', () => {
    expect(planNoveJizdy(vstup({ datum: '' }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyplň datum.' });
    expect(planNoveJizdy(vstup({ vozidlo: ' ' }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyber vozidlo.' });
    expect(planNoveJizdy(vstup({ ridic: '' }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyplň řidiče.' });
    expect(planNoveJizdy(vstup({ kam: '' }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyplň, kam se jelo.' });
    expect(planNoveJizdy(vstup({ ucel: '' }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyplň účel jízdy.' });
    expect(planNoveJizdy(vstup({ ujeto: 0 }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Ujeté km musí být víc než nula.' });
    expect(planNoveJizdy(vstup({ ujeto: NaN }), rijen(), NIC)).toMatchObject({ ok: false });
    expect(planNoveJizdy(vstup({ litry: -3 }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Litry nemůžou být záporné.' });
  });

  it('do uzavřeného měsíce auta se nepíše, do téhož měsíce jiného auta ano', () => {
    const zavrene = new Set([klicMesice(VELKE, '2026-10')]);
    const p = planNoveJizdy(vstup(), rijen(), zavrene);
    expect(!p.ok && p.chyba).toMatch(/uzavřený/);
    expect(planNoveJizdy(vstup({ vozidlo: KACENA, zacatek: 5 }), rijen(), zavrene).ok).toBe(true);
    expect(planNoveJizdy(vstup({ datum: '2026-11-02' }), rijen(), zavrene).ok).toBe(true);
  });

  it('tankování: nulové km, začátek = konec = stav tachometru, litry a místo', () => {
    const p = planNoveJizdy(vstup({ rezim: 'tankovani', datum: '2026-10-07', litry: 45.2, kam: 'Benzina Sokolov', ucel: '', ujeto: 0 }), rijen(), NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam).toMatchObject({
      route_from: 'Tankování', route_to: 'Benzina Sokolov', purpose: 'Tankování',
      km_start: 1030, km_end: 1030, km_driven: 0, km_trasa: 0, fuel_liters: 45.2,
    });
    expect(jeTankovaniZaznam(p.zaznam)).toBe(true);
    expect(p.zmeny).toEqual([]); // tankování nic neposouvá
  });

  it('tankování bez místa dostane výchozí; bez litrů se odmítne', () => {
    const p = planNoveJizdy(vstup({ rezim: 'tankovani', litry: 30, kam: '', ucel: '', ujeto: 0 }), rijen(), NIC);
    expect(p.ok && p.zaznam.route_to).toBe('Čerpací stanice');
    expect(planNoveJizdy(vstup({ rezim: 'tankovani', litry: null, ujeto: 0 }), rijen(), NIC)).toMatchObject({ ok: false, chyba: 'Vyplň, kolik litrů se natankovalo.' });
    expect(planNoveJizdy(vstup({ rezim: 'tankovani', litry: 0, ujeto: 0 }), rijen(), NIC)).toMatchObject({ ok: false });
  });
});

describe('planUpravy', () => {
  const upravVstup = (z: ZaznamJizdy, extra: Partial<VstupFormulare> = {}): VstupFormulare => ({
    rezim: jeTankovaniZaznam(z) ? 'tankovani' : 'jizda', id: z.id, datum: z.date, vozidlo: z.vehicle_name, ridic: z.driver,
    kam: z.route_to, ucel: z.purpose, ujeto: z.km_driven, litry: z.fuel_liters ?? null, zacatek: z.km_start, zacatekRucne: false,
    poznamka: z.note ?? '', vytvoreno: z.created_at ?? '', ...extra,
  });

  it('beze změny se nic neposílá', () => {
    const r = rijen();
    const p = planUpravy(upravVstup(r[1]), r[1], r, NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zmeny).toEqual([]);
    expect(davkaUpravy(r[1], p)).toEqual({ upravit: [] });
  });

  it('změna km posune pozdější jízdy; km_trasa se přepíše novými km a dorovnání se nuluje', () => {
    const r = rijen();
    const b = { ...r[1], km_trasa: 18, km_dorovnani: 2 }; // po otevření měsíce: trasa 18 + dorovnání 2 = 20
    const seznam = [r[0], b, r[2]];
    const p = planUpravy(upravVstup(b, { ujeto: 25 }), b, seznam, NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam).toMatchObject({ km_start: 1010, km_end: 1035, km_driven: 25, km_trasa: 25, km_dorovnani: 0 });
    expect(davkaUpravy(b, p)).toEqual({
      upravit: [
        { id: 'B', km_end: 1035, km_driven: 25, km_trasa: 25, km_dorovnani: 0 },
        { id: 'C', km_start: 1035, km_end: 1045 },
      ],
    });
    expect(popisPosunu(p)).toMatch(/\+5\skm/);
  });

  it('změna jen textu nechá km, km_trasa i dorovnání být', () => {
    const r = rijen();
    const b = { ...r[1], km_trasa: 18, km_dorovnani: 2 };
    const p = planUpravy(upravVstup(b, { ucel: 'Svoz obalů' }), b, [r[0], b, r[2]], NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam).toMatchObject({ km_trasa: 18, km_dorovnani: 2 });
    expect(davkaUpravy(b, p)).toEqual({ upravit: [{ id: 'B', purpose: 'Svoz obalů' }] });
  });

  it('do patche jdou jen změněné sloupce (cizí změny jiných sloupců se nepřepíšou)', () => {
    const r = rijen();
    const p = planUpravy(upravVstup(r[1], { ridic: 'Martin' }), r[1], r, NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(davkaUpravy(r[1], p)).toEqual({ upravit: [{ id: 'B', driver: 'Martin' }] });
  });

  it('trasa, které appka nepřidala návrat do pivovaru, se nezmění, dokud ji člověk nepřepíše', () => {
    const r = rijen();
    const b = { ...r[1], route_to: 'Praha, Hradec' };
    const p = planUpravy(upravVstup(b, { ucel: 'x' }), b, [r[0], b, r[2]], NIC);
    expect(p.ok && p.zaznam.route_to).toBe('Praha, Hradec');
    const q = planUpravy(upravVstup(b, { kam: 'Plzeň' }), b, [r[0], b, r[2]], NIC);
    expect(q.ok && q.zaznam.route_to).toBe('Plzeň → Kynšperk nad Ohří');
  });

  it('vygenerovaná jízda, na kterou se sáhlo, dostane značku „upraveno ručně“ (generátor ji nepřepíše)', () => {
    const r = rijen();
    const g = { ...r[1], note: `${POZNAMKA_VYGENEROVANO} (3 zastávky, jedna okružní jízda) — Velké auto` };
    const p = planUpravy(upravVstup(g, { ujeto: 22 }), g, [r[0], g, r[2]], NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.zaznam.note).toBe(`${POZNAMKA_UPRAVENO} (3 zastávky, jedna okružní jízda) — Velké auto`);
    expect(p.zaznam.note?.startsWith(POZNAMKA_VYGENEROVANO)).toBe(false);
  });

  it('přesun na jiné auto: srovná obě řady a vezme začátek podle nového auta', () => {
    const r = [...rijen(), zaznam('K1', '2026-10-02', 500, 10, { vehicle_name: KACENA }), zaznam('K2', '2026-10-20', 510, 20, { vehicle_name: KACENA })];
    const b = r[1];
    const p = planUpravy(upravVstup(b, { vozidlo: KACENA }), b, r, NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(p.presunuto).toBe(true);
    expect(p.zaznam).toMatchObject({ vehicle_name: KACENA, km_start: 510, km_end: 530 });
    expect(p.zmeny).toEqual([
      { id: 'C', km_start: 1010, km_end: 1020 },
      { id: 'K2', km_start: 530, km_end: 550 },
    ]);
    expect(popisPosunu(p)).toMatch(/přesouvá/);
  });

  it('přesun do uzavřeného měsíce se odmítne; úprava uvnitř něj taky', () => {
    const r = rijen();
    const zavrene = new Set([klicMesice(VELKE, '2026-11')]);
    const p = planUpravy(upravVstup(r[1], { datum: '2026-11-03' }), r[1], r, zavrene);
    expect(!p.ok && p.chyba).toMatch(/nejde přesunout/);
    const uzavrena = { ...r[1], uzavreno_at: '2026-11-02T08:00:00Z' };
    expect(planUpravy(upravVstup(uzavrena), uzavrena, r, NIC)).toMatchObject({ ok: false });
  });

  it('úprava tankování: litry a místo; km zůstávají nulové', () => {
    const t = zaznam('T', '2026-10-09', 1040, 0, { route_from: 'Tankování', route_to: 'Shell', purpose: 'Tankování', fuel_liters: 40 });
    const seznam = [...rijen(), t];
    const p = planUpravy(upravVstup(t, { litry: 42.5, kam: 'Shell Sokolov' }), t, seznam, NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(davkaUpravy(t, p)).toEqual({ upravit: [{ id: 'T', route_to: 'Shell Sokolov', fuel_liters: 42.5 }] });
  });
});

describe('dávky', () => {
  it('přidání = vložit celý řádek + posunout pozdější', () => {
    const p = planNoveJizdy(vstup({ datum: '2026-10-07', ujeto: 7, poznamka: 'doplněno' }), rijen(), NIC);
    if (!p.ok) throw new Error(p.chyba);
    expect(davkaPridani(p)).toEqual({
      vlozit: [{
        id: 'N', entry_date: '2026-10-07', vehicle_id: null, vehicle_name: VELKE, driver: 'Petr Bednář', route_from: HOME_BASE,
        route_to: 'Sokolov → Kynšperk nad Ohří', purpose: 'Rozvoz', km_start: 1030, km_end: 1037, km_driven: 7, km_trasa: 7,
        km_dorovnani: 0, fuel_liters: null, note: 'doplněno',
      }],
      upravit: [{ id: 'C', km_start: 1037, km_end: 1047 }],
    });
  });

  it('smazání = smazat a vrátit pozdější; uzavřená a neznámá jízda se nesmaže', () => {
    expect(davkaSmazani(rijen(), 'B')).toEqual({
      smazat: ['B'],
      upravit: [{ id: 'C', km_start: 1010, km_end: 1020 }],
    });
    expect(davkaSmazani(rijen(), 'C')).toEqual({ smazat: ['C'], upravit: [] });
    expect(davkaSmazani(rijen(), 'nic')).toBeNull();
    const r = rijen().map((j) => (j.id === 'B' ? { ...j, uzavreno_at: '2026-11-02T00:00:00Z' } : j));
    expect(davkaSmazani(r, 'B')).toBeNull();
  });

  it('kolikPosunuteSmazanim říká, co smazání udělá s řadou', () => {
    expect(kolikPosunuteSmazanim(rijen(), 'A')).toEqual({ pocet: 2, km: 10 });
    expect(kolikPosunuteSmazanim(rijen(), 'C')).toEqual({ pocet: 0, km: 10 });
    expect(kolikPosunuteSmazanim(rijen(), 'nic')).toEqual({ pocet: 0, km: 0 });
  });

  it('radekProVlozeni nikdy neposílá uzavreno_at ani created_at (nastaví databáze)', () => {
    const r = radekProVlozeni({ ...rijen()[0], uzavreno_at: '2026-11-02T00:00:00Z' });
    expect(Object.keys(r)).not.toContain('uzavreno_at');
    expect(Object.keys(r)).not.toContain('created_at');
  });
});

describe('jizdyAutaVMesici', () => {
  it('vybere auto a měsíc a seřadí', () => {
    const r = [zaznam('K', '2026-10-03', 5, 1, { vehicle_name: KACENA }), ...rijen().reverse(), zaznam('L', '2026-11-01', 1040, 5)];
    expect(jizdyAutaVMesici(r, VELKE, '2026-10').map((j) => j.id)).toEqual(['A', 'B', 'C']);
  });
});
