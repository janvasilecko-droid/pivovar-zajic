import { describe, it, expect, vi, afterEach } from 'vitest';
import { rozmeryPoZmenseni, typObrazku, zmensenyDataUrl } from './obrazek';

describe('typObrazku', () => {
  it('přečte typ z hlavičky data URL', () => {
    expect(typObrazku('data:image/png;base64,iVBORw0KGgo=')).toBe('image/png');
    expect(typObrazku('data:image/jpeg;base64,/9j/4AAQ')).toBe('image/jpeg');
    expect(typObrazku('data:image/webp;base64,UklGRg==')).toBe('image/webp');
  });

  it('zvládne data URL bez base64 příznaku', () => {
    expect(typObrazku('data:image/svg+xml,<svg/>')).toBe('image/svg+xml');
  });

  it('když typ chybí nebo je vstup nesmysl, vrátí jpeg', () => {
    expect(typObrazku('')).toBe('image/jpeg');
    expect(typObrazku('data:;base64,AAAA')).toBe('image/jpeg');
    expect(typObrazku('https://priklad.cz/foto.png')).toBe('image/jpeg');
  });
});

// Fotka z mobilu má klidně 4–8 MB — nezmenšená appku na telefonu spolehlivě
// sekla (z provozu: „když dám vyfotit [k stočení lahví], appka spadne").
describe('zmensenyDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('bez createImageBitmap (jsdom) vrátí soubor nezmenšený, ne prázdný', async () => {
    // V testovacím prostředí createImageBitmap ani plátno s 2D kontextem
    // neexistuje — funkce se MUSÍ vrátit k původnímu souboru, ne fotku ztratit.
    const soubor = new File(['obsah-fotky'], 'foto.jpg', { type: 'image/jpeg' });
    const url = await zmensenyDataUrl(soubor);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('velký obrázek se zmenší na nejdelší stranu 1600 px, poměr stran zůstane', async () => {
    const kresli = vi.fn();
    const naDataUrl = vi.fn(() => 'data:image/jpeg;base64,ZMENSENO');
    let vytvoreneRozmery: { w: number; h: number } | null = null;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
    const puvodniCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return puvodniCreateElement(tag);
      const platno: any = puvodniCreateElement('canvas');
      Object.defineProperty(platno, 'width', {
        get: () => vytvoreneRozmery?.w ?? 0,
        set: (v) => { vytvoreneRozmery = { w: v, h: vytvoreneRozmery?.h ?? 0 }; },
      });
      Object.defineProperty(platno, 'height', {
        get: () => vytvoreneRozmery?.h ?? 0,
        set: (v) => { vytvoreneRozmery = { w: vytvoreneRozmery?.w ?? 0, h: v }; },
      });
      platno.getContext = () => ({ drawImage: kresli });
      platno.toDataURL = naDataUrl;
      return platno;
    });

    const soubor = new File(['x'], 'velka.jpg', { type: 'image/jpeg' });
    const url = await zmensenyDataUrl(soubor);

    expect(vytvoreneRozmery).toEqual({ w: 1600, h: 1200 }); // 4000×3000 → poměr 4:3 zachován
    expect(kresli).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(naDataUrl).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(url).toBe('data:image/jpeg;base64,ZMENSENO');
  });

  it('malý obrázek (menší než limit) se nezvětšuje', async () => {
    let vytvoreneRozmery: { w: number; h: number } | null = null;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 400, height: 300, close: vi.fn() }));
    const puvodniCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return puvodniCreateElement(tag);
      const platno: any = puvodniCreateElement('canvas');
      Object.defineProperty(platno, 'width', { get: () => vytvoreneRozmery?.w ?? 0, set: (v) => { vytvoreneRozmery = { w: v, h: vytvoreneRozmery?.h ?? 0 }; } });
      Object.defineProperty(platno, 'height', { get: () => vytvoreneRozmery?.h ?? 0, set: (v) => { vytvoreneRozmery = { w: vytvoreneRozmery?.w ?? 0, h: v }; } });
      platno.getContext = () => ({ drawImage: vi.fn() });
      platno.toDataURL = () => 'data:image/jpeg;base64,MALA';
      return platno;
    });

    await zmensenyDataUrl(new File(['x'], 'mala.jpg', { type: 'image/jpeg' }));
    expect(vytvoreneRozmery).toEqual({ w: 400, h: 300 });
  });

  it('když createImageBitmap selže (např. PDF), vrátí se k originálu', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nepodporovaný formát')));
    const soubor = new File(['%PDF-1.4 obsah'], 'sken.pdf', { type: 'application/pdf' });
    const url = await zmensenyDataUrl(soubor);
    expect(url).toMatch(/^data:application\/pdf;base64,/);
  });
});

