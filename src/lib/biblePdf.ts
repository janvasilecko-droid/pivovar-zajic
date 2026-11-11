/**
 * 📖 Strana z knihy jako obrázek — nákresy, tabulky a fotky originálu.
 *
 * 4. 11. 2026, majitel: „Můžeš z těch knih dát k tomu i obrázky? Přece jen
 * text je takovej ne vše říkající." Čtečka bible do té doby ukazovala jen
 * text strany; schéma varny nebo graf kvašení se z něj nedalo vyčíst.
 *
 * KNIHA SE NESTAHUJE CELÁ. Originál (PDF v úložišti bible) má i 50 MB a na
 * telefonu ve sklepě by se na jednu stranu čekalo minuty. pdf.js umí číst
 * jen kousky souboru, které na vykreslení strany potřebuje (typicky stovky
 * kB), a úložiště Supabase rozsahy umí (odpověď 206). Jenže prohlížeči
 * neukáže hlavičky Accept-Ranges a Content-Range (chybí
 * Access-Control-Expose-Headers) — vestavěné načítání pdf.js by si proto
 * myslelo, že rozsahy nejdou, a stáhlo celou knihu. Proto vlastní přenos:
 * velikost z HEAD (Content-Length je prohlížeči čitelná vždycky), kousky
 * přes hlavičku Range.
 *
 * Odkaz na soubor je podepsaný a platí 600 s (PLATNOST_ODKAZU_S v bible-api);
 * při delším čtení se obnoví sám — předem podle stáří, a kdyby úložiště
 * přesto odmítlo (400/401/403), ještě jednou po odmítnutí.
 *
 * DODATEK (11. 11. 2026). U knih s „plochým" stromem stran (všechny strany pod
 * jedním uzlem — tak ukládá PDF spousta programů, hlavně skenery) čte pdf.js
 * při otevření slovník každé strany, a ty leží rozházené po celém souboru:
 * na 40MB knize 22–26 MB a stovky dotazů, než se ukázala první strana. Worker
 * proto ke knize postaví malý dodatek (scripts/bible/dodatek.py — přírůstková
 * aktualizace PDF s vyváženým stromem stran, pár kB) a bible-api ho pošle
 * s prvním odkazem. Tady se jen přilepí za originál: bajty za koncem
 * originálu jdou z paměti, ne z úložiště. Originál se nemění; nesedí-li
 * délka originálu, dodatek se nepoužije, a kdyby s ním pdf.js selhalo,
 * čtečka knihu otevře znovu bez něj (BibleStranaKnihy).
 */
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Dodatek k PDF (přírůstková aktualizace se stromem stran) a délka originálu, ke kterému patří. */
export type DodatekPdf = { delkaOriginalu: number; data: Uint8Array };

export type Odkaz = { url: string; dodatek?: DodatekPdf | null } | { chyba: string };

/** Strop velikosti dodatku (bible_dodatky má CHECK na 2 MB). */
export const MAX_DODATKU = 2_000_000;

/** Dodatek z odpovědi bible-api ({delka_originalu, data: base64}); cokoli divného = bez dodatku. */
export function dodatekZDat(v: unknown): DodatekPdf | null {
  if (!v || typeof v !== 'object') return null;
  const { delka_originalu: delka, data } = v as Record<string, unknown>;
  if (typeof delka !== 'number' || !Number.isSafeInteger(delka) || delka <= 0) return null;
  if (typeof data !== 'string' || !data || data.length > Math.ceil(MAX_DODATKU / 3) * 4) return null;
  let bin: string;
  try {
    bin = atob(data);
  } catch {
    return null;
  }
  const bajty = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
  // Přírůstková aktualizace: začíná novým řádkem (za koncem originálu), končí %%EOF.
  if (bajty[0] !== 0x0a || !/%%EOF\s*$/.test(bin.slice(-16))) return null;
  return { delkaOriginalu: delka, data: bajty };
}

/** Chyba, kterou jde ukázat čtenáři tak, jak je. */
export class ChybaStrany extends Error {}

/** Odkaz platí 600 s; obnovit se má s rezervou, ne až po odmítnutí. */
export const OBNOVIT_ODKAZ_PO_MS = 9 * 60 * 1000;

export type ZdrojRozsahu = {
  /** Velikost souboru v bajtech (HEAD, s dodatkem i s ním); `zaloha` = velikost z knihovny, kdyby úložiště mlčelo. */
  delka(zaloha?: number | null): Promise<number>;
  /** Bajty od `od` do `do_` (bez něj) — tak, jak o ně žádá pdf.js. */
  cti(od: number, do_: number): Promise<Uint8Array>;
  /** Čte se originál s dodatkem (rozhodne se v `delka`)? */
  sDodatkem(): boolean;
};

