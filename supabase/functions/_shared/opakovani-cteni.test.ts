import { describe, expect, it } from 'vitest';
import {
  casPoslednihoPokusu, casProCteni, cekaNaDalsiPokus, jeDocasnaChyba, jeNaRade, jeUvizla, jeZnackaCteSe, koloCteni, poChybeCteni,
  poradiZpracovani, poznamkaCeka, rezimCteniFotky, znackaCteSe, MIN_CAS_FOTKA_MS, ODSTUP_POKUSU_MS, POZNAMKA_CEKA, REZIE_CTENI_MS,
  STROP_BEHU_MS, UVIZLA_PO_MS,
} from './opakovani-cteni';
import { JISTY_CAS_POZADAVKU_MS, STROP_CTENI_MS, stropCteni } from './cas-cteni';

const TED = Date.parse('2026-11-17T09:35:00.000Z');
const MIN = 60_000;

describe('po neúspěšném čtení: čekat na další pokus, nebo chyba', () => {
  it('17. 11. 2026: server čtení fotky ukončil (HTTP 546) → zpráva čeká a zkusí se znovu, ne „chyba"', () => {
    const v = poChybeCteni({ status: 546, chyba: 'Parse API error: 546', stariMs: 3 * MIN, ted: TED });
    expect(v.status).toBe('pending');
    expect(v.error_message).toBe('AI je teď přetížená — zkusí se znovu automaticky za pár minut. (pokus 2026-11-17T09:35:00.000Z)');
  });

  it('dočasné jsou všechny 5xx, 429, 408 i volání bez odpovědi; 4xx (špatný požadavek, přihlášení) ne', () => {
    for (const s of [500, 502, 503, 504, 546, 429, 408, null]) expect(jeDocasnaChyba(s), String(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 413]) expect(jeDocasnaChyba(s), String(s)).toBe(false);
  });

  it('trvalá chyba (400) → hned „chyba" s textem, který přišel', () => {
    expect(poChybeCteni({ status: 400, chyba: 'Missing rawText or imageBase64', stariMs: MIN, ted: TED }))
      .toEqual({ status: 'error', error_message: 'Missing rawText or imageBase64' });
    expect(poChybeCteni({ status: 401, chyba: '', stariMs: MIN, ted: TED }).error_message).toBe('Čtení se nepovedlo.');
  });

  it('po hodině se už nečeká: „chyba" s radou, co dál (ne technický kód sám)', () => {
    const v = poChybeCteni({ status: 546, chyba: 'Parse API error: 546', stariMs: 61 * MIN, ted: TED });
    expect(v.status).toBe('error');
    expect(v.error_message).toBe('AI je přetížená a zprávu se nepodařilo přečíst ani po opakování (kód 546). Zkus později „Znovu parsovat“.');
    expect(poChybeCteni({ status: null, chyba: 'x', stariMs: 61 * MIN, ted: TED }).error_message)
      .toBe('AI je přetížená a zprávu se nepodařilo přečíst ani po opakování. Zkus později „Znovu parsovat“.');
    // Těsně před hodinou se ještě čeká.
    expect(poChybeCteni({ status: 502, chyba: 'x', stariMs: 59 * MIN, ted: TED }).status).toBe('pending');
  });
});

