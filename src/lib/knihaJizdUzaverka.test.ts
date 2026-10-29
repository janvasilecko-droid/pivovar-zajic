// 🧮 Uzávěrka měsíce v Knize jízd (zadání majitele 29. 10. 2026): „jednou měsíčně aby se
// dopsal rozdíl v KM (stav kilometrů) a ten rozdíl dopočítáš rovnoměrně mezi jízdy“.
// Trasy z objednávek dávají jen odhad; skutečný je stav tachometru. Rozdíl se rozpočítá mezi
// jízdy měsíce a tachometr na sebe znovu přesně navazuje (začátek měsíce → konec měsíce).
import { describe, expect, it } from 'vitest';
import {
  jeTankovani, rozdelRozdil, sestavUzaverku, stavMesice, type JizdaUzaverky,
} from './knihaJizdUzaverka';

let n = 0;
const jizda = (date: string, km: number, extra: Partial<JizdaUzaverky> = {}): JizdaUzaverky => {
  n += 1;
  return { id: `j${n}`, date, km_start: 0, km_end: km, km_driven: km, ...extra };
};
const souctyDes = (a: number[]) => a.reduce((s, x) => s + x, 0);
/** České tisíce se v hláškách píšou s nedělitelnou mezerou („1 070“) — v testu stačí obyčejná. */
const bezNbsp = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('rozdelRozdil — rovnoměrně', () => {
  it('kladný rozdíl se dělí stejným dílem mezi všechny jízdy', () => {
    expect(rozdelRozdil([100, 200, 300], 60, 'rovnomerne')).toEqual([20, 20, 20]);
  });

  it('zbylé desetiny kilometru dostanou první jízdy, součet sedí přesně', () => {
    const r = rozdelRozdil([100, 100, 100], 10, 'rovnomerne')!;
    expect(r).toEqual([4, 3, 3]);
    expect(souctyDes(r)).toBe(10);
  });

  it('záporný rozdíl se ubírá stejným dílem', () => {
    expect(rozdelRozdil([100, 200, 300], -60, 'rovnomerne')).toEqual([-20, -20, -20]);
  });

  it('krátká jízda nejde pod nulu — co se jí nevejde, ubere se ostatním', () => {
    // 1,0 / 20,0 / 30,0 km a rozdíl −9,0 km: rovný díl by byl −3,0, krátká jízda má jen 1,0
    const r = rozdelRozdil([10, 200, 300], -90, 'rovnomerne')!;
    expect(r).toEqual([-10, -40, -40]);
    expect(souctyDes(r)).toBe(-90);
  });

  it('nulový rozdíl = beze změny', () => {
    expect(rozdelRozdil([100, 200], 0, 'rovnomerne')).toEqual([0, 0]);
  });

  it('víc ubrat, než je celkem ujeto, nejde', () => {
    expect(rozdelRozdil([100, 200], -301, 'rovnomerne')).toBeNull();
    expect(rozdelRozdil([100, 200], -300, 'rovnomerne')).toEqual([-100, -200]);
  });

  it('bez jízd není co dělit', () => {
    expect(rozdelRozdil([], 0, 'rovnomerne')).toEqual([]);
    expect(rozdelRozdil([], 50, 'rovnomerne')).toBeNull();
  });
});

describe('rozdelRozdil — úměrně délce jízdy', () => {
  it('delší jízda dostane větší díl', () => {
    expect(rozdelRozdil([100, 300], 80, 'umerne')).toEqual([20, 60]);
  });

  it('zbytky po zaokrouhlení se rozdají tak, aby součet seděl', () => {
    const r = rozdelRozdil([10, 10, 10], 10, 'umerne')!;
    expect(r).toEqual([4, 3, 3]);
    expect(souctyDes(r)).toBe(10);
  });

  it('ubírání je úměrné a žádná jízda nejde pod nulu', () => {
    expect(rozdelRozdil([100, 300], -80, 'umerne')).toEqual([-20, -60]);
    const r = rozdelRozdil([10, 20, 30], -60, 'umerne')!;
    expect(souctyDes(r)).toBe(-60);
    r.forEach((x, i) => expect([10, 20, 30][i] + x).toBeGreaterThanOrEqual(0));
  });

  it('jízdy s nulovou vzdáleností nedostanou nic; když jsou všechny nulové, dělí se rovnoměrně', () => {
    expect(rozdelRozdil([0, 100], 50, 'umerne')).toEqual([0, 50]);
    expect(rozdelRozdil([0, 0], 50, 'umerne')).toEqual([25, 25]);
  });
});

