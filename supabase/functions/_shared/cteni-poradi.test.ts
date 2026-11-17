import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ctiSPoradim, pauza, signalSCasem, type DrahaCteni } from './cteni-poradi';

/**
 * Dráha, která po `ms` vrátí `text` (prázdný = nepřečetla); zrušení ji ukončí hned.
 * `potizPo` = po kolika ms ohlásí potíž (první pokus selhal, zkouší dál).
 */
function draha(jmeno: string, ms: number, text: string, zaznam: string[] = [], potizPo?: number): DrahaCteni {
  return (zrus, potiz) => new Promise((hotovo) => {
    zaznam.push(`start ${jmeno}`);
    const hlaseni = potizPo === undefined ? undefined : setTimeout(potiz, potizPo);
    const priZruseni = () => { clearTimeout(casovac); clearTimeout(hlaseni); zaznam.push(`zrušeno ${jmeno}`); hotovo({ text: '', provider: jmeno }); };
    const casovac = setTimeout(() => {
      zrus.removeEventListener('abort', priZruseni);
      zaznam.push(`konec ${jmeno}`);
      hotovo({ text, provider: jmeno });
    }, ms);
    zrus.addEventListener('abort', priZruseni, { once: true });
  });
}

describe('čtení víc AI najednou s pořadím (jedno volání se musí vejít do času serveru)', () => {
  let start = 0;
  const zbyva = (celkem: number) => () => celkem - (Date.now() - start);
  beforeEach(() => { vi.useFakeTimers(); start = Date.now(); });
  afterEach(() => { vi.useRealTimers(); });

  const spust = async (o: Parameters<typeof ctiSPoradim>[0]) => {
    const slib = ctiSPoradim(o);
    await vi.runAllTimersAsync();
    return { vysledek: await slib, trvalo: Date.now() - start };
  };

  it('hlavní čtení odpoví → vrátí se hned, zálohy se vůbec nerozjedou a náhradní dráha se zruší', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 40_000, '{"a":1}', z), draha('náhradní', 50_000, '{"b":2}', z)],
      zalohy: [draha('záloha', 20_000, '{"c":3}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 12_000,
    });
    expect(vysledek).toEqual({ text: '{"a":1}', provider: 'hlavní', zalozni: false });
    expect(trvalo).toBe(40_000);
    expect(z).toEqual(['start hlavní', 'start náhradní', 'konec hlavní', 'zrušeno náhradní']);
  });

  it('náhradní model odpoví dřív, ale hlavní ještě běží a přečte → platí hlavní (pořadí, ne rychlost)', async () => {
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 45_000, '{"hlavni":1}'), draha('náhradní', 20_000, '{"nahradni":1}')],
      zalohy: null, zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek.provider).toBe('hlavní');
    expect(trvalo).toBe(45_000);
  });

  it('hlavní model spadne hned (přetížený), náhradní přečte → vrátí se náhradní bez čekání na konec okna', async () => {
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 2_000, ''), draha('náhradní', 30_000, '{"n":1}')],
      zalohy: [draha('záloha', 5_000, '{"z":1}')],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"n":1}', provider: 'náhradní', zalozni: false });
    expect(trvalo).toBe(30_000);
  });

  it('nejlepší čtení skončí celé bez výsledku → zálohy se rozjedou hned (nečeká se na rezervu)', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 2_000, '', z), draha('náhradní', 3_000, '', z)],
      zalohy: [draha('gemma', 30_000, '', z), draha('mistral', 18_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"m":1}', provider: 'mistral', zalozni: true });
    // Mistral byl hotový ve 21 s, ale čeká se na výš postavenou Gemmu (do 33 s).
    expect(trvalo).toBe(33_000);
    expect(z.indexOf('start gemma')).toBeGreaterThan(z.indexOf('konec náhradní'));
  });

  it('nejlepší čtení má potíže (přetížení) a zkouší to do konce okna → zálohy se rozjedou v rezervě a jejich výsledek se použije', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 55_000, '', z, 1_200)],
      zalohy: [draha('mistral', 18_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"m":1}', provider: 'mistral', zalozni: true });
    expect(trvalo).toBe(55_000);
    expect(z).toEqual(['start hlavní', 'start mistral', 'konec mistral', 'konec hlavní']);
  });

  it('zdravý, jen pomalý Gemini (žádná potíž): zálohy se nerozjedou ani v rezervě — objednávka nejde dalším službám zbytečně', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 50_000, '{"h":1}', z)],
      zalohy: [draha('mistral', 10_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"h":1}', provider: 'hlavní', zalozni: false });
    expect(trvalo).toBe(50_000);
    expect(z).toEqual(['start hlavní', 'konec hlavní']);
  });

  it('nejlepší čtení mlčí bez ohlášené potíže a nestihne to → zálohy se zkusí až po něm (když ještě zbývá čas)', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 40_000, '', z)],
      zalohy: [draha('mistral', 15_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek.provider).toBe('mistral');
    expect(trvalo).toBe(55_000);
    expect(z).toEqual(['start hlavní', 'konec hlavní', 'start mistral', 'konec mistral']);
  });

  it('potíž ohlášená až v rezervě → zálohy se rozjedou hned v tu chvíli', async () => {
    const z: string[] = [];
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 57_000, '', z, 40_000)],
      zalohy: [draha('mistral', 12_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek.provider).toBe('mistral');
    expect(trvalo).toBe(57_000);
    expect(z.slice(0, 3)).toEqual(['start hlavní', 'start mistral', 'konec mistral']);
  });

  it('zálohy už běží, ale nejlepší čtení nakonec odpoví (druhý pokus po přetížení) → platí nejlepší', async () => {
    const { vysledek } = await spust({
      nejlepsi: [draha('hlavní', 50_000, '{"h":1}', [], 1_200)],
      zalohy: [draha('mistral', 10_000, '{"m":1}')],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"h":1}', provider: 'hlavní', zalozni: false });
  });

  it('„zálohy hned" (fotku Gemini nepřečetl ani po několika minutách): startují zároveň, nejlepší čtení má pořád přednost', async () => {
    const z: string[] = [];
    const prvni = await spust({
      nejlepsi: [draha('hlavní', 55_000, '', z)],
      zalohy: [draha('mistral', 18_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000, zalohyHned: true,
    });
    expect(prvni.vysledek).toEqual({ text: '{"m":1}', provider: 'mistral', zalozni: true });
    expect(z.slice(0, 3)).toEqual(['start hlavní', 'start mistral', 'konec mistral']);

    start = Date.now();
    const druhy = await spust({
      nejlepsi: [draha('hlavní', 30_000, '{"h":1}')],
      zalohy: [draha('mistral', 5_000, '{"m":1}')],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000, zalohyHned: true,
    });
    expect(druhy.vysledek).toEqual({ text: '{"h":1}', provider: 'hlavní', zalozni: false });
  });

  it('mezi zálohami rozhoduje pořadí: první v seznamu, která něco přečetla', async () => {
    const { vysledek } = await spust({
      nejlepsi: [],
      zalohy: [draha('gemma', 9_000, '{"g":1}'), draha('groq', 1_000, '{"q":1}')],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '{"g":1}', provider: 'gemma', zalozni: true });
  });

  it('jen nejlepší čtení (zalohy = null): slabší čtení se nikdy nerozjede a neúspěch se vrátí prázdný', async () => {
    const { vysledek, trvalo } = await spust({
      nejlepsi: [draha('hlavní', 2_000, '', [], 1_000), draha('náhradní', 55_000, '')],
      zalohy: null, zbyvaMs: zbyva(58_000), rezervaMs: 26_000, zalohyHned: true,
    });
    expect(vysledek).toEqual({ text: '', provider: '', zalozni: false });
    expect(trvalo).toBe(55_000);
  });

  it('nepřečte nikdo → prázdný výsledek; dráha, která vyhodí chybu, čtení neshodí', async () => {
    const { vysledek } = await spust({
      nejlepsi: [() => Promise.reject(new Error('síť')), () => { throw new Error('hned'); }],
      zalohy: [draha('záloha', 1_000, '')],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(vysledek).toEqual({ text: '', provider: '', zalozni: false });
  });

  it('po návratu jsou ostatní dráhy zrušené (nedobíhají na pozadí)', async () => {
    const z: string[] = [];
    await spust({
      nejlepsi: [draha('hlavní', 55_000, '', z, 1_000)],
      zalohy: [draha('gemma', 5_000, '{"g":1}', z), draha('mistral', 40_000, '{"m":1}', z)],
      zbyvaMs: zbyva(58_000), rezervaMs: 26_000,
    });
    expect(z).toContain('zrušeno mistral');
    expect(z).not.toContain('konec mistral');
  });
});

describe('signál s časem a pauza', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('pauza skončí po čase, zrušení ji ukončí hned', async () => {
    let hotovo = false;
    void pauza(5_000).then(() => { hotovo = true; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(hotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(hotovo).toBe(true);

    const zrus = new AbortController();
    let druha = false;
    void pauza(60_000, zrus.signal).then(() => { druha = true; });
    zrus.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(druha).toBe(true);
  });

  it('signál se ozve při zrušení i bez AbortSignal.any (starší běh)', () => {
    const puvodni = (AbortSignal as unknown as { any?: unknown }).any;
    (AbortSignal as unknown as { any?: unknown }).any = undefined;
    try {
      const zrus = new AbortController();
      const s = signalSCasem(60_000, zrus.signal);
      expect(s.aborted).toBe(false);
      zrus.abort();
      expect(s.aborted).toBe(true);
      // Už zrušený signál → hned zrušeno.
      expect(signalSCasem(60_000, zrus.signal).aborted).toBe(true);
    } finally {
      (AbortSignal as unknown as { any?: unknown }).any = puvodni;
    }
  });

  it('se zrušením přes AbortSignal.any', () => {
    const zrus = new AbortController();
    const s = signalSCasem(60_000, zrus.signal);
    zrus.abort();
    expect(s.aborted).toBe(true);
    expect(signalSCasem(1_000).aborted).toBe(false);
  });
});