// Účtenka z pokladny je dlouhý pásek (26 položek = přes 60 řádků textu). Zmenšená
// na 1600 px by písmo mělo pár pixelů a Google Vision by čísla četl špatně
// (zkoušeno 14. 10. 2026: při 1300 px na délku čte vše, při 1000 px už ne) —
// proto se dá strop a kvalita zvýšit a hlídat jen velikost výsledku.
describe('rozmeryPoZmenseni', () => {
  it('zmenší podle delší strany a drží poměr', () => {
    expect(rozmeryPoZmenseni(4000, 3000, 1600)).toEqual({ sirka: 1600, vyska: 1200 });
    expect(rozmeryPoZmenseni(3000, 4000, 3200)).toEqual({ sirka: 2400, vyska: 3200 });
  });

  it('menší obrázek nezvětšuje a nikdy nevrátí nulu', () => {
    expect(rozmeryPoZmenseni(400, 300, 1600)).toEqual({ sirka: 400, vyska: 300 });
    expect(rozmeryPoZmenseni(10000, 1, 100)).toEqual({ sirka: 100, vyska: 1 });
  });
});

describe('zmensenyDataUrl: vyšší rozlišení pro dlouhou účtenku', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Plátno, které si pamatuje rozměry a pro každé volání toDataURL vrátí další výsledek z `vysledky`. */
  function podstrcPlatno(sirka: number, vyska: number, vysledky: string[]) {
    const rozmery: { w: number; h: number }[] = [];
    let aktualni = { w: 0, h: 0 };
    const naDataUrl = vi.fn(() => {
      rozmery.push({ ...aktualni });
      return vysledky[Math.min(rozmery.length - 1, vysledky.length - 1)];
    });
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: sirka, height: vyska, close: vi.fn() }));
    const puvodni = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return puvodni(tag);
      const platno: any = puvodni('canvas');
      Object.defineProperty(platno, 'width', { get: () => aktualni.w, set: (v) => { aktualni = { ...aktualni, w: v }; } });
      Object.defineProperty(platno, 'height', { get: () => aktualni.h, set: (v) => { aktualni = { ...aktualni, h: v }; } });
      platno.getContext = () => ({ drawImage: vi.fn() });
      platno.toDataURL = naDataUrl;
      return platno;
    });
    return { rozmery, naDataUrl };
  }

  it('strop a kvalita se dají zvýšit (účtenka 3200 px, kvalita 0,88)', async () => {
    const { rozmery, naDataUrl } = podstrcPlatno(3000, 4000, ['data:image/jpeg;base64,MALE']);
    const url = await zmensenyDataUrl(new File(['x'], 'uctenka.jpg', { type: 'image/jpeg' }), { maxStrana: 3200, kvalita: 0.88 });
    expect(rozmery).toEqual([{ w: 2400, h: 3200 }]);
    expect(naDataUrl).toHaveBeenCalledWith('image/jpeg', 0.88);
    expect(url).toBe('data:image/jpeg;base64,MALE');
  });

  it('výsledek, který se nevejde do stropu, se zmenšuje dál po pětinách, dokud se nevejde', async () => {
    const dlouhy = 'data:image/jpeg;base64,' + 'A'.repeat(200);
    const { rozmery } = podstrcPlatno(3000, 4000, [dlouhy, dlouhy, 'data:image/jpeg;base64,OK']);
    const url = await zmensenyDataUrl(new File(['x'], 'uctenka.jpg', { type: 'image/jpeg' }), { maxStrana: 3200, maxZnaku: 100 });
    expect(rozmery.map((r) => r.h)).toEqual([3200, 2560, 2048]);
    expect(url).toBe('data:image/jpeg;base64,OK');
  });

  it('když se nevejde ani po třech zmenšeních, vrátí se poslední (fotka se nezahodí)', async () => {
    const dlouhy = 'data:image/jpeg;base64,' + 'A'.repeat(200);
    const { rozmery } = podstrcPlatno(3000, 4000, [dlouhy]);
    const url = await zmensenyDataUrl(new File(['x'], 'uctenka.jpg', { type: 'image/jpeg' }), { maxStrana: 3200, maxZnaku: 100 });
    expect(rozmery).toHaveLength(4);
    expect(url).toBe(dlouhy);
  });

  it('bez voleb zůstává chování stejné: 1600 px, kvalita 0,82, bez hlídání velikosti', async () => {
    const dlouhy = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
    const { rozmery, naDataUrl } = podstrcPlatno(4000, 3000, [dlouhy]);
    const url = await zmensenyDataUrl(new File(['x'], 'foto.jpg', { type: 'image/jpeg' }));
    expect(rozmery).toEqual([{ w: 1600, h: 1200 }]);
    expect(naDataUrl).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(url).toBe(dlouhy);
  });
});