describe('odstup mezi pokusy (otevřená appka nesmí přetíženou AI zkoušet pořád dokola)', () => {
  const poznamka = poznamkaCeka(TED);

  it('pozná čekající zprávu a čas jejího posledního pokusu', () => {
    expect(cekaNaDalsiPokus(poznamka)).toBe(true);
    expect(casPoslednihoPokusu(poznamka)).toBe(TED);
    // Starší poznámka bez času (psala ji předchozí verze funkce).
    expect(cekaNaDalsiPokus(POZNAMKA_CEKA)).toBe(true);
    expect(casPoslednihoPokusu(POZNAMKA_CEKA)).toBeNull();
    for (const jine of [null, undefined, '', 'Parse API error: 546', 'Odesílatel není povolený']) {
      expect(cekaNaDalsiPokus(jine)).toBe(false);
      expect(casPoslednihoPokusu(jine)).toBeNull();
    }
  });

  it('zpráva bez poznámky je na řadě vždy; čekající až po odstupu', () => {
    expect(jeNaRade(null, TED)).toBe(true);
    expect(jeNaRade('store-failed: x', TED)).toBe(true);
    expect(jeNaRade(poznamka, TED + 1_500)).toBe(false);              // appka zavolá čtení hned po změně zprávy
    expect(jeNaRade(poznamka, TED + ODSTUP_POKUSU_MS - 1)).toBe(false);
    expect(jeNaRade(poznamka, TED + ODSTUP_POKUSU_MS)).toBe(true);
  });

  it('cron po 3 minutách se do odstupu vejde, i když pokus trval celou minutu', () => {
    // Pokus začal s cronem, trval 60 s a tehdy se zapsala poznámka; další cron je 120 s po ní.
    expect(jeNaRade(poznamka, TED + 120_000)).toBe(true);
    expect(ODSTUP_POKUSU_MS).toBeLessThanOrEqual(120_000);
  });

  it('poznámka bez času nebo s rozbitým časem zprávu nezablokuje', () => {
    expect(jeNaRade(POZNAMKA_CEKA, TED)).toBe(true);
    expect(jeNaRade(`${POZNAMKA_CEKA} (pokus nesmyslT99:99Z)`, TED)).toBe(true);
  });
});

describe('čas jednoho běhu (server dá jistých 75 s)', () => {
  it('celý běh i s jedním čtením a rezervou se vejde do jistého času', () => {
    expect(STROP_BEHU_MS).toBeLessThan(JISTY_CAS_POZADAVKU_MS - 5_000);
    expect(STROP_CTENI_MS + REZIE_CTENI_MS).toBeLessThanOrEqual(STROP_BEHU_MS);
    expect(STROP_CTENI_MS).toBeLessThan(JISTY_CAS_POZADAVKU_MS - 15_000);
  });

  it('na začátku běhu dostane čtení skoro celý strop', () => {
    expect(casProCteni({ ubehloMs: 0, fotka: true })).toBe(STROP_CTENI_MS);
    expect(casProCteni({ ubehloMs: 2_000, fotka: true })).toBe(57_000);
    expect(casProCteni({ ubehloMs: 2_000, fotka: false })).toBe(57_000);
  });

  it('začátek čtení + přidělený čas + režie nikdy nepřeleze strop běhu', () => {
    for (let ubehlo = 0; ubehlo <= 70_000; ubehlo += 500) {
      for (const fotka of [true, false]) {
        const cas = casProCteni({ ubehloMs: ubehlo, fotka });
        if (cas !== null) expect(ubehlo + cas + REZIE_CTENI_MS).toBeLessThanOrEqual(STROP_BEHU_MS);
      }
    }
  });

  it('fotka potřebuje aspoň 45 s — po pár textech se už nezačíná a počká na další běh', () => {
    expect(casProCteni({ ubehloMs: 14_000, fotka: true })).toBe(MIN_CAS_FOTKA_MS);
    expect(casProCteni({ ubehloMs: 14_001, fotka: true })).toBeNull();
    expect(casProCteni({ ubehloMs: 20_000, fotka: true })).toBeNull();
  });

  it('text se čte, dokud zbývá aspoň 12 s', () => {
    expect(casProCteni({ ubehloMs: 40_000, fotka: false })).toBe(19_000);
    expect(casProCteni({ ubehloMs: 47_000, fotka: false })).toBe(12_000);
    expect(casProCteni({ ubehloMs: 47_001, fotka: false })).toBeNull();
    expect(casProCteni({ ubehloMs: 80_000, fotka: false })).toBeNull();
  });

  it('strop čtení: volající smí poslat jen míň, nikdy víc; nesmysl = výchozí', () => {
    expect(stropCteni(undefined)).toBe(STROP_CTENI_MS);
    expect(stropCteni('30000')).toBe(STROP_CTENI_MS);
    expect(stropCteni(Number.NaN)).toBe(STROP_CTENI_MS);
    expect(stropCteni(140_000)).toBe(STROP_CTENI_MS);
    expect(stropCteni(45_000)).toBe(45_000);
    expect(stropCteni(45_000.6)).toBe(45_001);
    expect(stropCteni(500)).toBe(10_000);
    expect(stropCteni(-5)).toBe(10_000);
  });
});

