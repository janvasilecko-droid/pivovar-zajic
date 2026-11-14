// @vitest-environment node
// Zápis z provozu přes konektor (R32): zapis_varku, dopln_varku, zapis_zkusenost.
// Falešná databáze — žádná skutečná data. Hlídá stejné kontroly jako formulář
// appky, pojistky proti zápisu navíc a to, že uloženou hodnotu nic nepřepíše
// bez výslovné opravy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JEN_KONEKTOR, nastrojeChatu } from './chat';
import { ChybaNastroje, INSTRUKCE, NASTROJE, zpracujZpravu } from './mcp';
import { zavolejNastroj, type Pripojeny } from './nastroje';
import { HODNOTY_VARKY } from './varky-popisy';
import { TYPY_ZKUSENOSTI } from './vstupy';
import { MAX_ZDROJU_ODPOVEDI, odkazNaStranu, odkazyNaCitace, stranyVOdpovedi } from './odpoved-claude';

const PIVOVAR = 'aaaaaaaa-0000-4000-8000-000000000001';
const PIVOVAR_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const RECEPTURA = 'bbbbbbbb-0000-4000-8000-000000000001';
const VARKA = 'cccccccc-0000-4000-8000-000000000001';
const NOVA = 'cccccccc-0000-4000-8000-0000000000ff';
const HONZA: Pripojeny = { uzivatel: 'dddddddd-0000-4000-8000-000000000001', jmeno: 'Honza', pristup: 'prispiva' };

type Chyba = { code: string; message?: string };
type Radek = Record<string, unknown>;

/** Falešný klient supabase: from().select().eq().limit()/maybeSingle() nad řádky a rpc() se záznamem volání. */
function falesnaDb(o: {
  tabulky?: Record<string, Radek[]>;
  chybaTabulky?: Record<string, Chyba>;
  rpc?: (jmeno: string, params: Record<string, unknown>) => { data?: unknown; error?: Chyba | null };
} = {}) {
  const rpc: [string, Record<string, unknown>][] = [];
  const db = {
    from(tabulka: string) {
      const filtry: [string, unknown][] = [];
      let limit = Infinity;
      const vysledek = () => {
        const chyba = o.chybaTabulky?.[tabulka];
        if (chyba) return { data: null, error: chyba };
        const sedi = (r: Radek, k: string, v: unknown) => (v && typeof v === 'object' && 'vSeznamu' in v
          ? (v as { vSeznamu: unknown[] }).vSeznamu.includes(r[k]) : r[k] === v);
        return { data: (o.tabulky?.[tabulka] ?? []).filter((r) => filtry.every(([k, v]) => sedi(r, k, v))).slice(0, limit), error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtry.push([k, v]); return q; },
        in: (k: string, v: unknown[]) => { filtry.push([k, { vSeznamu: v }]); return q; },
        limit: (n: number) => { limit = n; return q; },
        maybeSingle: async () => { const r = vysledek(); return r.error ? r : { data: r.data?.[0] ?? null, error: null }; },
        then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(vysledek()).then(ok, ko),
      };
      return q;
    },
    rpc: async (jmeno: string, params: Record<string, unknown>) => {
      rpc.push([jmeno, params]);
      return o.rpc ? { data: null, error: null, ...o.rpc(jmeno, params) } : { data: null, error: null };
    },
  };
  return { db, rpc };
}

const nastroj = (db: unknown, kdo: Pripojeny = HONZA) => zavolejNastroj(db, kdo);

afterEach(() => { vi.useRealTimers(); });

