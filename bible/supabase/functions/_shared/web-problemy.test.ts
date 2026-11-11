// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUVERA_WEBU, filtrujWeb, prehledWebu, STAVY_WEBU, webZdrojeText } from './web-popisy';
import { kdoZapsal, prehledProblemu, problemText, seznamProblemuText, STAVY_PROBLEMU, STAVY_ZJISTENI, TYPY_ZJISTENI } from './problemy-popisy';
import { INSTRUKCE, NASTROJE } from './mcp';
import type { VarkaData } from './varky-popisy';

// Vymyšlené zdroje a problémy — žádná skutečná data.
const SQL = readFileSync('bible/supabase/migrations/20261111020000_bible_web_problemy.sql', 'utf8');
const W1 = 'aaaaaaaa-1111-2222-3333-000000000001';
const W2 = 'aaaaaaaa-1111-2222-3333-000000000002';
const P1 = 'bbbbbbbb-1111-2222-3333-000000000001';
const V1 = 'cccccccc-1111-2222-3333-000000000001';
const V2 = 'cccccccc-1111-2222-3333-000000000002';

describe('webové zdroje (etapa 9)', () => {
  it('stavy a typy odpovídají SQL kontrolám', () => {
    expect(SQL).toContain(`stav IN (${STAVY_WEBU.map((s) => `'${s.id}'`).join(', ')})`);
    expect(SQL).toContain(`typ IN (${TYPY_ZJISTENI.map((t) => `'${t.id}'`).join(', ')})`);
    expect(SQL).toContain(`stav IN (${STAVY_PROBLEMU.map((s) => `'${s.id}'`).join(', ')})`);
    expect(SQL).toContain(`stav IN (${STAVY_ZJISTENI.map((s) => `'${s.id}'`).join(', ')})`);
    expect(DUVERA_WEBU.map((d) => d.uroven)).toEqual([1, 2, 3, 4, 5]);
    expect(SQL).toContain('duvera BETWEEN 1 AND 5');
  });

  const data = [
    { id: W1, url: 'https://example.org/chmel', titulek: 'Chmelení za studena', vydavatel: 'Pivovarský časopis', datum_publikace: '2025-04-01', zjisteno: '2026-11-11',
      shrnuti: 'Shrnutí vlastními slovy o dry hoppingu.', oblasti: ['F', 'x'], duvera: 3, stav: 'overeno', overil_jmeno: 'Správce', pres_claude: true, zapsal_jmeno: 'Honza' },
    { id: W2, url: 'https://forum.example.com/vlakno', titulek: 'Diskuse o pěnivosti', zjisteno: '2026-11-10', shrnuti: 'Názory sládků.', oblasti: [], duvera: 9, stav: 'divny' },
    { id: 'x', url: 'javascript:alert(1)', titulek: 'Zlý', shrnuti: 'X' },
  ];

  it('přehled: jen http(s) adresy, neznámý stav = neověřeno, důvěra mimo 1–5 = 5', () => {
    const z = prehledWebu(data);
    expect(z.map((x) => x.id)).toEqual([W1, W2]);
    expect(z[0].oblasti).toEqual(['F']);
    expect(z[1]).toMatchObject({ stav: 'neovereno', duvera: 5, datum_publikace: null });
  });

  it('filtr: slova bez diakritiky, stav, oblast', () => {
    const z = prehledWebu(data);
    expect(filtrujWeb(z, { dotaz: 'chmeleni studena' }).map((x) => x.id)).toEqual([W1]);
    expect(filtrujWeb(z, { stavy: ['neovereno'] }).map((x) => x.id)).toEqual([W2]);
    expect(filtrujWeb(z, { oblast: 'F' }).map((x) => x.id)).toEqual([W1]);
    expect(filtrujWeb(z, { dotaz: 'forum.example' }).map((x) => x.id)).toEqual([W2]);
  });

  it('text pro Clauda: INTERNET odděleně od literatury, stav, důvěra, data', () => {
    const t = webZdrojeText(prehledWebu(data), 2);
    expect(t).toMatch(/^# Webové zdroje \(2\)/);
    expect(t).toMatch(/INTERNET, ne literatura/);
    expect(t).toMatch(/nikdy nepřepisuje to, co říkají knihy/);
    expect(t).toContain('- Stav: ověřeno (Správce)');
    expect(t).toContain('- Důvěra: 3 — Odborný časopis nebo článek');
    expect(t).toContain('- Publikováno: 1. 4. 2025; zjištěno: 11. 11. 2026; vydavatel: Pivovarský časopis');
    expect(t).toContain('- Publikováno: neuvedeno; zjištěno: 10. 11. 2026');
    expect(webZdrojeText([], 0)).toMatch(/Rešerše z internetu je zatím prázdná/);
    expect(webZdrojeText([], 3)).toMatch(/nic není/);
  });
});

describe('analýza problémů (etapa 10)', () => {
  const data = [{
    id: P1, nazev: 'Nižší výtěžek', popis: 'Poslední dvě várky o 3 % méně.', pivo: 'Ležák 11', varky: [V1, V2, 'spatne-id'], oblasti: ['T', 'E'],
    stav: 'otevreny', reseni: null, zapsal_jmeno: 'Honza', pres_claude: false,
    zjisteni: [
      { id: 'z1', typ: 'vypocet', text: 'Varní výtěžek klesl z 65,5 na 61,9 %.', zdroj: 'výpočet Varní výtěžek, várky 112 a 114', stav: 'navrzeno', zapsal_jmeno: 'Honza', pres_claude: true },
      { id: 'z2', typ: 'hypoteza', text: 'Hrubší šrot po výměně válců.', zdroj: null, stav: 'potvrzeno', zapsal_jmeno: 'Honza', pres_claude: true },
      { id: 'z3', typ: 'chybi', text: 'Granulometrie šrotu není zapsaná.', stav: 'navrzeno', zapsal_jmeno: 'Petr', pres_claude: false },
      { id: 'z4', typ: 'domnenka', text: 'X' },
    ],
  }];
  const varky: VarkaData[] = [
    { id: V1, receptura_id: null, cislo: '112', pivo: 'Ležák 11', datum_varu: '2026-11-03', hodnoty: { mladina_objem_hl: 10.4, mladina_p: 11.3, sypani_kg: 180 }, poznamka: null },
    { id: V2, receptura_id: null, cislo: '114', pivo: 'Ležák 11', datum_varu: '2026-11-10', hodnoty: { mladina_objem_hl: 10.1, mladina_p: 11.0, sypani_kg: 180 }, poznamka: null },
  ];

  it('přehled: neznámý typ zjištění vynechá, vadná id várek zahodí', () => {
    const p = prehledProblemu(data)[0];
    expect(p.varky).toEqual([V1, V2]);
    expect(p.zjisteni.map((z) => z.id)).toEqual(['z1', 'z2', 'z3']);
    expect(kdoZapsal(p.zjisteni[0])).toBe('Claude (konektor) za Honza');
    expect(kdoZapsal(p.zjisteni[2])).toBe('Petr');
  });

  it('seznam pro Clauda: otevřené s počty podle typu a id', () => {
    const p = prehledProblemu(data);
    const t = seznamProblemuText(p, false);
    expect(t).toContain(`- Nižší výtěžek — Otevřený, Ležák 11, várek 2, zjištění 3 (výsledek výpočtu 1, hypotéza 1, neznámá hodnota 1) — problem_id=${P1}`);
    expect(seznamProblemuText([{ ...p[0], stav: 'vyreseny' }], false)).toMatch(/Otevřený problém žádný není \(celkem 1; uzavřené ukáže vse=true\)/);
    expect(seznamProblemuText([], false)).toMatch(/zaloz_problem/);
  });

  it('detail pro Clauda: zjištění po typech se stavem a zdrojem, porovnání dotčených várek', () => {
    const t = problemText(prehledProblemu(data)[0], varky, []);
    expect(t).toMatch(/^# Problém: Nižší výtěžek/);
    expect(t).toMatch(/Hypotézu nevydávej za fakt/);
    expect(t).toContain('## Příznaky\nPoslední dvě várky o 3 % méně.');
    expect(t).toContain('### Výsledek výpočtu\n- Varní výtěžek klesl z 65,5 na 61,9 %. [zdroj: výpočet Varní výtěžek, várky 112 a 114] — Claude (konektor) za Honza');
    expect(t).toContain('### Hypotéza\n- Hrubší šrot po výměně várek'.replace('várek', 'válců') + '. (potvrzeno) — Claude (konektor) za Honza');
    expect(t).toContain('### Neznámá hodnota\n- Granulometrie šrotu není zapsaná. — Petr');
    expect(t).toContain('# Porovnání várek (2)');
    expect(t).toContain('| Varní výtěžek (výpočet) |');
    expect(problemText({ ...prehledProblemu(data)[0], varky: [] }, varky, [])).toMatch(/nejsou přiřazené žádné várky/);
  });

  it('konektor nabízí web_zdroje, uloz_web_zdroj, problemy, zaloz_problem a zapis_zjisteni; instrukce web odděluje', () => {
    expect(NASTROJE.map((n) => n.name)).toEqual(expect.arrayContaining(['web_zdroje', 'uloz_web_zdroj', 'problemy', 'zaloz_problem', 'zapis_zjisteni']));
    const uloz = NASTROJE.find((n) => n.name === 'uloz_web_zdroj')!;
    expect(uloz.description).toMatch(/vždy jako NEOVĚŘENÝ/);
    expect((uloz.inputSchema as { required: string[] }).required).toEqual(['url', 'titulek', 'shrnuti', 'duvera']);
    const zjisteni = NASTROJE.find((n) => n.name === 'zapis_zjisteni')!;
    expect((zjisteni.inputSchema as { properties: { typ: { enum: string[] } } }).properties.typ.enum).toEqual(TYPY_ZJISTENI.map((t) => t.id));
    expect(INSTRUKCE).toMatch(/Web v odpovědi vždy zvlášť od knih, s datem a stavem/);
    expect(INSTRUKCE).toMatch(/hypotézu nevydávej za fakt/);
  });
});