describe('pořadí zpráv v běhu a režim čtení fotky', () => {
  it('texty před fotkami, obojí od nejstarší (fotka nesmí zdržet texty za sebou)', () => {
    const z = [
      { id: 'fotka-stará', media_url: 'https://x/a.jpg', created_at: '2026-11-17T09:32:41Z' },
      { id: 'text-2', media_url: null, created_at: '2026-11-17T09:48:46Z' },
      { id: 'fotka-nová', media_url: 'https://x/b.jpg', created_at: '2026-11-17T09:50:00Z' },
      { id: 'text-1', created_at: '2026-11-17T09:32:50Z' },
    ];
    expect(poradiZpracovani(z).map((x) => x.id)).toEqual(['text-1', 'text-2', 'fotka-stará', 'fotka-nová']);
    expect(z.map((x) => x.id)).toEqual(['fotka-stará', 'text-2', 'fotka-nová', 'text-1']); // vstup se nemění
  });

  it('řadí podle času, ne podle textu (databáze vrací různě dlouhé zlomky vteřiny)', () => {
    const z = [
      { id: 'c', created_at: '2026-11-17T09:32:41.5+00:00' },
      { id: 'a', created_at: '2026-11-17T09:32:41.316205+00:00' },
      { id: 'b', created_at: '2026-11-17T09:32:41.31621+00:00' },
      { id: 'd', created_at: '2026-11-17T10:32:42+01:00' },
    ];
    expect(poradiZpracovani(z).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('čerstvá fotka čeká jen na nejlepší čtení, po 6 minutách se čte vším', () => {
    expect(rezimCteniFotky(0)).toBe('nejlepsi');
    expect(rezimCteniFotky(6 * MIN - 1)).toBe('nejlepsi');
    expect(rezimCteniFotky(6 * MIN)).toBe('vse');
    expect(rezimCteniFotky(3 * 60 * MIN)).toBe('vse');
  });

  it('kolo čtení roste po třech minutách (střídá náhradní modely)', () => {
    expect([0, 179_999, 180_000, 6 * MIN, 61 * MIN].map(koloCteni)).toEqual([0, 0, 1, 2, 20]);
    expect(koloCteni(-5_000)).toBe(0);
  });
});

describe('zpráva nesmí zůstat viset „ve zpracování" (v seznamu ke kontrole není vidět)', () => {
  const znacka = znackaCteSe(TED);

  it('převzatá zpráva nese značku s časem převzetí; není to chyba ani čekání na další pokus', () => {
    expect(znacka).toBe('Čte se (od 2026-11-17T09:35:00.000Z)');
    expect(jeZnackaCteSe(znacka)).toBe(true);
    expect(cekaNaDalsiPokus(znacka)).toBe(false);
    for (const jine of [null, undefined, '', 'Parse API error: 546', poznamkaCeka(TED)]) expect(jeZnackaCteSe(jine)).toBe(false);
  });

  it('běh, který ji čte, ji nesmí nikdo vzít: do pěti minut není uvízlá', () => {
    expect(jeUvizla(znacka, TED + 1_500)).toBe(false);
    expect(jeUvizla(znacka, TED + 150_000)).toBe(false);   // nejdelší možný běh (server končí ve 150 s)
    expect(jeUvizla(znacka, TED + UVIZLA_PO_MS - 1)).toBe(false);
    expect(jeUvizla(znacka, TED + UVIZLA_PO_MS)).toBe(true);
    expect(UVIZLA_PO_MS).toBeGreaterThan(150_000);
  });

  it('zpráva bez značky (uvízlá ze září) ani s rozbitou značkou se nevrací — stará objednávka nemá vyskočit jako nová', () => {
    expect(jeUvizla(null, TED + 90 * 24 * 60 * MIN)).toBe(false);
    expect(jeUvizla('', TED)).toBe(false);
    expect(jeUvizla('Čte se (od včerejška)', TED + UVIZLA_PO_MS)).toBe(false);
    expect(jeUvizla(poznamkaCeka(TED), TED + UVIZLA_PO_MS)).toBe(false);
  });

  it('zpráva vrácená do fronty se značkou je hned na řadě', () => {
    expect(jeNaRade(znacka, TED + 1)).toBe(true);
  });
});
