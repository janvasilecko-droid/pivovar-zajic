// 🔌 Jistič spojení: po prvním vypršeném dotazu se čte rovnou z paměti telefonu, ne až za 10–25 s u každého.
// Majitel 27. 11. 2026: „furt to nefunguje offline" — na slabém signálu (telefon hlásí „online", server mlčí)
// se Plocha ukázala za 34 s a Sklad vůbec, i když data v telefonu byla.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CERSTVY_VYPADEK_MS, KLIC_VYPADKU, KRATKE_CEKANI_MS, ODSTUP_SOND_MS, ODSTUP_ZPRAV_O_NAVRATU_MS,
  PLATNOST_ULOZENEHO_VYPADKU_MS, POMALE_SELHANI_MS, TIK_SOND_MS, UDALOST_SPOJENI_ZPET,
  cekaniNaSit, cekejNaDokladVypadku, nactiUlozenyVypadek, nastavSonduSpojeni, ohlasOdpovedServeru, ohlasSelhaniSite,
  ohlasTicho, pustSondu, vynulujJisticProTesty, vypadekCerstvy, zapomenVypadek,
} from './jisticSpojeni';

const T0 = new Date('2026-11-27T10:00:00Z').getTime();
/** Dotaz, který vyrazil před `sekund` vteřinami a právě teď selhal (vypršel). */
const vyprsel = (sekund = 10) => ohlasSelhaniSite(Date.now() - sekund * 1000);

function nastavOnline(online: boolean): () => void {
  const puvodni = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  return () => {
    delete (navigator as unknown as { onLine?: boolean }).onLine;
    if (puvodni) Object.defineProperty(Navigator.prototype, 'onLine', puvodni);
  };
}

