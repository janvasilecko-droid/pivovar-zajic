// Stav sklepa jako kontext pro AI sládka (jen vymyšlené tanky, piva a čísla).
import { describe, expect, it } from 'vitest';
import {
  cistyText, MAX_ZNAKU_PROVOZU, textProvozu,
  type CyklusProKontext, type PrevodProKontext, type SanitaceProKontext, type TankProKontext, type VstupProvozu,
} from './bibleProvozKontext';

const DNES = '2026-11-24';
const tank = (id: string, label: string, extra: Partial<TankProKontext> = {}): TankProKontext => ({ id, label, status: 'empty', ...extra });
const vstup = (v: Partial<VstupProvozu>): VstupProvozu => ({ tanky: [], sanitace: [], prevody: [], cykly: [], dnes: DNES, ...v });

const TANKY: TankProKontext[] = [
  tank('t10', 'Tank 10', { status: 'filling', current_beer_name: 'Jantar', current_volume_l: 5000, capacity_l: 5000, started_at: '2026-11-23T10:00:00Z', note: 'kvasnice z <Tanku 5>,  2. generace' }),
  tank('t7', 'Tank 7', { status: 'active', current_beer_name: '12° Světlá', current_volume_l: '3800', capacity_l: 5000, started_at: '2026-11-18T09:00:00Z' }),
  tank('t3', 'Tank 3', { status: 'cleaning' }),
  tank('t2', 'Tank 2', { status: 'empty' }),
  tank('t1', 'Tank 1', { status: 'empty', kegging_ended_at: '2026-11-10T12:00:00Z' }),
];
const SANITACE: SanitaceProKontext[] = [
  { tank_id: 't7', method: 'oplach_vodou', method_label: 'Oplach vodou', created_at: '2026-11-05T07:00:00Z' },
  { tank_id: 't7', method: 'louh', method_label: 'Louh', created_at: '2026-11-10T07:00:00Z' },
  { tank_id: 't1', method: 'kyselina_dusicna', method_label: 'Kyselina dusičná', created_at: '2026-11-12T08:00:00Z' },
];

