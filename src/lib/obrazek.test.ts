import { describe, it, expect, vi, afterEach } from 'vitest';
import { typObrazku, zmensenyDataUrl } from './obrazek';

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