describe('jistič spojení', () => {
  let zpet: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    localStorage.clear();
    vynulujJisticProTesty();
    zpet = vi.fn();
    window.addEventListener(UDALOST_SPOJENI_ZPET, zpet);
  });
  afterEach(() => {
    window.removeEventListener(UDALOST_SPOJENI_ZPET, zpet);
    vynulujJisticProTesty();
    vi.useRealTimers();
  });

  it('bez výpadku se čeká na síť jako vždy', () => {
    expect(cekaniNaSit()).toBeNull();
    expect(vypadekCerstvy()).toBe(false);
  });

  it('po vypršeném dotazu se chvíli nečeká vůbec, pak jen krátce', () => {
    vyprsel();
    expect(cekaniNaSit()).toBe(0);
    expect(vypadekCerstvy()).toBe(true);
    vi.setSystemTime(T0 + CERSTVY_VYPADEK_MS);
    expect(cekaniNaSit()).toBe(0);
    vi.setSystemTime(T0 + CERSTVY_VYPADEK_MS + 1);
    expect(cekaniNaSit()).toBe(KRATKE_CEKANI_MS);
    expect(vypadekCerstvy()).toBe(false);
    // Ani po hodině se výpadek sám „nezapomene" — čeká se krátce, dokud server neodpoví.
    vi.setSystemTime(T0 + 3600_000);
    expect(cekaniNaSit()).toBe(KRATKE_CEKANI_MS);
  });

  it('rychlé selhání (server odmítl spojení, nic se nečekalo) jistič neshodí', () => {
    ohlasSelhaniSite(Date.now() - (POMALE_SELHANI_MS - 1));
    expect(cekaniNaSit()).toBeNull();
    ohlasSelhaniSite(Date.now() - POMALE_SELHANI_MS);
    expect(cekaniNaSit()).toBe(0);
  });

  it('když telefon sám ví, že je offline, jistič se neplete (dotazy selžou hned i bez něj)', () => {
    const vrat = nastavOnline(false);
    try {
      vyprsel();
      expect(cekaniNaSit()).toBeNull();
    } finally { vrat(); }
  });

  it('selhání dotazu, který vyrazil ještě před poslední odpovědí serveru, nic neznamená', () => {
    const zahajeno = Date.now() - 25_000;
    vi.setSystemTime(T0 - 5_000);
    ohlasOdpovedServeru();
    vi.setSystemTime(T0);
    ohlasSelhaniSite(zahajeno);
    expect(cekaniNaSit()).toBeNull();
    // Dotaz, který vyrazil až po ní, už ano.
    ohlasSelhaniSite(T0 - 4_000);
    expect(cekaniNaSit()).toBe(0);
  });

  it('odpověď serveru jistič sepne zpět a ohlásí „spojení je zpátky"', () => {
    vyprsel();
    ohlasOdpovedServeru();
    expect(cekaniNaSit()).toBeNull();
    expect(zpet).not.toHaveBeenCalled();      // zpráva jde mimo právě běžící dotaz
    vi.advanceTimersByTime(0);
    expect(zpet).toHaveBeenCalledTimes(1);
  });

  it('odpověď serveru bez předchozího výpadku nic nehlásí', () => {
    ohlasOdpovedServeru();
    vi.advanceTimersByTime(1000);
    expect(zpet).not.toHaveBeenCalled();
  });

  it('na kolísavém signálu chodí zpráva o návratu nejvýš jednou za čas — a jen když spojení opravdu drží', () => {
    vyprsel(); ohlasOdpovedServeru(); vi.advanceTimersByTime(0);
    expect(zpet).toHaveBeenCalledTimes(1);
    // Hned zase výpadek a návrat: zpráva počká na odstup.
    vi.advanceTimersByTime(3000); vyprsel(3); ohlasOdpovedServeru();
    vi.advanceTimersByTime(ODSTUP_ZPRAV_O_NAVRATU_MS - 3001);
    expect(zpet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(zpet).toHaveBeenCalledTimes(2);
    // Návrat, po kterém spojení zase spadne dřív, než zpráva odejde → žádná zpráva.
    vi.advanceTimersByTime(1000); vyprsel(3); ohlasOdpovedServeru();
    vi.advanceTimersByTime(3000); vyprsel(3);
    vi.advanceTimersByTime(ODSTUP_ZPRAV_O_NAVRATU_MS);
    expect(zpet).toHaveBeenCalledTimes(2);
    expect(cekaniNaSit()).toBe(0);
  });

  it('dotaz, který čeká na síť, se o výpadku dozví hned (nečeká na vlastní limit)', async () => {
    const a = cekejNaDokladVypadku();
    const b = cekejNaDokladVypadku();
    const probuzeno: string[] = [];
    void a.slib.then(() => probuzeno.push('a'));
    void b.slib.then(() => probuzeno.push('b'));
    b.zrus();                                    // b se sítě dočkal dřív
    await Promise.resolve();
    expect(probuzeno).toEqual([]);
    vyprsel();
    await Promise.resolve();
    expect(probuzeno).toEqual(['a']);
  });

  it('i další doklad při už známém výpadku probudí čekající dotazy', async () => {
    vyprsel();
    vi.setSystemTime(T0 + CERSTVY_VYPADEK_MS + 5_000);
    const c = cekejNaDokladVypadku();
    let probuzeno = false;
    void c.slib.then(() => { probuzeno = true; });
    await Promise.resolve();
    expect(probuzeno).toBe(false);               // starší výpadek sám od sebe nebudí
    ohlasTicho();
    await Promise.resolve();
    expect(probuzeno).toBe(true);
    expect(cekaniNaSit()).toBe(0);               // a výpadek je zase čerstvý
  });

  it('ticho bez známého výpadku nic neznamená (pomalejší odpověď není výpadek)', () => {
    ohlasTicho();
    expect(cekaniNaSit()).toBeNull();
  });

  describe('sonda', () => {
    it('bez nastaveného dotazu se nepouští', () => {
      expect(pustSondu()).toBe(false);
    });

    it('pouští se s odstupem, i když předchozí ještě visí', () => {
      const dotaz = vi.fn(() => new Promise<void>(() => {}));
      nastavSonduSpojeni(dotaz);
      vyprsel();
      expect(pustSondu()).toBe(true);
      expect(pustSondu()).toBe(false);
      vi.setSystemTime(T0 + ODSTUP_SOND_MS - 1);
      expect(pustSondu()).toBe(false);
      vi.setSystemTime(T0 + ODSTUP_SOND_MS);
      expect(pustSondu()).toBe(true);
      expect(dotaz).toHaveBeenCalledTimes(2);
    });

    it('sonda bez odpovědi je doklad, že výpadek trvá — dokud se někdo ptá, nečeká se', () => {
      nastavSonduSpojeni(() => new Promise<void>(() => {}));
      vyprsel();
      vi.advanceTimersByTime(CERSTVY_VYPADEK_MS - 1000);       // skoro zestárl (tik sondy mezitím běžel)
      expect(cekaniNaSit()).toBe(0);
      vi.advanceTimersByTime(60_000);                          // minutu se nikdo neptá, appka je vidět
      expect(cekaniNaSit()).toBe(0);                           // … ale sondy samy dokládají, že server mlčí
    });

    it('když je appka schovaná, sama se neptá a výpadek zestárne', () => {
      const dotaz = vi.fn(() => new Promise<void>(() => {}));
      nastavSonduSpojeni(dotaz);
      const viditelnost = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      try {
        vyprsel();
        vi.advanceTimersByTime(CERSTVY_VYPADEK_MS + TIK_SOND_MS * 3);
        expect(dotaz).not.toHaveBeenCalled();
        expect(cekaniNaSit()).toBe(KRATKE_CEKANI_MS);
      } finally { viditelnost.mockRestore(); }
    });

    it('sama se ptá, dokud výpadek trvá, a přestane, jakmile server odpoví', () => {
      const dotaz = vi.fn(() => new Promise<void>(() => {}));
      nastavSonduSpojeni(dotaz);
      vi.advanceTimersByTime(TIK_SOND_MS * 3);
      expect(dotaz).not.toHaveBeenCalled();                    // bez výpadku žádné dotazy navíc
      vyprsel();
      vi.advanceTimersByTime(TIK_SOND_MS * 3);
      expect(dotaz).toHaveBeenCalledTimes(3);
      ohlasOdpovedServeru();
      vi.advanceTimersByTime(TIK_SOND_MS * 5);
      expect(dotaz).toHaveBeenCalledTimes(3);
      expect(zpet).toHaveBeenCalledTimes(1);
    });

    it('po návratu spojení nezůstane běžet žádný časovač (appka v klidu nic nedělá)', () => {
      // `advanceTimersByTime(0)` nechá doběhnout jen okamžité úlohy (zpráva o návratu, úložiště prohlížeče) —
      // pravidelné dotazování na server by po něm zůstalo viset.
      nastavSonduSpojeni(() => new Promise<void>(() => {}));
      vyprsel();
      vi.advanceTimersByTime(0);
      expect(vi.getTimerCount()).toBe(1);                      // dotazování běží
      ohlasOdpovedServeru();
      vi.advanceTimersByTime(0);
      expect(vi.getTimerCount()).toBe(0);
      // Totéž, když návrat signálu ohlásí telefon sám.
      vi.setSystemTime(T0 + 30_000);
      vyprsel(3);
      vi.advanceTimersByTime(0);
      expect(vi.getTimerCount()).toBe(1);
      zapomenVypadek();
      vi.advanceTimersByTime(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('sonda, která dostala odpověď, za doklad výpadku neplatí', () => {
      nastavSonduSpojeni(() => Promise.resolve());
      vyprsel();
      pustSondu();
      ohlasOdpovedServeru();
      vi.advanceTimersByTime(KRATKE_CEKANI_MS + 10);
      expect(cekaniNaSit()).toBeNull();
    });

    it('dotaz, který spadne už při spuštění, nic neshodí', () => {
      nastavSonduSpojeni(() => { throw new Error('nejde'); });
      vyprsel();
      expect(() => pustSondu()).not.toThrow();
      nastavSonduSpojeni(() => Promise.reject(new Error('síť')));
      vi.setSystemTime(T0 + ODSTUP_SOND_MS);
      expect(() => pustSondu()).not.toThrow();
    });
  });

  describe('po novém spuštění appky', () => {
    it('výpadek se pamatuje — další spuštění ve sklepě nečeká znovu celý limit', () => {
      vyprsel();
      expect(Number(localStorage.getItem(KLIC_VYPADKU))).toBe(T0);
      const ulozeno = localStorage.getItem(KLIC_VYPADKU)!;
      vynulujJisticProTesty();                                 // „appka se zavřela"
      localStorage.setItem(KLIC_VYPADKU, ulozeno);
      vi.setSystemTime(T0 + 5_000);
      nactiUlozenyVypadek();
      expect(cekaniNaSit()).toBe(0);
      // O dvě minuty později: jen krátké čekání.
      vynulujJisticProTesty();
      localStorage.setItem(KLIC_VYPADKU, ulozeno);
      vi.setSystemTime(T0 + 120_000);
      nactiUlozenyVypadek();
      expect(cekaniNaSit()).toBe(KRATKE_CEKANI_MS);
    });

    it('starý doklad, doklad z budoucnosti a nesmysl se zahodí', () => {
      for (const [hodnota, ted] of [
        [String(T0), T0 + PLATNOST_ULOZENEHO_VYPADKU_MS + 1],
        [String(T0 + 60_000), T0],
        ['nesmysl', T0],
      ] as const) {
        vynulujJisticProTesty();
        localStorage.setItem(KLIC_VYPADKU, hodnota);
        nactiUlozenyVypadek(ted);
        expect(cekaniNaSit(ted), hodnota).toBeNull();
        expect(localStorage.getItem(KLIC_VYPADKU), hodnota).toBeNull();
      }
    });

    it('odpověď serveru i návrat signálu uložený doklad smažou', () => {
      vyprsel();
      ohlasOdpovedServeru();
      expect(localStorage.getItem(KLIC_VYPADKU)).toBeNull();
      vi.setSystemTime(T0 + 30_000);
      vyprsel(3);
      expect(localStorage.getItem(KLIC_VYPADKU)).not.toBeNull();
      zapomenVypadek();
      expect(localStorage.getItem(KLIC_VYPADKU)).toBeNull();
      expect(cekaniNaSit()).toBeNull();
    });

    it('nastavení sondy po spuštění s uloženým výpadkem rozjede vlastní dotazy', () => {
      localStorage.setItem(KLIC_VYPADKU, String(T0 - 1000));
      nactiUlozenyVypadek();
      const dotaz = vi.fn(() => new Promise<void>(() => {}));
      nastavSonduSpojeni(dotaz);
      vi.advanceTimersByTime(TIK_SOND_MS);
      expect(dotaz).toHaveBeenCalledTimes(1);
    });
  });

  it('návrat signálu ohlášený telefonem (online) výpadek zapomene bez zprávy navíc', () => {
    vyprsel();
    window.dispatchEvent(new Event('online'));
    expect(cekaniNaSit()).toBeNull();
    vi.advanceTimersByTime(ODSTUP_ZPRAV_O_NAVRATU_MS);
    expect(zpet).not.toHaveBeenCalled();
  });
});