describe('zapis_varku', () => {
  const ulozi = () => ({ data: NOVA });

  it('uloží várku za připojeného uživatele „přes Claude" stejnými kontrolami jako formulář appky a vypíše, co uložil', async () => {
    const { db, rpc } = falesnaDb({ tabulky: { bible_pivovary: [{ id: PIVOVAR }], bible_varky: [] }, rpc: ulozi });
    const t = await nastroj(db)('zapis_varku', {
      pivo: ' Desítka ', datum_varu: '2026-11-12', cislo: '112', hodnoty: { sypani_kg: 450, rmut_ph: 5.6, mladina_p: 11.8, kvasnice_generace: 3 },
    });
    expect(rpc).toEqual([['bible_varka_uloz', {
      p_uzivatel: HONZA.uzivatel, p_pristup: 'prispiva', p_jmeno: 'Honza přes Claude',
      p_varka: {
        pivovar_id: PIVOVAR, receptura_id: null, cislo: '112', pivo: 'Desítka', datum_varu: '2026-11-12',
        hodnoty: { sypani_kg: 450, rmut_ph: 5.6, mladina_p: 11.8, kvasnice_generace: 3 }, poznamka: null,
      },
    }]]);
    expect(t).toContain(`Várka uložena (varka_id=${NOVA}): č. 112 · Desítka · 12. 11. 2026`);
    expect(t).toContain(`Hodnoty (4 z ${HODNOTY_VARKY.length}):\n- Sypání (slad a suroviny): 450 kg\n- pH rmutu: 5,6\n- Extrakt mladiny (původní extrakt): 11,8 °P\n- Generace kvasnic: 3`);
    expect(t).toContain('dopln_varku');
    expect(t).toContain('https://zajic-pivovar.pages.dev/?page=bible&sub=varky');
  });

  it('číslo várky řečené jako číslo uloží jako text; desetinné odmítne', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', cislo: 112 });
    expect((rpc[0][1].p_varka as Radek).cislo).toBe('112');
    await expect(nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-13', cislo: 1.5 })).rejects.toThrow('Číslo várky musí být text.');
  });

  it('hodnotu ukáže přesně, jak se uložila (bez zaokrouhlení), a záporné se skutečným minus', async () => {
    const { db } = falesnaDb({ rpc: ulozi });
    const t = await nastroj(db)('zapis_varku', { pivo: 'Ležák', datum_varu: '2026-11-12', hodnoty: { rmut_ph: 5.625, pivo_zdanlivy_p: -0.4 } });
    expect(t).toContain('- pH rmutu: 5,625');
    expect(t).toContain('- Zdánlivý extrakt hotového piva: −0,4 °P');
  });

  it('účet jen se čtením nezapíše nic', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    await expect(nastroj(db, { ...HONZA, pristup: 'cte' })('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' }))
      .rejects.toThrow(/jen čtení/);
    expect(rpc).toEqual([]);
  });

  it('hodnota mimo rozsah, neznámá hodnota, desetinná generace nebo chybějící datum: srozumitelná chyba a nic se neuloží', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    const z = nastroj(db);
    await expect(z('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', hodnoty: { rmut_ph: 56 } })).rejects.toThrow('pH rmutu je mimo rozsah 3 až 8.');
    await expect(z('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', hodnoty: { teplota: 10 } })).rejects.toThrow(/Neznámá hodnota várky „teplota"/);
    await expect(z('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', hodnoty: { kvasnice_generace: 2.5 } })).rejects.toThrow('Generace kvasnic musí být celé číslo.');
    await expect(z('zapis_varku', { pivo: 'Desítka', hodnoty: { rmut_ph: 5.6 } })).rejects.toThrow('Datum varu chybí nebo není datum.');
    await expect(z('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-02-30' })).rejects.toThrow('Datum varu není platné datum.');
    await expect(z('zapis_varku', { datum_varu: '2026-11-12' })).rejects.toThrow('Chybí Pivo.');
    await expect(z('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' })).resolves.toContain('Hodnoty: zatím žádné.');
    expect(rpc.length).toBe(1);
  });

  it('stejné pivo téhož dne podruhé neuloží (i bez ohledu na velikost písmen), další várku téhož dne až s potvrzením', async () => {
    const { db, rpc } = falesnaDb({
      tabulky: { bible_pivovary: [{ id: PIVOVAR }], bible_varky: [{ id: VARKA, cislo: '112', pivo: 'desítka', pivovar_id: PIVOVAR, datum_varu: '2026-11-12' }] },
      rpc: ulozi,
    });
    const chyba = await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', hodnoty: { sypani_kg: 450 } }).catch((e) => e);
    expect(chyba).toBeInstanceOf(ChybaNastroje);
    expect(chyba.message).toContain(`Várka č. 112 „desítka" z 12. 11. 2026 už v evidenci je (varka_id=${VARKA}) — nic jsem neuložil.`);
    expect(chyba.message).toContain('dalsi_varka_tehoz_dne=true');
    expect(rpc).toEqual([]);
    await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', dalsi_varka_tehoz_dne: true });
    expect(rpc.length).toBe(1);
    // Jiný den nebo jiné pivo projde.
    await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-13' });
    await nastroj(db)('zapis_varku', { pivo: 'Jantar', datum_varu: '2026-11-12' });
    expect(rpc.length).toBe(3);
  });

  it('za duplicitu bere i starší várku bez pivovaru; jiný pivovar duplicita není', async () => {
    const varky = [{ id: VARKA, cislo: null, pivo: 'Desítka', pivovar_id: null, datum_varu: '2026-11-12' }];
    const { db, rpc } = falesnaDb({ tabulky: { bible_pivovary: [{ id: PIVOVAR }], bible_varky: varky }, rpc: ulozi });
    await expect(nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' })).rejects.toThrow(/už v evidenci je/);
    varky[0].pivovar_id = PIVOVAR_2 as never;
    await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', pivovar_id: PIVOVAR });
    expect(rpc.length).toBe(1);
  });

  it('pivovar jako formulář appky: jediný z Technologie pivovaru, při dvou žádný (nehádá), zadaný zůstane', async () => {
    const jeden = falesnaDb({ tabulky: { bible_pivovary: [{ id: PIVOVAR }] }, rpc: ulozi });
    await nastroj(jeden.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' });
    expect((jeden.rpc[0][1].p_varka as Radek).pivovar_id).toBe(PIVOVAR);
    const dva = falesnaDb({ tabulky: { bible_pivovary: [{ id: PIVOVAR }, { id: PIVOVAR_2 }] }, rpc: ulozi });
    await nastroj(dva.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' });
    expect((dva.rpc[0][1].p_varka as Radek).pivovar_id).toBeNull();
    await nastroj(dva.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-14', pivovar_id: PIVOVAR_2.toUpperCase() });
    expect((dva.rpc[1][1].p_varka as Radek).pivovar_id).toBe(PIVOVAR_2);
    const bezTechnologie = falesnaDb({ chybaTabulky: { bible_pivovary: { code: 'PGRST205' } }, rpc: ulozi });
    await nastroj(bezTechnologie.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' });
    expect((bezTechnologie.rpc[0][1].p_varka as Radek).pivovar_id).toBeNull();
  });

  it('receptura jen ze seznamu: neexistující odmítne, existující jmenuje ve výsledku', async () => {
    const { db, rpc } = falesnaDb({ tabulky: { bible_receptury: [{ id: RECEPTURA, nazev: 'Desítka 10°' }] }, rpc: ulozi });
    await expect(nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', receptura_id: VARKA })).rejects.toThrow(/Taková receptura v evidenci není/);
    await expect(nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', receptura_id: 'desitka' })).rejects.toThrow('Neplatné id receptury.');
    expect(rpc).toEqual([]);
    const t = await nastroj(db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', receptura_id: RECEPTURA });
    expect(t).toContain('Desítka · 12. 11. 2026 · receptura Desítka 10°');
    expect((rpc[0][1].p_varka as Radek).receptura_id).toBe(RECEPTURA);
  });

  it('chyba z databáze: srozumitelná jde Claudovi, ostatní jako výjimka bez textu z databáze; bez evidence várek chyba, ne „uloženo"', async () => {
    const duplicita = falesnaDb({ rpc: () => ({ error: { code: '22023', message: 'Várka s číslem „112" už v evidenci je.' } }) });
    await expect(nastroj(duplicita.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12', cislo: '112' }))
      .rejects.toThrow('Várka s číslem „112" už v evidenci je.');
    const prava = falesnaDb({ rpc: () => ({ error: { code: '42501', message: 'Várku smí zapsat přispěvatel nebo správce.' } }) });
    await expect(nastroj(prava.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' })).rejects.toBeInstanceOf(ChybaNastroje);
    const jina = falesnaDb({ rpc: () => ({ error: { code: 'XX000', message: 'vnitřní text' } }) });
    const e = await nastroj(jina.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' }).catch((x) => x);
    expect(e).not.toBeInstanceOf(ChybaNastroje);
    expect(e.message).toBe('db XX000');
    const bezMigrace = falesnaDb({ chybaTabulky: { bible_varky: { code: 'PGRST205' } } });
    await expect(nastroj(bezMigrace.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' })).rejects.toThrow(/migrace 20261111010000_bible_varky/);
    const bezFunkce = falesnaDb({ rpc: () => ({ error: { code: 'PGRST202' } }) });
    await expect(nastroj(bezFunkce.db)('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' })).rejects.toThrow(/migrace 20261111010000_bible_varky/);
  });

  it('bez jména uživatele zapíše „Claude (konektor)"', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    await nastroj(db, { ...HONZA, jmeno: null })('zapis_varku', { pivo: 'Desítka', datum_varu: '2026-11-12' });
    expect(rpc[0][1].p_jmeno).toBe('Claude (konektor)');
  });
});

describe('dopln_varku', () => {
  const ulozena = () => ({
    id: VARKA, pivovar_id: PIVOVAR, receptura_id: RECEPTURA, cislo: '112', pivo: 'Desítka', datum_varu: '2026-11-12',
    hodnoty: { sypani_kg: 450, rmut_ph: 5.6 }, poznamka: 'Var bez problémů.',
  });

  it('přidá nové hodnoty, stejné nechá a ostatní údaje várky zachová', async () => {
    const { db, rpc } = falesnaDb({ tabulky: { bible_varky: [ulozena()] } });
    const t = await nastroj(db)('dopln_varku', { varka_id: VARKA.toUpperCase(), hodnoty: { kvaseni_dnu: 8, kvaseni_max_teplota_c: 10.5, rmut_ph: 5.6 } });
    expect(rpc).toEqual([['bible_varka_uloz', {
      p_uzivatel: HONZA.uzivatel, p_pristup: 'prispiva', p_jmeno: 'Honza přes Claude',
      p_varka: {
        id: VARKA, pivovar_id: PIVOVAR, receptura_id: RECEPTURA, cislo: '112', pivo: 'Desítka', datum_varu: '2026-11-12',
        hodnoty: { sypani_kg: 450, rmut_ph: 5.6, kvaseni_dnu: 8, kvaseni_max_teplota_c: 10.5 }, poznamka: 'Var bez problémů.',
      },
    }]]);
    expect(t).toContain(`Várka doplněna (varka_id=${VARKA}): č. 112 · Desítka · 12. 11. 2026`);
    expect(t).toContain('Nově zapsáno:\n- Nejvyšší teplota kvašení: 10,5 °C\n- Délka hlavního kvašení: 8 dní');
    expect(t).toContain('Beze změny (už uložené stejně):\n- pH rmutu: 5,6');
    expect(t).toContain(`Ve várce je teď 4 z ${HODNOTY_VARKY.length} hodnot.`);
    expect(t).not.toContain('Opraveno');
  });

  it('jinou uloženou hodnotu bez opravit=true nepřepíše: vrátí rozdíly a nic neuloží', async () => {
    const { db, rpc } = falesnaDb({ tabulky: { bible_varky: [ulozena()] } });
    const e = await nastroj(db)('dopln_varku', { varka_id: VARKA, hodnoty: { rmut_ph: 5.4, kvaseni_dnu: 8 } }).catch((x) => x);
    expect(e).toBeInstanceOf(ChybaNastroje);
    expect(e.message).toBe('Várka č. 112 · Desítka · 12. 11. 2026 už má tyhle hodnoty jinak — nic jsem neuložil:\n- pH rmutu: uloženo 5,6, nově 5,4\n'
      + 'Je-li to oprava, potvrď ji se sládkem a pošli dopln_varku znovu s opravit=true.');
    expect(rpc).toEqual([]);
    const t = await nastroj(db)('dopln_varku', { varka_id: VARKA, hodnoty: { rmut_ph: 5.4, kvaseni_dnu: 8 }, opravit: true });
    expect((rpc[0][1].p_varka as { hodnoty: Radek }).hodnoty).toEqual({ sypani_kg: 450, rmut_ph: 5.4, kvaseni_dnu: 8 });
    expect(t).toContain('Opraveno:\n- pH rmutu: 5,6 → 5,4');
    expect(t).toContain('Nově zapsáno:\n- Délka hlavního kvašení: 8 dní');
  });

  it('poznámku připíše s dnešním českým datem (i po půlnoci UTC) a podruhé ji nepřipíše', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T23:30:00Z')); // v Praze už 13. 11. 0:30
    const radek = ulozena();
    const { db, rpc } = falesnaDb({ tabulky: { bible_varky: [radek] } });
    const t = await nastroj(db)('dopln_varku', { varka_id: VARKA, poznamka: '  Kvašení se rozjelo pomalu. ' });
    expect((rpc[0][1].p_varka as Radek).poznamka).toBe('Var bez problémů.\n13. 11. 2026: Kvašení se rozjelo pomalu.');
    expect(t).toContain('Připsáno k poznámce: 13. 11. 2026: Kvašení se rozjelo pomalu.');
    radek.poznamka = 'Var bez problémů.\n13. 11. 2026: Kvašení se rozjelo pomalu.';
    const znovu = await nastroj(db)('dopln_varku', { varka_id: VARKA, poznamka: 'Kvašení se rozjelo pomalu.', hodnoty: { rmut_ph: 5.6 } });
    expect(znovu).toBe('Várka č. 112 · Desítka · 12. 11. 2026 už tohle všechno má — nic se nezměnilo.');
    expect(rpc.length).toBe(1);
  });

  it('várka bez poznámky dostane jen připsaný řádek; delší než 4000 znaků odmítne', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    const { db, rpc } = falesnaDb({ tabulky: { bible_varky: [{ ...ulozena(), poznamka: null }] } });
    await nastroj(db)('dopln_varku', { varka_id: VARKA, poznamka: 'Stočeno do KEG.' });
    expect((rpc[0][1].p_varka as Radek).poznamka).toBe('12. 11. 2026: Stočeno do KEG.');
    const dlouha = falesnaDb({ tabulky: { bible_varky: [{ ...ulozena(), poznamka: 'x'.repeat(3990) }] } });
    await expect(nastroj(dlouha.db)('dopln_varku', { varka_id: VARKA, poznamka: 'Stočeno do KEG.' })).rejects.toThrow(/delší než 4000 znaků/);
    expect(dlouha.rpc).toEqual([]);
  });

  it('neplatné id, neexistující várka, nic k doplnění nebo hodnota mimo rozsah: chyba a nic se neuloží', async () => {
    const { db, rpc } = falesnaDb({ tabulky: { bible_varky: [ulozena()] } });
    const z = nastroj(db);
    await expect(z('dopln_varku', { varka_id: '112', hodnoty: { kvaseni_dnu: 8 } })).rejects.toThrow('varka_id musí být id várky ze seznam_varek.');
    await expect(z('dopln_varku', { varka_id: NOVA, hodnoty: { kvaseni_dnu: 8 } })).rejects.toThrow(/Taková várka v evidenci není/);
    await expect(z('dopln_varku', { varka_id: VARKA })).rejects.toThrow('Chybí hodnoty nebo poznámka k doplnění.');
    await expect(z('dopln_varku', { varka_id: VARKA, hodnoty: {}, poznamka: '   ' })).rejects.toThrow('Chybí hodnoty nebo poznámka k doplnění.');
    await expect(z('dopln_varku', { varka_id: VARKA, hodnoty: { kvaseni_dnu: 500 } })).rejects.toThrow('Délka hlavního kvašení je mimo rozsah 0 až 120.');
    await expect(z('dopln_varku', { varka_id: VARKA, poznamka: 5 })).rejects.toThrow('poznamka je text.');
    await expect(nastroj(db, { ...HONZA, pristup: 'cte' })('dopln_varku', { varka_id: VARKA, hodnoty: { kvaseni_dnu: 8 } })).rejects.toThrow(/jen čtení/);
    expect(rpc).toEqual([]);
  });
});

describe('zapis_zkusenost', () => {
  const ulozi = () => ({ data: NOVA });
  const zkusenost = { nazev: ' Pomalé prokvašení po studeném zakvašení ', text: 'Při zakvašení pod 7 °C se kvašení rozjíždí o den později.', oblasti: ['T', 'E', 'E'] };

  it('uloží za připojeného uživatele „přes Claude" s výchozím druhem a úrovní 4 a vypíše, co uložil', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    const t = await nastroj(db)('zapis_zkusenost', { ...zkusenost, zdroj: 'sládek Honza, várka 112' });
    expect(rpc).toEqual([['bible_zapis_zkusenost', {
      p_uzivatel: HONZA.uzivatel, p_pristup: 'prispiva', p_jmeno: 'Honza přes Claude',
      p_zkusenost: {
        typ: 'provozni_zkusenost', nazev: zkusenost.nazev, text: zkusenost.text, oblasti: ['E', 'T'], uroven: 4, zdroj: 'sládek Honza, várka 112',
      },
    }]]);
    expect(t).toBe([
      `Zkušenost uložena (id ${NOVA}): „Pomalé prokvašení po studeném zakvašení"`,
      '- Druh: Provozní zkušenost',
      '- Úroveň 4 — zkušenost jednoho sládka',
      '- Oblasti: E, T',
      '- Zdroj: sládek Honza, várka 112',
      'V appce (Zkušenosti sládků): https://zajic-pivovar.pages.dev/?page=bible&sub=zkusenosti',
    ].join('\n'));
  });

  it('stejnou zkušenost (stejný název i text) podruhé neuloží', async () => {
    const { db, rpc } = falesnaDb({
      tabulky: { bible_zkusenosti: [{ id: 'z1', nazev: zkusenost.nazev.trim(), text: zkusenost.text }] }, rpc: ulozi,
    });
    await expect(nastroj(db)('zapis_zkusenost', zkusenost)).rejects.toThrow('Stejná zkušenost „Pomalé prokvašení po studeném zakvašení" už v bibli je (id z1) — nic jsem neuložil.');
    expect(rpc).toEqual([]);
    await nastroj(db)('zapis_zkusenost', { ...zkusenost, text: `${zkusenost.text} Pomohlo prohřát na 8 °C.` });
    expect(rpc.length).toBe(1);
  });

  it('úroveň 1–3 přispěvateli odmítne databáze (jde Claudovi jako srozumitelná chyba); neznámý druh nebo oblast odmítne nástroj', async () => {
    const { db, rpc } = falesnaDb({ rpc: () => ({ error: { code: '42501', message: 'Úroveň 1 až 3 (ověřené zdroje) smí nastavit jen správce.' } }) });
    await expect(nastroj(db)('zapis_zkusenost', { ...zkusenost, uroven: 2 })).rejects.toThrow('Úroveň 1 až 3 (ověřené zdroje) smí nastavit jen správce.');
    await expect(nastroj(db)('zapis_zkusenost', { ...zkusenost, typ: 'drb' })).rejects.toThrow('Neznámý druh zkušenosti.');
    await expect(nastroj(db)('zapis_zkusenost', { ...zkusenost, oblasti: ['Z'] })).rejects.toThrow('Oblasti musí být seznam písmen A–T.');
    await expect(nastroj(db)('zapis_zkusenost', { ...zkusenost, uroven: 7 })).rejects.toThrow('Úroveň důvěryhodnosti je číslo 1 až 5.');
    await expect(nastroj(db)('zapis_zkusenost', { nazev: 'Jen název' })).rejects.toThrow('Chybí Text.');
    await expect(nastroj(db, { ...HONZA, pristup: 'cte' })('zapis_zkusenost', zkusenost)).rejects.toThrow(/jen čtení/);
    expect(rpc.length).toBe(1);
  });

  it('správce smí úroveň 2 a jiný druh; bez migrace zkušeností chyba, ne „uloženo"', async () => {
    const { db, rpc } = falesnaDb({ rpc: ulozi });
    const t = await nastroj(db, { ...HONZA, pristup: 'spravuje' })('zapis_zkusenost', { ...zkusenost, uroven: 2, typ: 'doporuceni_vyrobce', oblasti: [] });
    expect((rpc[0][1].p_zkusenost as Radek).uroven).toBe(2);
    expect(t).toContain('- Druh: Doporučení výrobce\n- Úroveň 2 — výrobní dokumentace');
    expect(t).not.toContain('Oblasti');
    const bez = falesnaDb({ chybaTabulky: { bible_zkusenosti: { code: '42P01' } } });
    await expect(nastroj(bez.db)('zapis_zkusenost', zkusenost)).rejects.toThrow(/migrace 20261104000000_bible_zkusenosti/);
    const bezFunkce = falesnaDb({ rpc: () => ({ error: { code: 'PGRST202' } }) });
    await expect(nastroj(bezFunkce.db)('zapis_zkusenost', zkusenost)).rejects.toThrow(/migrace 20261104000000_bible_zkusenosti/);
  });
});

describe('nástroje zápisu v konektoru', () => {
  const najdi = (jmeno: string) => NASTROJE.find((n) => n.name === jmeno)!;
  const ZAPISUJI = ['uloz_web_zdroj', 'zaloz_problem', 'zapis_zjisteni', 'zapis_varku', 'dopln_varku', 'zapis_zkusenost', 'uloz_odpoved'];

  it('hodnoty várky v popisu nástroje = katalog appky (klíč, jednotka, rozsah, celé číslo)', () => {
    for (const jmeno of ['zapis_varku', 'dopln_varku']) {
      const schema = (najdi(jmeno).inputSchema as { properties: { hodnoty: { properties: Record<string, { type: string; minimum: number; maximum: number; description: string }>; additionalProperties: boolean } } })
        .properties.hodnoty;
      expect(Object.keys(schema.properties)).toEqual(HODNOTY_VARKY.map((h) => h.klic));
      expect(schema.additionalProperties).toBe(false);
      for (const h of HODNOTY_VARKY) {
        expect(schema.properties[h.klic]).toEqual({
          type: h.cele ? 'integer' : 'number', minimum: h.min, maximum: h.max, description: `${h.nazev}${h.jednotka ? ` [${h.jednotka}]` : ''}`,
        });
      }
    }
    expect((najdi('zapis_varku').inputSchema as { required: string[] }).required).toEqual(['pivo', 'datum_varu']);
    expect((najdi('dopln_varku').inputSchema as { required: string[] }).required).toEqual(['varka_id']);
    expect((najdi('zapis_zkusenost').inputSchema as { required: string[] }).required).toEqual(['nazev', 'text']);
    expect((najdi('zapis_zkusenost').inputSchema as { properties: { typ: { enum: string[] } } }).properties.typ.enum).toEqual([...TYPY_ZKUSENOSTI]);
  });

  it('zápis z provozu se před uložením shrne a potvrdí; nic se nedomýšlí', () => {
    for (const jmeno of ['zapis_varku', 'dopln_varku', 'zapis_zkusenost']) {
      expect(najdi(jmeno).description).toContain('PŘED ULOŽENÍM sládkovi shrň, co zapíšeš, a ulož až po jeho potvrzení.');
      expect(najdi(jmeno).description).toContain('Nic nedomýšlej');
    }
    expect(najdi('dopln_varku').description).toMatch(/opravit=true pošli, jen když sládek opravu výslovně potvrdil/);
    expect(INSTRUKCE).toMatch(/před uložením vždy shrň, co zapíšeš/);
    expect(INSTRUKCE).toMatch(/uloženou hodnotu přepiš jen na výslovnou opravu/);
  });

  it('popisky MCP: zapisující nástroje nejsou „jen čtení", ostatní ano; žádný nesahá mimo bibli', () => {
    for (const n of NASTROJE) {
      expect(n.annotations.readOnlyHint, n.name).toBe(!ZAPISUJI.includes(n.name));
      expect(n.annotations.openWorldHint, n.name).toBe(false);
    }
    expect(najdi('dopln_varku').annotations).toMatchObject({ destructiveHint: true, idempotentHint: true });
    expect(najdi('zapis_varku').annotations).toMatchObject({ destructiveHint: false });
  });

  it('chatbot v appce zápis z provozu nedostane (jen konektor)', () => {
    for (const volby of [{ zapis: true, web: true }, { zapis: false, web: false }]) {
      const jmena = nastrojeChatu(NASTROJE, volby).map((t) => t.name);
      for (const n of ['zapis_varku', 'dopln_varku', 'zapis_zkusenost']) expect(jmena).not.toContain(n);
    }
    expect([...JEN_KONEKTOR].every((n) => NASTROJE.some((t) => t.name === n))).toBe(true);
  });

  it('každý nástroj z nabídky má v rozcestníku obsluhu (jinak by tiše vrátil seznam knih)', () => {
    const kod = readFileSync(join(__dirname, 'nastroje.ts'), 'utf8');
    for (const n of NASTROJE.filter((t) => t.name !== 'seznam_knih')) {
      expect(kod, n.name).toMatch(new RegExp(`if \\(jmeno === '${n.name}'\\) (return |\\{)`));
    }
  });

  it('přes MCP: úspěch je výsledek, odmítnutý zápis isError (Claude ví, že se nic neuložilo)', async () => {
    const { db } = falesnaDb({ tabulky: { bible_varky: [{ id: VARKA, cislo: null, pivo: 'Desítka', pivovar_id: null, datum_varu: '2026-11-12' }] }, rpc: () => ({ data: NOVA }) });
    const zavolej = zavolejNastroj(db, HONZA);
    const odmitnuto = await zpracujZpravu({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'zapis_varku', arguments: { pivo: 'Desítka', datum_varu: '2026-11-12' } } }, zavolej);
    expect(odmitnuto).toMatchObject({ result: { isError: true } });
    const ok = await zpracujZpravu({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'zapis_varku', arguments: { pivo: 'Jantar', datum_varu: '2026-11-12' } } }, zavolej);
    expect(ok).toMatchObject({ result: { isError: false } });
  });
});

describe('dotaz z appky a odpověď zpátky do appky (R33)', () => {
  const KNIHA = 'eeeeeeee-0000-4000-8000-000000000001';
  const CIZI_KNIHA = 'eeeeeeee-0000-4000-8000-0000000000ff';
  const DOTAZ = 'dddddddd-0000-4000-8000-0000000000aa';
  const strana = (id: string, list: number) => `https://zajic-pivovar.pages.dev/?page=bible&sub=kniha:${id}:${list}`;
  const udaje = { nazvy: new Map([[KNIHA, 'Technologie piva']]), strany: new Map([[`${KNIHA}:12`, '10']]) };

  it('odkaz do čtečky appky → stránka knihy (i zakódovaný); jiné adresy ne', () => {
    expect(odkazNaStranu(strana(KNIHA, 12))).toEqual({ dokumentId: KNIHA, list: 12 });
    expect(odkazNaStranu(`https://zajic-pivovar.pages.dev/?page=bible&sub=kniha%3A${KNIHA.toUpperCase()}%3A7`)).toEqual({ dokumentId: KNIHA, list: 7 });
    expect(odkazNaStranu('https://zajic-pivovar.pages.dev/?page=bible&sub=chat')).toBeNull();
    expect(odkazNaStranu(`https://jiny.example/?page=bible&sub=kniha:${KNIHA}:12`)).toBeNull();
    expect(odkazNaStranu(`${strana(KNIHA, 0)}`)).toBeNull();
  });

  it('odkazy na stránky a web → citace [n]; stejná stránka stejné číslo; čísla navazují za [n] v textu', () => {
    const text = `## Krátká odpověď\nPěnu drží bílkoviny ([Technologie piva, s. 10](${strana(KNIHA, 12)})).\n`
      + `- Znovu tatáž strana: ${strana(KNIHA, 12)}.\n- Web: [Článek o pěně](https://example.org/pena) a <https://example.com/x>\n`
      + `- Moje poznámka [2] zůstane.`;
    const r = odkazyNaCitace(text, udaje);
    expect(r.text).toBe('## Krátká odpověď\nPěnu drží bílkoviny (Technologie piva, s. 10 [3]).\n- Znovu tatáž strana: [3].\n'
      + '- Web: Článek o pěně [4] a [5]\n- Moje poznámka [2] zůstane.');
    expect(r.citace).toEqual([
      { n: 3, dokumentId: KNIHA, pdfIndex: 12, nazev: 'Technologie piva', tistena: '10', kapitola: null, zdroj: 'original', url: null, citat: '' },
      { n: 4, dokumentId: null, pdfIndex: null, nazev: 'Článek o pěně', tistena: null, kapitola: null, zdroj: 'web', url: 'https://example.org/pena', citat: '' },
      { n: 5, dokumentId: null, pdfIndex: null, nazev: 'example.com', tistena: null, kapitola: null, zdroj: 'web', url: 'https://example.com/x', citat: '' },
    ]);
    expect(r.vynechano).toBe(0);
    expect(stranyVOdpovedi(text)).toEqual([{ dokumentId: KNIHA, list: 12 }]);
  });

  it('kniha, která v knihovně není, se necituje (zůstane popis) a nahlásí se', () => {
    const r = odkazyNaCitace(`Viz [Neznámá kniha](${strana(CIZI_KNIHA, 3)}) a ${strana(CIZI_KNIHA, 4)}.`, udaje);
    expect(r.text).toBe('Viz Neznámá kniha a.');
    expect(r.citace).toEqual([]);
    expect(r.vynechano).toBe(2);
  });

  it('zdrojů nejvýš MAX_ZDROJU_ODPOVEDI, zbytek odkazů zůstane jako text', () => {
    const odkazy = Array.from({ length: MAX_ZDROJU_ODPOVEDI + 2 }, (_, i) => `[zdroj ${i}](https://example.org/${i})`).join(' ');
    const r = odkazyNaCitace(odkazy, udaje);
    expect(r.citace).toHaveLength(MAX_ZDROJU_ODPOVEDI);
    expect(r.text.endsWith(`zdroj ${MAX_ZDROJU_ODPOVEDI + 1}`)).toBe(true);
  });

  it('dotaz_z_appky: otázka, problém a předchozí zprávy jen z vlastního dotazu; bez migrace srozumitelně', async () => {
    const { db, rpc } = falesnaDb({ rpc: (jmeno, p) => (jmeno === 'bible_dotaz_claude_nacti' && p.p_dotaz === DOTAZ ? {
      data: {
        dotaz_id: DOTAZ, otazka: 'A co teplota?', nazev: 'Proč kvašení stojí?', problem_id: VARKA, problem_nazev: 'Pomalé kvašení', zodpovezeno: false,
        historie: [{ role: 'uzivatel', text: 'Proč kvašení stojí?' }, { role: 'asistent', text: 'Zkontroluj kvasnice.' }],
      },
    } : { data: null }) });
    const t = await nastroj(db)('dotaz_z_appky', { dotaz_id: DOTAZ.toUpperCase() });
    expect(rpc[0]).toEqual(['bible_dotaz_claude_nacti', { p_uzivatel: HONZA.uzivatel, p_dotaz: DOTAZ }]);
    expect(t).toContain(`# Dotaz z appky (dotaz_id=${DOTAZ})\nOtázka: A co teplota?`);
    expect(t).toContain(`„Pomalé kvašení" (problem_id=${VARKA}) — načti ho nástrojem problemy.`);
    expect(t).toContain('ulož celou odpověď nástrojem uloz_odpoved');
    expect(t).toContain('Uživatel: Proč kvašení stojí?\n\nAI sládek: Zkontroluj kvasnice.');
    await expect(nastroj(db)('dotaz_z_appky', { dotaz_id: NOVA })).rejects.toThrow(/Tenhle dotaz v appce není/);
    await expect(nastroj(db)('dotaz_z_appky', { dotaz_id: 'abc' })).rejects.toThrow(/dotaz_id musí být id ze zadání/);
    const bez = falesnaDb({ rpc: () => ({ error: { code: 'PGRST202' } }) });
    await expect(nastroj(bez.db)('dotaz_z_appky', { dotaz_id: DOTAZ })).rejects.toThrow(/migraci databáze bible 20261114000000_bible_dotazy_claude/);
  });

  it('uloz_odpoved: odkazy na stránky převede na citace s názvem a stranou z knihovny a uloží za připojeného uživatele', async () => {
    const { db, rpc } = falesnaDb({
      tabulky: {
        bible_dokumenty: [{ id: KNIHA, nazev: 'Technologie piva' }],
        bible_strany: [{ dokument_id: KNIHA, pdf_index: 12, tistena_strana: '10' }, { dokument_id: KNIHA, pdf_index: 13, tistena_strana: '11' }],
      },
      rpc: () => ({ data: { zprava_id: NOVA, konverzace_id: VARKA } }),
    });
    const t = await nastroj(db, { ...HONZA, pristup: 'cte' })('uloz_odpoved', {
      dotaz_id: DOTAZ, odpoved: `  ## Krátká odpověď\nTeplota je nízká [Technologie piva](${strana(KNIHA, 12)}); web: https://example.org/kvaseni.  `,
    });
    expect(rpc).toEqual([['bible_dotaz_claude_odpovez', {
      p_uzivatel: HONZA.uzivatel, p_dotaz: DOTAZ,
      p_text: '## Krátká odpověď\nTeplota je nízká Technologie piva [1]; web: [2].',
      p_citace: [
        { n: 1, dokumentId: KNIHA, pdfIndex: 12, nazev: 'Technologie piva', tistena: '10', kapitola: null, zdroj: 'original', url: null, citat: '' },
        { n: 2, dokumentId: null, pdfIndex: null, nazev: 'example.org', tistena: null, kapitola: null, zdroj: 'web', url: 'https://example.org/kvaseni', citat: '' },
      ],
      p_model: 'aplikace Claude (předplatné)',
    }]]);
    expect(t).toContain('Odpověď je uložená v appce');
    expect(t).toContain('https://zajic-pivovar.pages.dev/?page=bible&sub=chat');
    expect(t).toContain('Citace: 1 ze stránek knih, 1 z webu.');
  });

  it('uloz_odpoved: cizí nebo už zodpovězený dotaz, prázdná či dlouhá odpověď a chybějící migrace — chyba, ne „uloženo"', async () => {
    const cizi = falesnaDb({ rpc: () => ({ error: { code: 'P0002', message: 'Tenhle dotaz v appce není (nebo patří jinému uživateli).' } }) });
    await expect(nastroj(cizi.db)('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: 'Text' })).rejects.toThrow('Tenhle dotaz v appce není (nebo patří jinému uživateli).');
    const druha = falesnaDb({ rpc: () => ({ error: { code: '22023', message: 'Odpověď na tenhle dotaz už v appce je.' } }) });
    await expect(nastroj(druha.db)('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: 'Text' })).rejects.toThrow('Odpověď na tenhle dotaz už v appce je.');
    const { db, rpc } = falesnaDb();
    await expect(nastroj(db)('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: '   ' })).rejects.toThrow('Chybí odpověď.');
    await expect(nastroj(db)('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: 'x'.repeat(60_001) })).rejects.toThrow(/moc dlouhá/);
    await expect(nastroj(db, { ...HONZA, pristup: 'zadny' })('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: 'Text' })).rejects.toThrow(/nemá do bible přístup/);
    expect(rpc).toEqual([]);
    const bez = falesnaDb({ rpc: () => ({ error: { code: 'PGRST202' } }) });
    await expect(nastroj(bez.db)('uloz_odpoved', { dotaz_id: DOTAZ, odpoved: 'Text' })).rejects.toThrow(/20261114000000_bible_dotazy_claude/);
  });

  it('nabídka konektoru: dotaz_z_appky jen čte, uloz_odpoved zapisuje; chatbot v appce je nemá; instrukce říkají ukládat odpověď', () => {
    expect(NASTROJE.find((n) => n.name === 'dotaz_z_appky')!.annotations.readOnlyHint).toBe(true);
    expect(NASTROJE.find((n) => n.name === 'uloz_odpoved')!.annotations.readOnlyHint).toBe(false);
    expect((NASTROJE.find((n) => n.name === 'uloz_odpoved')!.inputSchema as { required: string[] }).required).toEqual(['dotaz_id', 'odpoved']);
    const jmena = nastrojeChatu(NASTROJE, { zapis: true, web: true }).map((t) => t.name);
    expect(jmena).not.toContain('dotaz_z_appky');
    expect(jmena).not.toContain('uloz_odpoved');
    expect(INSTRUKCE).toMatch(/ulož nástrojem uloz_odpoved/);
  });
});
