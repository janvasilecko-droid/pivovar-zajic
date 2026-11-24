// @vitest-environment node
// Hledání v knihách s vektory (R38): spojení s hledáním podle slov, filtry a to, že vektory nikdy nerozbijí
// hledání. Falešná databáze a embedder — jen vymyšlené věty, žádný text skutečných knih (repo je veřejné).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zavolejNastroj, zavolejNastrojChat, type Pripojeny } from './nastroje';
import { MODEL_VEKTORU, ROZMER_VEKTORU, type Embedder } from './vektory';

const KDO: Pripojeny = { uzivatel: 'dddddddd-0000-4000-8000-000000000001', jmeno: 'Honza', pristup: 'cte' };
const D1 = '11111111-1111-4111-8111-111111111111';
const D2 = '22222222-2222-4222-8222-222222222222';

type Radek = Record<string, unknown>;
const radek = (dokument: string, list: number, text: string, extra: Radek = {}): Radek => ({
  dokument_id: dokument, nazev: dokument === D1 ? 'Kniha A' : 'Kniha B', autor: null, rok: 2001, jazyk: 'cs', zdroj: 'original',
  pdf_index: list, tistena_strana: String(list), kapitola: null, druh: 'text', text, skore: 1, ...extra,
});
const vektor = () => Array.from({ length: ROZMER_VEKTORU }, (_, i) => (i === 0 ? 0.5 : 0));

/** Falešný klient: hledání podle slov, volné hledání, hledání podle významu; záznam volání. */
function falesnaDb(o: {
  slovni?: Radek[]; volne?: Radek[]; vektorove?: unknown; chybaVektoru?: { code: string }; vektoryHodiVyjimku?: boolean;
} = {}) {
  const volani: [string, Record<string, unknown>][] = [];
  const db = {
    from: () => ({ select: () => ({ not: async () => ({ data: [], error: null }) }) }),
    rpc: async (jmeno: string, params: Record<string, unknown>) => {
      volani.push([jmeno, params]);
      switch (jmeno) {
        case 'bible_hledej_v': return { data: o.slovni ?? [], error: null };
        case 'bible_hledej_volne_v': return { data: o.volne ?? [], error: null };
        case 'bible_slova_hledani': return { data: null, error: { code: 'PGRST202' } };
        case 'bible_hledej_vektor':
          if (o.vektoryHodiVyjimku) throw new Error('spadlo');
          if (o.chybaVektoru) return { data: null, error: o.chybaVektoru };
          return { data: o.vektorove ?? [], error: null };
        default: return { data: null, error: null };
      }
    },
  };
  return { db, volani, vektoroveVolani: () => volani.filter(([j]) => j === 'bible_hledej_vektor') };
}

const embedder = (v: number[] | null = vektor()): Embedder & ReturnType<typeof vi.fn> => vi.fn(async () => v) as never;
const hledej = (db: unknown, embed: Embedder | null | undefined, args: Record<string, unknown> = { dotaz: 'pěna' }) =>
  zavolejNastroj(db, KDO, embed)('hledej_v_knihach', args);

afterEach(() => { vi.restoreAllMocks(); });

describe('hledání v knihách bez vektorů (jako dřív)', () => {
  it('bez embedderu se vektorová funkce nevolá a hlavička je beze změny', async () => {
    const { db, volani } = falesnaDb({ slovni: [radek(D1, 5, 'Pěna drží bílkoviny.')] });
    const t = await hledej(db, null);
    expect(volani.map(([j]) => j)).not.toContain('bible_hledej_vektor');
    expect(t).toContain('Nalezeno 1 míst pro „pěna"');
    expect(t).not.toContain('podle významu');
    expect(t).toContain('Kniha A');
  });
});