/**
 * `ziskejOdkaz(prvni)`: `prvni` = první žádost o odkaz — jen s ní se bible-api
 * ptá i na dodatek (obnovené odkazy ho znovu neposílají).
 */
export function zdrojRozsahu(
  ziskejOdkaz: (prvni: boolean) => Promise<Odkaz>,
  volby: { fetch?: typeof fetch; ted?: () => number } = {},
): ZdrojRozsahu {
  const stahni = volby.fetch ?? ((vstup: RequestInfo | URL, init?: RequestInit) => fetch(vstup, init));
  const ted = volby.ted ?? (() => Date.now());
  let aktualni: Promise<{ url: string; od: number }> | null = null;
  let prvniHotovy = false;
  let nabidnuty: DodatekPdf | null = null;
  // Dodatek, který se opravdu čte (délka originálu sedí), a kde originál končí.
  let dodatek: DodatekPdf | null = null;

  function odkaz(): Promise<{ url: string; od: number }> {
    if (!aktualni) {
      const od = ted();
      const prvni = !prvniHotovy;
      const p = ziskejOdkaz(prvni).then((v) => {
        if ('url' in v) {
          if (prvni && !prvniHotovy) {
            prvniHotovy = true;
            nabidnuty = v.dodatek ?? null;
          }
          return { url: v.url, od };
        }
        throw new ChybaStrany(v.chyba);
      });
      aktualni = p;
      // Nepovedené získání odkazu se nesmí zapamatovat — další pokus si řekne znovu.
      p.catch(() => { if (aktualni === p) aktualni = null; });
    }
    return aktualni;
  }

  async function platnyOdkaz(): Promise<{ url: string; zdroj: Promise<{ url: string; od: number }> }> {
    let p = odkaz();
    let o = await p;
    if (ted() - o.od > OBNOVIT_ODKAZ_PO_MS) {
      // Starý odkaz zahodí jen první, kdo na to přijde; ostatní souběžní dostanou ten nový.
      if (aktualni === p) aktualni = null;
      p = odkaz();
      o = await p;
    }
    return { url: o.url, zdroj: p };
  }

  async function zavolej(init: RequestInit): Promise<Response> {
    for (let pokus = 0; ; pokus++) {
      const { url, zdroj: pouzity } = await platnyOdkaz();
      let r: Response;
      try {
        r = await stahni(url, init);
      } catch {
        throw new ChybaStrany('Stranu se nepodařilo stáhnout — zkontroluj připojení.');
      }
      if (r.ok) return r;
      // Prošlý nebo zneplatněný podpis: jednou s novým odkazem.
      if (pokus === 0 && (r.status === 400 || r.status === 401 || r.status === 403)) {
        if (aktualni === pouzity) aktualni = null;
        continue;
      }
      throw new ChybaStrany(`Úložiště knihu nevydalo (HTTP ${r.status}).`);
    }
  }

  async function ctiOriginal(od: number, do_: number): Promise<Uint8Array> {
    const r = await zavolej({ headers: { Range: `bytes=${od}-${do_ - 1}` } });
    const data = new Uint8Array(await r.arrayBuffer());
    if (r.status === 206) {
      if (data.length !== do_ - od) throw new ChybaStrany('Úložiště poslalo jiný kus souboru, než mělo.');
      return data;
    }
    // Úložiště rozsah nevzalo a poslalo celý soubor (200) — vzít z něj jen požadovaný kus.
    if (data.length < do_) throw new ChybaStrany('Úložiště poslalo neúplný soubor.');
    return data.slice(od, do_);
  }

  return {
    async delka(zaloha) {
      const r = await zavolej({ method: 'HEAD' });
      const n = Number(r.headers.get('content-length'));
      let original: number;
      if (Number.isFinite(n) && n > 0) original = n;
      else if (typeof zaloha === 'number' && zaloha > 0) original = zaloha;
      else throw new ChybaStrany('Úložiště neřeklo velikost souboru.');
      // Dodatek patří jen k souboru přesně té délky, ke které ho worker postavil.
      dodatek = nabidnuty && nabidnuty.delkaOriginalu === original ? nabidnuty : null;
      return original + (dodatek ? dodatek.data.length : 0);
    },
    async cti(od, do_) {
      const d = dodatek;
      if (!d || do_ <= d.delkaOriginalu) return ctiOriginal(od, do_);
      const konec = d.delkaOriginalu;
      // Kopie, ne pohled: pdf.js kus předá pracovnímu vláknu i s pamětí (dodatek by zmizel).
      const zDodatku = d.data.slice(Math.max(0, od - konec), do_ - konec);
      if (od >= konec) return zDodatku;
      const zOriginalu = await ctiOriginal(od, konec);
      const spojene = new Uint8Array(do_ - od);
      spojene.set(zOriginalu, 0);
      spojene.set(zDodatku, zOriginalu.length);
      return spojene;
    },
    sDodatkem: () => dodatek !== null,
  };
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let nacitaniPdfJs: Promise<PdfJs> | null = null;

/**
 * pdf.js (~150 kB gzip + pracovní vlákno ~390 kB) se stáhne, až když někdo
 * stranu z knihy opravdu otevře — do startu appky nepatří. Verze „legacy"
 * schválně: appka se staví pro starší prohlížeče (build.target es2015)
 * a moderní sestavení pdf.js potřebuje třeba Promise.withResolvers, které
 * starší iPhony nemají.
 */
export function nactiPdfJs(): Promise<PdfJs> {
  if (!nacitaniPdfJs) {
    const p = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, vlakno]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = vlakno.default;
      return pdfjs;
    });
    nacitaniPdfJs = p;
    p.catch(() => { if (nacitaniPdfJs === p) nacitaniPdfJs = null; });
  }
  return nacitaniPdfJs;
}