describe('rozdelRozdil — vlastnosti pro libovolná čísla', () => {
  // Vlastní jednoduchý generátor, ať je test pokaždé stejný.
  let seed = 12345;
  const nahoda = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  it('součet vždy přesně sedí, nic nejde pod nulu, díly rovnoměrného dělení se liší nejvýš o 0,1 km', () => {
    for (let k = 0; k < 400; k += 1) {
      const pocet = 1 + Math.floor(nahoda() * 12);
      const zaklad = Array.from({ length: pocet }, () => Math.floor(nahoda() * 3000));
      const soucet = souctyDes(zaklad);
      const rozdil = Math.floor(nahoda() * (soucet + 4000)) - soucet; // od −součet do +4000
      for (const rezim of ['rovnomerne', 'umerne'] as const) {
        const r = rozdelRozdil(zaklad, rozdil, rezim);
        expect(r, `${rezim} ${JSON.stringify(zaklad)} ${rozdil}`).not.toBeNull();
        expect(souctyDes(r!)).toBe(rozdil);
        r!.forEach((x, i) => expect(zaklad[i] + x).toBeGreaterThanOrEqual(0));
        if (rezim === 'rovnomerne' && rozdil > 0) {
          expect(Math.max(...r!) - Math.min(...r!)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('sestavUzaverku', () => {
  const dva = () => [
    jizda('2026-10-05', 10),
    jizda('2026-10-12', 20),
    jizda('2026-10-20', 30),
  ];

  it('rozdíl mezi tachometrem a trasami se rozpočítá mezi jízdy, tachometr přesně navazuje', () => {
    const jizdy = dva();
    const v = sestavUzaverku({ jizdy, tachometrZacatek: 1000, tachometrKonec: 1066, rezim: 'rovnomerne' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.soucetTrasy).toBe(60);
    expect(v.rozdil).toBe(6);
    expect(v.radky.map((r) => [r.km_trasa, r.km_dorovnani, r.km_driven])).toEqual([[10, 2, 12], [20, 2, 22], [30, 2, 32]]);
    expect(v.radky.map((r) => [r.km_start, r.km_end])).toEqual([[1000, 1012], [1012, 1034], [1034, 1066]]);
    expect(v.radky.map((r) => r.id)).toEqual(jizdy.map((j) => j.id));
    expect(v.radky.map((r) => r.poradi)).toEqual([1, 2, 3]);
  });

  it('jízdy se řadí podle data (i když přijdou zamíchané) a stejný den podle tachometru', () => {
    const a = jizda('2026-10-20', 30, { km_start: 5000 });
    const b = jizda('2026-10-05', 10);
    const c = jizda('2026-10-20', 5, { km_start: 100 });
    const v = sestavUzaverku({ jizdy: [a, b, c], tachometrZacatek: 0, tachometrKonec: 45, rezim: 'rovnomerne' });
    expect(v.ok && v.radky.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
  });

  it('úměrné dělení', () => {
    const v = sestavUzaverku({
      jizdy: [jizda('2026-10-05', 10), jizda('2026-10-06', 30)], tachometrZacatek: 500, tachometrKonec: 548, rezim: 'umerne',
    });
    expect(v.ok && v.radky.map((r) => r.km_dorovnani)).toEqual([2, 6]);
  });

  it('záporný rozdíl: trasy dávají víc, než ujel tachometr', () => {
    const v = sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 1054, rezim: 'rovnomerne' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rozdil).toBe(-6);
    expect(v.radky.map((r) => r.km_driven)).toEqual([8, 18, 28]);
    expect(v.radky[2].km_end).toBe(1054);
    expect(v.upozorneni.join(' ')).toMatch(/víc km, než ujel tachometr/);
  });

  it('znovu uzavíraný měsíc vychází z původních km trasy, ne z už dorovnaných', () => {
    const jizdy = [
      jizda('2026-10-05', 12, { km_trasa: 10, km_dorovnani: 2 }),
      jizda('2026-10-12', 22, { km_trasa: 20, km_dorovnani: 2 }),
    ];
    const v = sestavUzaverku({ jizdy, tachometrZacatek: 0, tachometrKonec: 36, rezim: 'rovnomerne' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.soucetTrasy).toBe(30);
    expect(v.radky.map((r) => [r.km_trasa, r.km_dorovnani, r.km_driven])).toEqual([[10, 3, 13], [20, 3, 23]]);
  });

  it('tankování (0 km s litry) se nedorovnává, jen drží tachometr v řadě', () => {
    const tank = jizda('2026-10-12', 0, { fuel_liters: 40 });
    const jizdy = [jizda('2026-10-05', 10), tank, jizda('2026-10-20', 20)];
    expect(jeTankovani(tank)).toBe(true);
    const v = sestavUzaverku({ jizdy, tachometrZacatek: 100, tachometrKonec: 140, rezim: 'rovnomerne' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.pocetJizd).toBe(2);
    const t = v.radky.find((r) => r.id === tank.id)!;
    expect([t.km_trasa, t.km_dorovnani, t.km_driven]).toEqual([0, 0, 0]);
    expect(t.km_start).toBe(t.km_end);
    expect(t.km_start).toBe(115); // 100 + první jízda 10 + její díl rozdílu 5
    expect(v.radky.map((r) => r.km_driven)).toEqual([15, 0, 25]);
    expect(v.radky[2].km_end).toBe(140);
  });

  it('jen tankování a žádná jízda = nic k uzavření', () => {
    const v = sestavUzaverku({ jizdy: [jizda('2026-10-05', 0, { fuel_liters: 30 })], tachometrZacatek: 0, tachometrKonec: 0, rezim: 'rovnomerne' });
    expect(v.ok).toBe(false);
  });

  it('bez jízd nejde uzavřít', () => {
    const v = sestavUzaverku({ jizdy: [], tachometrZacatek: 0, tachometrKonec: 10, rezim: 'rovnomerne' });
    expect(v).toEqual({ ok: false, chyba: 'V měsíci nejsou žádné jízdy, není co uzavřít.' });
  });

  it('konec měsíce pod začátkem a nečísla jsou chyba', () => {
    const nizsi = sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 990, rezim: 'rovnomerne' });
    expect(nizsi.ok).toBe(false);
    expect(!nizsi.ok && nizsi.chyba).toMatch(/nižší než na začátku/);
    expect(sestavUzaverku({ jizdy: dva(), tachometrZacatek: NaN, tachometrKonec: 1, rezim: 'rovnomerne' }).ok).toBe(false);
    expect(sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1, tachometrKonec: Infinity, rezim: 'rovnomerne' }).ok).toBe(false);
  });

  it('tachometr ujel mnohem míň, než dávají trasy → jízdy se zkrátí, ale nikdy pod nulu, a je to vidět v upozornění', () => {
    const v = sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 1010, rezim: 'rovnomerne' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.radky.map((r) => r.km_driven)).toEqual([0, 0, 10]);
    v.radky.forEach((r) => expect(r.km_driven).toBeGreaterThanOrEqual(0));
    expect(v.radky[2].km_end).toBe(1010);
    expect(v.upozorneni.some((u) => /velký/.test(u))).toBe(true);
  });

  it('tachometr se za měsíc nehnul → všechny jízdy na nulu (a velké upozornění)', () => {
    const v = sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 1000, rezim: 'rovnomerne' });
    expect(v.ok && v.radky.map((r) => r.km_driven)).toEqual([0, 0, 0]);
  });

  it('navazuje na už uzavřený minulý měsíc a na už uzavřený následující', () => {
    const zaklad = { jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 1066, rezim: 'rovnomerne' as const };
    expect(sestavUzaverku({ ...zaklad, tachometrMinulyMesic: 1000, tachometrNaslednyMesic: 1066 }).ok).toBe(true);
    const spatnyZacatek = sestavUzaverku({ ...zaklad, tachometrMinulyMesic: 990 });
    expect(spatnyZacatek.ok).toBe(false);
    expect(bezNbsp(!spatnyZacatek.ok ? spatnyZacatek.chyba : '')).toMatch(/minulý měsíc končí na 990 km.*začíná na 1 000 km/);
    const spatnyKonec = sestavUzaverku({ ...zaklad, tachometrNaslednyMesic: 1070 });
    expect(spatnyKonec.ok).toBe(false);
    expect(bezNbsp(!spatnyKonec.ok ? spatnyKonec.chyba : '')).toMatch(/další měsíc začíná na 1 070 km.*končí na 1 066 km/);
  });

  it('upozorní na velký rozdíl a na jízdy bez spočítané trasy', () => {
    const v = sestavUzaverku({
      jizdy: [jizda('2026-10-05', 0), jizda('2026-10-06', 40)], tachometrZacatek: 0, tachometrKonec: 400, rezim: 'rovnomerne',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.upozorneni.some((u) => /velký/i.test(u))).toBe(true);
    expect(v.upozorneni.some((u) => /0 km z trasy/.test(u))).toBe(true);
  });

  it('malý rozdíl žádné upozornění nedává', () => {
    const v = sestavUzaverku({ jizdy: dva(), tachometrZacatek: 1000, tachometrKonec: 1066, rezim: 'rovnomerne' });
    expect(v.ok && v.upozorneni).toEqual([]);
  });

  it('desetinná čísla: součet jízd i konec měsíce sedí na desetinu kilometru', () => {
    const v = sestavUzaverku({
      jizdy: [jizda('2026-10-05', 12.3), jizda('2026-10-06', 7.7), jizda('2026-10-07', 20.1)],
      tachometrZacatek: 50000, tachometrKonec: 50043, rezim: 'umerne',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const soucet = Math.round(v.radky.reduce((s, r) => s + r.km_driven, 0) * 10) / 10;
    expect(soucet).toBe(43);
    expect(v.radky[2].km_end).toBe(50043);
    // řada na sebe navazuje bez mezer
    expect(v.radky[1].km_start).toBe(v.radky[0].km_end);
    expect(v.radky[2].km_start).toBe(v.radky[1].km_end);
  });
});

describe('stavMesice', () => {
  const z = (vehicle_name: string, date: string, uzavreno_at: string | null = null) => ({ vehicle_name, date, uzavreno_at });

  it('otevřený, uzavřený a částečně uzavřený měsíc (každé auto zvlášť)', () => {
    const jizdy = [
      z('Velké auto', '2026-10-05', '2026-11-01T10:00:00Z'), z('Velké auto', '2026-10-12', '2026-11-01T10:00:00Z'),
      z('Kachna', '2026-10-06'),
      z('Velké auto', '2026-09-30'),
      z('Kachna', '2026-10-20', '2026-11-02T10:00:00Z'),
    ];
    expect(stavMesice(jizdy, 'Velké auto', '2026-10')).toBe('uzavreno');
    expect(stavMesice(jizdy, 'Kachna', '2026-10')).toBe('castecne');
    expect(stavMesice(jizdy, 'Velké auto', '2026-09')).toBe('otevreno');
    expect(stavMesice(jizdy, 'Velké auto', '2026-08')).toBe('otevreno'); // žádné jízdy = otevřeno
  });
});