describe('hledání v knihách s vektory', () => {
  it('vektor dotazu jde do databáze (model, text vektoru, filtr, limit) a hlavička říká, že se hledalo i podle významu', async () => {
    const embed = embedder();
    const { db, vektoroveVolani } = falesnaDb({ slovni: [radek(D1, 5, 'Pěna drží bílkoviny.')], vektorove: [radek(D2, 9, 'Die Würze schäumt.')] });
    const t = await hledej(db, embed, { dotaz: '  pěna  ' });
    expect(embed).toHaveBeenCalledWith('pěna');
    const [[, p]] = vektoroveVolani();
    expect(p.p_model).toBe(MODEL_VEKTORU);
    expect(p.p_filtr).toBeNull();
    expect(p.p_limit).toBe(25);
    expect(typeof p.p_vektor).toBe('string');
    expect(String(p.p_vektor).startsWith('[0.5,0,0')).toBe(true);
    expect(String(p.p_vektor).slice(1, -1).split(',')).toHaveLength(ROZMER_VEKTORU);
    expect(t).toContain('— spojeno s hledáním podle významu (najde i pasáže bez shody slov, třeba v jiném jazyce)');
    expect(t).toContain('Kniha A');
    expect(t).toContain('Kniha B');
  });

  it('stránka nalezená oběma způsoby je první; pak pořadí podle RRF', async () => {
    const { db } = falesnaDb({
      slovni: [radek(D1, 1, 'První jen podle slov.'), radek(D1, 2, 'Druhá podle slov i významu.')],
      vektorove: [radek(D2, 7, 'První jen podle významu.'), radek(D1, 2, 'Druhá podle slov i významu.')],
    });
    const t = await hledej(db, embedder());
    const poradi = [...t.matchAll(/^\d+\. (Kniha [AB]) — (?:s\.|list) (\d+)/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(poradi).toEqual(['Kniha A:2', 'Kniha A:1', 'Kniha B:7']);
  });

  it('pasáž jen podle významu (jiný jazyk, žádná shoda slov) se najde i tehdy, když hledání podle slov nic nevrátí', async () => {
    const { db } = falesnaDb({ slovni: [], volne: [], vektorove: [radek(D2, 9, 'Die Würze schäumt beim Kochen.', { jazyk: 'de' })] });
    const t = await hledej(db, embedder(), { dotaz: 'mladina pění' });
    expect(t).not.toContain('nic nenašel');
    expect(t).toContain('Kniha B');
    expect(t).toContain('s. 9');
    expect(t).toContain('Die Würze schäumt beim Kochen.');
    expect(t).toContain('spojeno s hledáním podle významu');
  });

  it('filtr hledání jde i do hledání podle významu', async () => {
    const { db, vektoroveVolani } = falesnaDb({ vektorove: [radek(D2, 9, 'Text.')] });
    await hledej(db, embedder(), { dotaz: 'pěna', jazyk: 'de', autor: 'Kunze' });
    expect(vektoroveVolani()[0][1].p_filtr).toEqual({ autor: 'Kunze', jazyk: 'de' });
    const { db: db2, vektoroveVolani: v2 } = falesnaDb({ vektorove: [radek(D2, 9, 'Text.')] });
    await hledej(db2, embedder(), { dotaz: 'pěna', kniha_id: D2 });
    expect(v2()[0][1].p_filtr).toEqual({ dokument: D2 });
  });

  it('chatbot dostane spojené výsledky jako bloky s citacemi (a zdroje v témže pořadí)', async () => {
    const { db } = falesnaDb({
      slovni: [radek(D1, 1, 'Jen slova.'), radek(D1, 2, 'Slova i význam.')],
      vektorove: [radek(D2, 7, 'Jen význam.'), radek(D1, 2, 'Slova i význam.')],
    });
    const v = await zavolejNastrojChat(db, KDO, embedder())('hledej_v_knihach', { dotaz: 'pěna' });
    if (!('bloky' in v)) throw new Error('čekal jsem bloky');
    expect(v.zdroje.map((z) => `${z.dokumentId === D1 ? 'A' : 'B'}:${z.list}`)).toEqual(['A:2', 'A:1', 'B:7']);
    expect(v.bloky[0]).toMatchObject({ type: 'text' });
    expect((v.bloky[0] as { text: string }).text).toContain('spojeno s hledáním podle významu');
    expect(v.bloky.filter((b) => b.type === 'search_result')).toHaveLength(3);
  });
});

describe('vektory nikdy nerozbijí hledání', () => {
  const slovni = () => [radek(D1, 5, 'Pěna drží bílkoviny.')];
  const jenSlova = (t: string) => {
    expect(t).toContain('Nalezeno 1 míst pro „pěna"');
    expect(t).toContain('Kniha A');
    expect(t).not.toContain('podle významu');
  };

  it('embedder vrátí null (bez klíče, chyba sítě, pomalá odpověď) → databáze se na vektory ani neptá', async () => {
    const { db, vektoroveVolani } = falesnaDb({ slovni: slovni() });
    jenSlova(await hledej(db, embedder(null)));
    expect(vektoroveVolani()).toHaveLength(0);
  });

  it('embedder hodí výjimku → hledá se jen podle slov', async () => {
    const { db } = falesnaDb({ slovni: slovni() });
    jenSlova(await hledej(db, (async () => { throw new Error('síť'); }) as Embedder));
  });

  it('migrace vektorů ještě neběžela (PGRST202) → tiše jen podle slov, bez varování', async () => {
    const varovani = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = falesnaDb({ slovni: slovni(), chybaVektoru: { code: 'PGRST202' } });
    jenSlova(await hledej(db, embedder()));
    expect(varovani).not.toHaveBeenCalled();
  });

  it('jiná chyba databáze → jen podle slov a do logu jen kód chyby (žádný text)', async () => {
    const varovani = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = falesnaDb({ slovni: slovni(), chybaVektoru: { code: '22000' } });
    jenSlova(await hledej(db, embedder()));
    expect(varovani).toHaveBeenCalledTimes(1);
    expect(varovani).toHaveBeenCalledWith('hledání podle významu selhalo: 22000');
  });

  it('databáze vrátí něco jiného než seznam, nebo hodí výjimku → jen podle slov', async () => {
    for (const o of [{ vektorove: { x: 1 } }, { vektorove: { length: 3 } }, { vektorove: 'text, který není seznam' }, { vektorove: null }, { vektoryHodiVyjimku: true }]) {
      const { db } = falesnaDb({ slovni: slovni(), ...o });
      jenSlova(await hledej(db, embedder()));
    }
  });

  it('prázdný výsledek vektorů hlavičku nemění', async () => {
    const { db } = falesnaDb({ slovni: slovni(), vektorove: [] });
    jenSlova(await hledej(db, embedder()));
  });

  it('nic nenalezeno ani slovy, ani podle významu → obvyklá hláška', async () => {
    const { db } = falesnaDb({ slovni: [], volne: [], vektorove: [] });
    expect(await hledej(db, embedder())).toContain('jsem v knihách nic nenašel');
  });
});

describe('napojení funkcí bible-chat a bible-mcp', () => {
  it('obě funkce vytvoří embedder z klíče OPENAI_API_KEY a předají ho nástrojům (jinak by se vektory nikdy nepoužily)', () => {
    const chat = readFileSync('bible/supabase/functions/bible-chat/index.ts', 'utf-8');
    const mcp = readFileSync('bible/supabase/functions/bible-mcp/index.ts', 'utf-8');
    for (const zdroj of [chat, mcp]) {
      expect(zdroj).toContain("const EMBEDDER = embedderOpenAi(Deno.env.get('OPENAI_API_KEY'));");
    }
    expect(chat).toMatch(/zavolejNastrojChat\(db, \{[^}]*\}, EMBEDDER\)/);
    expect(mcp).toMatch(/zavolejNastroj\(db, \{.*\}, EMBEDDER\)/);
  });
});