/**
 * Dekodéry obrázků skenů (JPEG 2000, JBIG2) a barevných profilů jsou ve
 * WebAssembly; build je kopíruje do /pdfjs/wasm/ (vite.config.ts,
 * pdfjsWasm). Při vývoji je vite servíruje rovnou z node_modules.
 */
export function adresaWasm(): string {
  const cesta = import.meta.env.DEV ? '/node_modules/pdfjs-dist/wasm/' : '/pdfjs/wasm/';
  return new URL(cesta, window.location.origin).href;
}

/**
 * Otevře originál knihy přes vlastní přenos rozsahů. Chyba stahování kousku
 * jde do `priChybe` — pdf.js sám nemá jak se o ní dozvědět a čekal by věčně.
 */
export async function otevriPdf(zdroj: ZdrojRozsahu, zalohaDelky: number | null, priChybe: (e: Error) => void): Promise<PDFDocumentLoadingTask> {
  // Souběžně: knihovna pdf.js se stahuje, zatímco se úložiště ptáme na velikost.
  const [pdfjs, delka] = await Promise.all([nactiPdfJs(), zdroj.delka(zalohaDelky)]);
  class Prenos extends pdfjs.PDFDataRangeTransport {
    private zruseno = false;
    requestDataRange(od: number, do_: number) {
      zdroj.cti(od, do_).then(
        (kus) => {
          if (this.zruseno) return;
          try {
            this.onDataRange(od, kus);
          } catch (e) {
            priChybe(e instanceof Error ? e : new Error(String(e)));
          }
        },
        (e: unknown) => { if (!this.zruseno) priChybe(e instanceof Error ? e : new Error(String(e))); },
      );
    }
    abort() {
      this.zruseno = true;
    }
  }
  return pdfjs.getDocument({
    range: new Prenos(delka, null),
    // Výchozí velikost pdf.js. Změřeno 4. 11. 2026 na knize 40 MB (378 stran):
    // pdf.js si při otevření načte slovníky všech stran, a jsou-li rozházené po
    // souboru, každý stojí celý kousek — 256 kB kousky stáhly 30 MB, 64 kB 22 MB,
    // 16 kB sice 16 MB, ale 353 dotazů. Další strany už stojí jen svůj obsah.
    rangeChunkSize: 64 * 1024,
    disableAutoFetch: true,
    disableStream: true,
    wasmUrl: adresaWasm(),
    enableXfa: false,
  });
}

/**
 * Měřítko vykreslení: šířka v CSS pixelech × hustota displeje (max. 2,
 * víc oko nepozná a paměť telefonu ano), a strop pixelů plátna — iOS
 * neumí plátno nad ~16,7 Mpx, starší Androidy ještě méně.
 */
export const MAX_PIXELU_PLATNA = 8_000_000;

export function meritkoStrany(sirkaStranyBody: number, vyskaStranyBody: number, sirkaCss: number, hustota: number): number {
  if (!(sirkaStranyBody > 0) || !(vyskaStranyBody > 0) || !(sirkaCss > 0)) return 1;
  const d = Math.min(Math.max(hustota || 1, 1), 2);
  let meritko = (sirkaCss * d) / sirkaStranyBody;
  const pixelu = sirkaStranyBody * vyskaStranyBody * meritko * meritko;
  if (pixelu > MAX_PIXELU_PLATNA) meritko *= Math.sqrt(MAX_PIXELU_PLATNA / pixelu);
  return meritko;
}

/** Je to soubor, jehož stranu umíme ukázat jako obrázek (jen PDF). */
export function umiObrazekStrany(mime: string | null | undefined, nazevSouboru?: string | null): boolean {
  if (mime) return mime.toLowerCase() === 'application/pdf';
  return /\.pdf$/i.test(nazevSouboru ?? '');
}
