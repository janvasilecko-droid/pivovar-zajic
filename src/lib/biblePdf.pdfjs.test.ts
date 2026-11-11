// @vitest-environment node
// Skutečné pdf.js na umělé knize s dodatkem od workeru (soubory v
// scripts/bible/tests/vzorky vyrábí a hlídá test workeru test_vzorek_pro_appku).
// Kniha má strom stran se zděděnými rozměry a otočením na mezilehlých uzlech
// a proud křížových odkazů; vzorek je stavěný na 1kB kousky (v appce 64 kB).
// Jen umělý text („Strana 12") — žádný obsah skutečných knih.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { zdrojRozsahu, type Odkaz } from './biblePdf';

const KNIHA = new Uint8Array(readFileSync('scripts/bible/tests/vzorky/kniha-vnoreny-strom.pdf'));
const DODATEK = new Uint8Array(readFileSync('scripts/bible/tests/vzorky/kniha-vnoreny-strom.dodatek'));

function odpoved(status: number, telo: Uint8Array, hlavicky: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(hlavicky),
    arrayBuffer: async () => telo.buffer.slice(telo.byteOffset, telo.byteOffset + telo.byteLength),
  } as unknown as Response;
}

async function otevri(sDodatkem: boolean) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = fileURLToPath(new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url));
  const rozsahy: [number, number][] = [];
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'HEAD') return odpoved(200, new Uint8Array(), { 'content-length': String(KNIHA.length) });
    const m = /^bytes=(\d+)-(\d+)$/.exec(String((init?.headers as Record<string, string>).Range));
    if (!m) throw new Error('čekal jsem Range');
    rozsahy.push([Number(m[1]), Number(m[2]) + 1]);
    return odpoved(206, KNIHA.slice(Number(m[1]), Number(m[2]) + 1));
  };
  const zdroj = zdrojRozsahu(async (prvni): Promise<Odkaz> => ({
    url: 'https://bible.test/storage/v1/object/sign/knihovna/k.pdf?token=a',
    ...(prvni && sDodatkem ? { dodatek: { delkaOriginalu: KNIHA.length, data: DODATEK } } : {}),
  }), { fetch: fetch as typeof globalThis.fetch });
  const delka = await zdroj.delka();
  class Prenos extends pdfjs.PDFDataRangeTransport {
    requestDataRange(od: number, do_: number) {
      void zdroj.cti(od, do_).then((kus) => this.onDataRange(od, kus));
    }
  }
  const ukol = pdfjs.getDocument({
    range: new Prenos(delka, null), rangeChunkSize: 1024, disableAutoFetch: true, disableStream: true, enableXfa: false, verbosity: 0,
  });
  return { pdf: await ukol.promise, ukol, rozsahy, zdroj };
}

async function strana(pdf: Awaited<ReturnType<typeof otevri>>['pdf'], cislo: number) {
  const s = await pdf.getPage(cislo);
  const text = (await s.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('').trim();
  const v = s.getViewport({ scale: 1 });
  return { text, sirka: v.width, vyska: v.height, otoceni: s.rotate };
}

describe('dodatek se skutečným pdf.js', () => {
  it('stejné strany jako z holého originálu — z úložiště jen zlomek dotazů', async () => {
    const bez = await otevri(false);
    const s = await otevri(true);
    try {
      expect(s.zdroj.sDodatkem()).toBe(true);
      expect(bez.zdroj.sDodatkem()).toBe(false);
      expect(s.pdf.numPages).toBe(24);
      expect(bez.pdf.numPages).toBe(24);
      for (const cislo of [24, 1, 4, 13]) {
        expect(await strana(s.pdf, cislo)).toEqual(await strana(bez.pdf, cislo));
      }
      // Zděděné vlastnosti z mezilehlých uzlů originálu (strany se dál dědí přes /Parent).
      expect(await strana(s.pdf, 1)).toEqual({ text: 'Strana 1', sirka: 500, vyska: 700, otoceni: 0 });
      expect(await strana(s.pdf, 4)).toMatchObject({ text: 'Strana 4', otoceni: 180 });
      expect(await strana(s.pdf, 24)).toEqual({ text: 'Strana 24', sirka: 842, vyska: 595, otoceni: 90 });
      // Z úložiště se nečte nic za koncem originálu.
      expect(s.rozsahy.every(([, do_]) => do_ <= KNIHA.length)).toBe(true);
    } finally {
      await bez.ukol.destroy();
      await s.ukol.destroy();
    }
  });

  it('otevření a poslední strana: s dodatkem pár kousků, bez něj slovník každé strany', async () => {
    const bez = await otevri(false);
    const s = await otevri(true);
    try {
      await strana(bez.pdf, 24);
      await strana(s.pdf, 24);
      expect(s.rozsahy.length).toBeLessThanOrEqual(6);
      expect(bez.rozsahy.length).toBeGreaterThanOrEqual(2 * s.rozsahy.length);
    } finally {
      await bez.ukol.destroy();
      await s.ukol.destroy();
    }
  });
});