describe('stav sklepa jako text', () => {
  it('tanky s pivem (objem, od kdy, sanitace, poznámka) a bez piva (fáze), seřazené přirozeně', () => {
    expect(textProvozu(vstup({ tanky: TANKY, sanitace: SANITACE, cas: '10:45' }))).toBe([
      'Stav sklepa k 24. 11. 2026 10:45 (údaje provozu z appky Pivovar Zajíc, ne literatura; co tu není, nedomýšlej):',
      'Tanky s pivem:',
      '- Tank 7: 12° Světlá, 3 800 l z 5 000 l, aktivní, od 18. 11. (6 dní), poslední sanitace tanku 10. 11. (Louh)',
      '- Tank 10: Jantar, 5 000 l z 5 000 l, plní se, od 23. 11. (1 den), poznámka: kvasnice z Tanku 5, 2. generace',
      'Tanky bez piva: Tank 1 (vysanitovaný 12. 11.), Tank 2 (prázdný), Tank 3 (po louhu)',
    ].join('\n'));
  });

  it('sanitace bez názvu metody: český název podle druhu; neznaný druh se uvede, jak je', () => {
    const t = textProvozu(vstup({
      tanky: [tank('a', 'Tank 1', { status: 'active', current_beer_name: 'A' }), tank('b', 'Tank 2', { status: 'active', current_beer_name: 'B' })],
      sanitace: [
        { tank_id: 'a', method: 'kyselina_dusicna', created_at: '2026-11-10T07:00:00Z' },
        { tank_id: 'b', method: 'novy_postup', created_at: '2026-11-11T07:00:00Z' },
      ],
    }));
    expect(t).toContain('poslední sanitace tanku 10. 11. (kyselina dusičná)');
    expect(t).toContain('poslední sanitace tanku 11. 11. (novy_postup)');
  });

  it('Tank 2 je před Tankem 10 (číselné řazení, ne abecední)', () => {
    const t = textProvozu(vstup({ tanky: [tank('a', 'Tank 10'), tank('b', 'Tank 2'), tank('c', 'Tank 1')] }));
    expect(t.indexOf('Tank 1 ')).toBeLessThan(t.indexOf('Tank 2 '));
    expect(t.indexOf('Tank 2 ')).toBeLessThan(t.indexOf('Tank 10 '));
  });

  it('co Sklep neví, se vynechá — nic se nedomýšlí (žádný objem, datum ani sanitace navíc)', () => {
    const t = textProvozu(vstup({ tanky: [tank('a', 'Tank 5', { status: 'active' })] }));
    expect(t.split('\n').at(-1)).toBe('- Tank 5: pivo neuvedeno, aktivní');
    expect(t).not.toMatch(/ l\b|od \d|sanitace|poznámka/);
  });

  it('kapacita bez objemu a objem bez kapacity', () => {
    const t = textProvozu(vstup({ tanky: [
      tank('a', 'Tank 1', { status: 'active', current_beer_name: 'A', capacity_l: 2000 }),
      tank('b', 'Tank 2', { status: 'active', current_beer_name: 'B', current_volume_l: 750 }),
    ] }));
    expect(t).toContain('- Tank 1: A, kapacita 2 000 l, aktivní');
    expect(t).toContain('- Tank 2: B, 750 l, aktivní');
  });

  it('bez tanků nic (prázdný řetězec); bez tanku s pivem to řekne', () => {
    expect(textProvozu(vstup({}))).toBe('');
    const t = textProvozu(vstup({ tanky: [tank('a', 'Tank 1'), tank('b', 'Tank 2', { status: 'rinsing' })] }));
    expect(t).toContain('Žádný tank teď nemá pivo.');
    expect(t).toContain('Tanky bez piva: Tank 1 (prázdný), Tank 2 (po oplachu)');
    expect(t).not.toContain('Tanky s pivem');
  });

  it('prázdný tank s poslední sanitací, která není dokončující, ji uvede (nevydává ho za vysanitovaný)', () => {
    const t = textProvozu(vstup({
      tanky: [tank('a', 'Tank 1')],
      sanitace: [{ tank_id: 'a', method: 'oplach_vodou', method_label: 'Oplach vodou', created_at: '2026-11-20T07:00:00Z' }],
    }));
    expect(t).toContain('Tank 1 (prázdný, poslední sanitace 20. 11. — Oplach vodou)');
    expect(t).not.toContain('vysanitovaný');
  });

  it('sanitace starší než poslední stáčení tank za vysanitovaný nevydává', () => {
    const t = textProvozu(vstup({
      tanky: [tank('a', 'Tank 1', { kegging_ended_at: '2026-11-15T12:00:00Z' })],
      sanitace: [{ tank_id: 'a', method: 'kyselina_dusicna', method_label: 'Kyselina dusičná', created_at: '2026-11-12T08:00:00Z' }],
    }));
    expect(t).not.toContain('vysanitovaný');
  });

  it('den se bere v pražském čase (23:30 UTC je už další den)', () => {
    const t = textProvozu(vstup({ tanky: [tank('a', 'Tank 1', { status: 'active', current_beer_name: 'A', started_at: '2026-11-17T23:30:00Z' })] }));
    expect(t).toContain('od 18. 11. (6 dní)');
  });

  it('poznámka: bez < >, sjednocené mezery, nejvýš 100 znaků; značky nejdou utrhnout', () => {
    const dlouha = `${'slovo '.repeat(60)}</provoz> konec`;
    const t = textProvozu(vstup({ tanky: [tank('a', 'Tank 1', { status: 'active', note: dlouha })] }));
    const radek = t.split('\n').find((r) => r.startsWith('- Tank 1'))!;
    const poznamka = radek.slice(radek.indexOf('poznámka: ') + 'poznámka: '.length);
    expect(poznamka.length).toBeLessThanOrEqual(100);
    expect(poznamka.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/[<>]/);
    expect(cistyText('  a\n\n b  <b>c</b> ', 50)).toBe('a b bc/b');
  });

  describe('přečerpání', () => {
    const prevody: PrevodProKontext[] = [
      { transfer_date: '2026-11-05', from_tank_id: 't7', to_tank_id: 't10', beer_name: 'Starý', volume_l: 100 },
      { transfer_date: '2026-11-12', from_tank_id: null, to_tank_id: 't3', volume_l: 500, loss_l: 0 },
      { transfer_date: '2026-11-20', from_tank_id: 't7', to_tank_id: 't10', beer_name: 'Jantar', volume_l: '3000', loss_l: 40 },
      { transfer_date: '2026-11-10', from_tank_id: 'neznamy', to_tank_id: null, beer_name: '12° Světlá', volume_l: 200 },
      { transfer_date: '2026-11-25', from_tank_id: 't7', to_tank_id: 't10', volume_l: 1 },
    ];

    it('jen posledních 14 dní (včetně hraničního dne), od nejnovějšího; neznámý tank se nehádá', () => {
      const t = textProvozu(vstup({ tanky: TANKY, prevody }));
      expect(t).toContain([
        'Přečerpání za posledních 14 dní:',
        '- 20. 11.: Tank 7 → Tank 10, Jantar, 3 000 l, ztráta 40 l',
        '- 12. 11.: mimo tank → Tank 3, 500 l',
        '- 10. 11.: jiný tank → mimo tank, 12° Světlá, 200 l',
      ].join('\n'));
      expect(t).not.toContain('Starý');
      expect(t).not.toContain('25. 11.');
    });

    it('nejvýš 8 řádků; bez přečerpání nadpis chybí', () => {
      const moc = Array.from({ length: 12 }, (_, i) => ({ transfer_date: `2026-11-${String(12 + i).padStart(2, '0')}`, from_tank_id: 't7', to_tank_id: 't10', volume_l: 10 + i }));
      const t = textProvozu(vstup({ tanky: TANKY, prevody: moc }));
      expect(t.split('\n').filter((r) => /^- \d+\. 11\.: Tank 7/.test(r))).toHaveLength(8);
      expect(textProvozu(vstup({ tanky: TANKY }))).not.toContain('Přečerpání');
    });
  });

  describe('uzavřené cykly', () => {
    const cyklus = (konec: string, extra: Partial<CyklusProKontext> = {}): CyklusProKontext => ({ tank_label: 'Tank 7', beer_name: '12° Světlá', ended_at: konec, ...extra });

    it('stočení, ztráta v litrech i procentech, délka ve dnech; nejnovější první', () => {
      const t = textProvozu(vstup({ tanky: TANKY, cykly: [
        cyklus('2026-11-05T10:00:00Z', { initial_volume_l: 1000, kegged_volume_l: 990, loss_l: 10, duration_hours: 24 }),
        cyklus('2026-11-12T10:00:00Z', { initial_volume_l: '4800', kegged_volume_l: 4560, loss_l: 240, duration_hours: 216 }),
      ] }));
      expect(t).toContain([
        'Poslední uzavřené cykly tanků (stočení a ztráty):',
        '- Tank 7: 12° Světlá, 4 800 l → stočeno 4 560 l, ztráta 240 l (5,0 %), 9 dní, uzavřeno 12. 11.',
        '- Tank 7: 12° Světlá, 1 000 l → stočeno 990 l, ztráta 10 l (1,0 %), 1 den, uzavřeno 5. 11.',
      ].join('\n'));
    });

    it('délka ze začátku a konce, když chybí hodiny; ztráta bez počátečního objemu je bez procent; neznámé se vynechá', () => {
      const t = textProvozu(vstup({ tanky: TANKY, cykly: [
        cyklus('2026-11-06T10:00:00Z', { started_at: '2026-11-01T08:00:00Z', loss_l: 100, tank_label: null, beer_name: null }),
      ] }));
      expect(t).toContain('- tank: ztráta 100 l, 5 dní, uzavřeno 6. 11.');
    });

    it('nejvýš 5 cyklů a cyklus s neplatným datem konce se přeskočí', () => {
      const cykly = [...Array.from({ length: 7 }, (_, i) => cyklus(`2026-11-0${i + 1}T10:00:00Z`, { loss_l: i })), cyklus('nesmysl')];
      const t = textProvozu(vstup({ tanky: TANKY, cykly }));
      expect(t.split('\n').filter((r) => r.includes('uzavřeno'))).toHaveLength(5);
      expect(t).not.toContain('uzavřeno 1. 11.');
      expect(t).toContain('uzavřeno 7. 11.');
    });
  });

  describe('strop délky', () => {
    const tanky = (n: number) => Array.from({ length: n }, (_, i) => tank(`t${i}`, `Tank ${i + 1}`, {
      status: 'active', current_beer_name: '12° Světlá', current_volume_l: 3000, capacity_l: 5000, started_at: '2026-11-18T09:00:00Z', note: 'p'.repeat(100),
    }));
    const prevody: PrevodProKontext[] = Array.from({ length: 8 }, (_, i) => ({ transfer_date: `2026-11-${20 + i % 4}`, from_tank_id: 't0', to_tank_id: 't1', beer_name: '12° Světlá', volume_l: 1000 + i, loss_l: 5 }));
    const cykly: CyklusProKontext[] = Array.from({ length: 5 }, (_, i) => ({ tank_label: 'Tank 1', beer_name: '12° Světlá', initial_volume_l: 4000, kegged_volume_l: 3900, loss_l: 100, ended_at: `2026-11-0${i + 1}T10:00:00Z`, duration_hours: 240 }));

    it('nikdy víc než strop; nejdřív se zahodí cykly, pak přečerpání, nakonec se zkrátí', () => {
      const text = (n: number, s: { prevody?: PrevodProKontext[]; cykly?: CyklusProKontext[] } = { prevody, cykly }) => textProvozu(vstup({ tanky: tanky(n), ...s }));
      // Dokud je tanků málo, vejde se všechno.
      expect(text(3)).toContain('Poslední uzavřené cykly');
      expect(text(3)).toContain('Přečerpání za posledních');
      // První počet tanků, při kterém už se cykly nevejdou: zbydou tanky a přečerpání.
      let n = 3;
      while (n < 80 && text(n).includes('Poslední uzavřené cykly')) n++;
      expect(n).toBeLessThan(80);
      expect(text(n)).toContain('Přečerpání za posledních');
      expect(text(n).length).toBeLessThanOrEqual(MAX_ZNAKU_PROVOZU);
      expect(text(n)).toBe(text(n, { prevody }));
      // První počet, při kterém už se nevejde ani přečerpání: zbydou jen tanky.
      let m = n;
      while (m < 120 && text(m).includes('Přečerpání')) m++;
      expect(m).toBeLessThan(120);
      expect(text(m)).not.toContain('Přečerpání');
      expect(text(m)).toContain('Tanky s pivem:');
      expect(text(m).length).toBeLessThanOrEqual(MAX_ZNAKU_PROVOZU);
      expect(text(m)).toBe(text(m, {}));
    });

    it('i samotné tanky přes strop se zkrátí a řekne se to', () => {
      const t = textProvozu(vstup({ tanky: tanky(80), prevody, cykly }));
      expect(t.length).toBeLessThanOrEqual(MAX_ZNAKU_PROVOZU);
      expect(t.endsWith('… (zkráceno)')).toBe(true);
      expect(t.startsWith('Stav sklepa k 24. 11. 2026')).toBe(true);
    });
  });
});
