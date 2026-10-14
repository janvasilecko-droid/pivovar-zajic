// 🧾 Zadání uzávěrky z pokladny: fotka → přečtené řádky ke kontrole → zápis.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: „ať to appka dokáže přečíst z fotky, ať to odečítá tyhle
// data ze skladu, volba zadat uzávěrku denní, týdenní, měsíční."
//
// Nahoře je ukotvená fotka, pod ní řádky ke kontrole (stejně jako u objednávek
// a výdeje ze skladu). Řádky se kontrolují proti sobě: množství × cena = částka
// a součet částek = „Celkem" z účtenky. Uzávěrka se nezapíše, dokud nesedí —
// špatně přečtené číslo by tiše rozhodilo sklad.
//
// Zboží se pozná podle KÓDU z pokladny. Poprvé se kód přiřadí k pivu a obalu
// (návrh z názvu se musí potvrdit), příště už se nehádá.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Modal } from '../ui';
import { PhotoReviewPane } from '../PhotoReviewPane';
import { authenticatedFunctionHeaders } from '../../lib/functionAuth';
import { typObrazku, zmensenyDataUrl } from '../../lib/obrazek';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, uspech } from '../../lib/toast';
import { NAZVY_TYPU, uzaverkyPresInventuru, type TypUzaverky } from '../../lib/obchodSklad';
import { vysvetleniPresInventuru } from './ObchodMezery';
import {
  datumZVytisteno, najdiDuplicity, navrhZbozi, obdobiUzaverky, popisZapsane, pripravZapis, type PrirazeniRadku,
} from '../../lib/obchodUzaverka';
import { popisSlouceni, slucUctenky, vlozPodleKodu } from '../../lib/uctenkaSlouceni';
import { zapisUzaverku, type DataObchodu } from '../../lib/obchodData';
import {
  cislo as cisloZTextu, normalizujUzaverku, souctRadku, zkontrolujUzaverku,
  type PrectenaUzaverka, type ProblemUzaverky, type RadekUzaverky,
} from '../../../supabase/functions/_shared/uzaverka';

/**
 * Účtenka z pokladny je dlouhý pásek (26 položek = přes 60 řádků textu) a musí se
 * vejít na JEDNU fotku. Zmenšená na 1600 px by písmo mělo pár pixelů a čísla by
 * se četla špatně (zkoušeno 14. 10. 2026: při 1300 px na délku čte Google Vision
 * vše, při 1000 px už ne), proto se fotka zmenšuje jen na 3200 px a ve vyšší
 * kvalitě; velikost se hlídá, aby šla odeslat.
 */
const VOLBY_FOTKY_UCTENKY = { maxStrana: 3200, kvalita: 0.88, maxZnaku: 4_800_000 };

type Volba = { beerId: string; pkgId: string; ostatni: boolean; potvrzeno: boolean };

type Radek = {
  id: number;
  kod: string;
  nazev: string;
  ks: string;
  cena: string;
  celkem: string;
  /** Zboží už v obchodě je — přiřazení se nemění tady. */
  zname: boolean;
  volba: Volba;
  smazano: boolean;
};

const TYPY: TypUzaverky[] = ['denni', 'tydenni', 'mesicni'];

const text = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n));
const kc = (n: number) => `${Math.round(n * 100) / 100} Kč`.replace('.', ',');

/** Řádek okna (texty z políček) jako číselný řádek účtenky. */
function radekNaUzaverku(r: Radek): RadekUzaverky {
  return {
    kod: r.kod.trim(),
    nazev: r.nazev.trim(),
    mnozstvi: r.ks.trim() === '' ? Number.NaN : (cisloZTextu(r.ks) ?? Number.NaN),
    cena: r.cena.trim() === '' ? null : cisloZTextu(r.cena),
    celkem: r.celkem.trim() === '' ? null : cisloZTextu(r.celkem),
  };
}

/** Všechno, co okno o načtené účtence zrovna drží. */
type ModelOkna = { radky: Radek[] | null; cisloUz: string; stredisko: string; vytisteno: string | null; celkem: string };

function uctenkaZModelu(m: ModelOkna): PrectenaUzaverka {
  return {
    cislo: m.cisloUz.trim() || null,
    stredisko: m.stredisko.trim() || null,
    vytisteno: m.vytisteno,
    celkem: cisloZTextu(m.celkem),
    radky: (m.radky ?? []).filter((r) => !r.smazano).map(radekNaUzaverku),
  };
}

type FotkaUctenky = { dataUrl: string; name: string };

function prirazeniZVolby(r: Radek): PrirazeniRadku {
  if (r.zname) return { druh: 'zname' };
  if (r.volba.ostatni) return { druh: 'ostatni' };
  if (r.volba.beerId && r.volba.pkgId && r.volba.potvrzeno) return { druh: 'pivo', beerId: r.volba.beerId, pkgId: r.volba.pkgId };
  return { druh: 'nevyreseno' };
}

export function UzaverkaImport({ data, zapsal, vychoziTyp, vychoziObdobi, onClose, onUlozeno }: {
  data: DataObchodu;
  zapsal: string | null;
  vychoziTyp: TypUzaverky | null;
  /** Období předvyplněné zvenku (třeba z mezery v uzávěrkách) — nepřepočítává se podle data tisku. */
  vychoziObdobi?: { od: string; do: string };
  onClose: () => void;
  onUlozeno: () => void;
}) {
  const dnes = businessDateISO();
  const [typ, setTyp] = useState<TypUzaverky | null>(vychoziTyp);
  // Účtenka je nejlíp na JEDNÉ fotce; když se nevejde, přidávají se další části (viz pridejCast).
  const [fotky, setFotky] = useState<FotkaUctenky[]>([]);
  const [aktivniFotka, setAktivniFotka] = useState(0);
  const fotka = fotky[0] ?? null;
  /** Co se stalo po přidání další fotky (kolik řádků přibylo, které už byly) — a kódy s rozdílnými čísly. */
  const [slouceni, setSlouceni] = useState<{ text: string; rozdilne: string[] } | null>(null);
  const [cte, setCte] = useState(false);
  const [chybaCteni, setChybaCteni] = useState<string | null>(null);
  const [radky, setRadky] = useState<Radek[] | null>(null);
  const [cisloUz, setCisloUz] = useState('');
  const [stredisko, setStredisko] = useState('');
  const [vytisteno, setVytisteno] = useState<string | null>(null);
  const [celkem, setCelkem] = useState('');
  const [od, setOd] = useState(vychoziObdobi?.od ?? dnes);
  const [doDne, setDoDne] = useState(vychoziObdobi?.do ?? dnes);
  const [obdobiRucne, setObdobiRucne] = useState(!!vychoziObdobi);
  const [poznamka, setPoznamka] = useState('');
  const [potvrzeno, setPotvrzeno] = useState(false);
  const [souhlasPresInventuru, setSouhlasPresInventuru] = useState(false);
  const [souhlasPodobna, setSouhlasPodobna] = useState(false);
  const [souhlasBezCisla, setSouhlasBezCisla] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [chyby, setChyby] = useState<string[]>([]);
  const dalsiId = useRef(1);
  const souborRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const pridatSouborRef = useRef<HTMLInputElement>(null);
  const pridatKameraRef = useRef<HTMLInputElement>(null);
  // Aktuální stav okna pro slučování fotek za sebou: čtení další fotky trvá, a mezi tím se okno
  // překresluje — fotky se zpracovávají jedna po druhé a každá se skládá na výsledek té předchozí.
  const modelRef = useRef<ModelOkna>({ radky: null, cisloUz: '', stredisko: '', vytisteno: null, celkem: '' });
  const fotkyRef = useRef<FotkaUctenky[]>([]);

  function nastavObdobi(t: TypUzaverky | null, datum: string) {
    if (!t) return;
    const o = obdobiUzaverky(t, datum);
    setOd(o.od);
    setDoDne(o.do);
  }

  function vyberTyp(t: TypUzaverky) {
    setTyp(t);
    // Období se přepočítá podle typu, dokud ho někdo neupravil ručně.
    if (!obdobiRucne) nastavObdobi(t, datumZVytisteno(vytisteno) ?? dnes);
  }

  function radkyZUctenky(u: PrectenaUzaverka): Radek[] {
    const znama = new Map(data.zbozi.map((z) => [z.kod, z]));
    return u.radky.map((r) => {
      const id = dalsiId.current++;
      const zname = znama.has(r.kod);
      const n = navrhZbozi(r.nazev, data.piva, data.obaly);
      return {
        id, kod: r.kod, nazev: r.nazev, ks: text(r.mnozstvi), cena: text(r.cena), celkem: text(r.celkem), zname, smazano: false,
        volba: zname
          ? { beerId: '', pkgId: '', ostatni: false, potvrzeno: true }
          // Pivo se navrhne (a musí se potvrdit), ostatní zboží se rovnou bere jako ostatní.
          : { beerId: n.beer?.id ?? '', pkgId: n.pkg?.id ?? '', ostatni: !n.jePivo, potvrzeno: false },
      };
    });
  }

  /** Přečte fotku přes edge funkci a vrátí účtenku; chyba je výjimka s čitelným textem. */
  async function cteniZFotky(dataUrl: string): Promise<PrectenaUzaverka> {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-uzaverka-image`, {
      method: 'POST',
      headers: await authenticatedFunctionHeaders(),
      body: JSON.stringify({ imageBase64: dataUrl.split(',')[1] ?? '', imageMimeType: typObrazku(dataUrl) }),
    });
    const odpoved = await resp.text();
    if (!resp.ok) {
      let m = `HTTP ${resp.status}`;
      try { m += ': ' + (JSON.parse(odpoved)?.error ?? odpoved); } catch { m += ': ' + odpoved; }
      throw new Error(m);
    }
    let json: unknown;
    try { json = JSON.parse(odpoved); } catch { throw new Error('Neplatná odpověď: ' + odpoved.slice(0, 200)); }
    if ((json as { error?: string })?.error) throw new Error((json as { error: string }).error);
    const u = normalizujUzaverku(json);
    if (u.radky.length === 0) throw new Error('Na fotce se nepodařilo přečíst žádné řádky.');
    return u;
  }

  function nastavFotky(f: FotkaUctenky[], aktivni: number) {
    fotkyRef.current = f;
    setFotky(f);
    setAktivniFotka(aktivni);
  }

  /**
   * Fotky z fotoaparátu nebo z galerie. Bez `pridat` první fotka NAHRADÍ všechno načtené, každá další
   * (výběr víc souborů najednou) se k načtenému přidává; s `pridat` se přidávají všechny.
   */
  async function nactiFotky(soubory: File[], pridat = false) {
    if (!soubory.length) return;
    setChybaCteni(null);
    let nahradit = !pridat || modelRef.current.radky === null;
    for (const soubor of soubory) {
      let dataUrl: string;
      try {
        dataUrl = await zmensenyDataUrl(soubor, VOLBY_FOTKY_UCTENKY);
      } catch (e) {
        setChybaCteni('Fotku se nepodařilo načíst: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }
      if (nahradit) {
        nastavFotky([{ dataUrl, name: soubor.name }], 0);
        await precti(dataUrl);
        if (modelRef.current.radky === null) return;   // první čtení se nepovedlo — další fotky nemají k čemu přidávat
        nahradit = false;
      } else if (!(await pridejCast(dataUrl, soubor.name))) {
        return;
      }
    }
  }

  /** Čtení první (nebo jediné) fotky: nahradí všechny načtené řádky. */
  async function precti(dataUrl: string) {
    setCte(true);
    setChybaCteni(null);
    setSlouceni(null);
    setRadky(null);
    modelRef.current = { radky: null, cisloUz: '', stredisko: '', vytisteno: null, celkem: '' };
    try {
      const u = await cteniZFotky(dataUrl);
      const nove = radkyZUctenky(u);
      modelRef.current = { radky: nove, cisloUz: u.cislo ?? '', stredisko: u.stredisko ?? '', vytisteno: u.vytisteno, celkem: text(u.celkem) };
      setRadky(nove);
      setCisloUz(u.cislo ?? '');
      setStredisko(u.stredisko ?? '');
      setVytisteno(u.vytisteno);
      setCelkem(text(u.celkem));
      setPotvrzeno(false);
      setSouhlasPodobna(false);
      setSouhlasBezCisla(false);
      if (!obdobiRucne) nastavObdobi(typ, datumZVytisteno(u.vytisteno) ?? dnes);
    } catch (e) {
      setChybaCteni('Čtení z fotky selhalo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCte(false);
    }
  }

  /**
   * Další část téže účtenky (když se nevešla na jednu fotku). Řádky se slučují podle KÓDU zboží:
   * řádek, který je na obou fotkách se stejnými čísly, se podruhé nepřidá (jinak by se prodané kusy
   * odečetly dvakrát), utržený řádek se doplní, stejný kód s jinými čísly se ohlásí a jiná účtenka
   * (jiné číslo uzávěrky, čas tisku nebo Celkem) se nepřidá vůbec. Vrací, jestli se fotka přidala.
   */
  async function pridejCast(dataUrl: string, nazev: string): Promise<boolean> {
    setCte(true);
    setChybaCteni(null);
    try {
      const u = await cteniZFotky(dataUrl);
      const m = modelRef.current;
      const v = slucUctenky(uctenkaZModelu(m), u);
      if (v.jina) {
        setChybaCteni(`${v.jina} Fotka se nepřidala — jedna uzávěrka je jedna účtenka. Je-li to jiná účtenka, zadej ji zvlášť.`);
        return false;
      }
      // Utržené řádky z předchozí fotky, které tahle fotka má celé.
      const doplnene = (m.radky ?? []).map((r) => {
        const d = r.smazano ? undefined : v.doplnit.find((x) => x.kod === r.kod.trim());
        return d ? { ...r, ks: text(d.radek.mnozstvi), cena: text(d.radek.cena), celkem: text(d.radek.celkem) } : r;
      });
      const radkyNove = vlozPodleKodu(doplnene, radkyZUctenky({ ...u, radky: v.pridat }));
      const novy: ModelOkna = {
        radky: radkyNove,
        cisloUz: v.hlavicka.cislo ?? m.cisloUz,
        stredisko: v.hlavicka.stredisko ?? m.stredisko,
        vytisteno: v.hlavicka.vytisteno ?? m.vytisteno,
        celkem: v.hlavicka.celkem != null ? text(v.hlavicka.celkem) : m.celkem,
      };
      modelRef.current = novy;
      setRadky(radkyNove);
      setCisloUz(novy.cisloUz);
      setStredisko(novy.stredisko);
      setVytisteno(novy.vytisteno);
      setCelkem(novy.celkem);
      setPotvrzeno(false);
      setSouhlasPodobna(false);   // souhlas patřil k jiným řádkům
      setSlouceni({ text: popisSlouceni(v), rozdilne: v.rozdilne });
      nastavFotky([...fotkyRef.current, { dataUrl, name: nazev }], fotkyRef.current.length);
      if (v.hlavicka.vytisteno && !obdobiRucne) nastavObdobi(typ, datumZVytisteno(v.hlavicka.vytisteno) ?? dnes);
      return true;
    } catch (e) {
      setChybaCteni('Čtení další fotky selhalo: ' + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      setCte(false);
    }
  }

  function zacniRucne() {
    setChybaCteni(null);
    setRadky([]);
    pridejRadek();
  }

  function pridejRadek() {
    setRadky((rs) => [...(rs ?? []), {
      id: dalsiId.current++, kod: '', nazev: '', ks: '', cena: '', celkem: '', zname: false, smazano: false,
      volba: { beerId: '', pkgId: '', ostatni: false, potvrzeno: false },
    }]);
  }

  const uprav = (id: number, patch: Partial<Radek>) =>
    setRadky((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const upravVolbu = (id: number, patch: Partial<Volba>) =>
    setRadky((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, volba: { ...r.volba, ...patch } } : r)));

  /** Změna kódu: zboží, které v obchodě už je, se pozná hned. */
  function zmenKod(id: number, kod: string) {
    const z = data.zbozi.find((x) => x.kod === kod.trim());
    uprav(id, { kod: kod.trim(), zname: !!z });
  }

  const platne = (radky ?? []).filter((r) => !r.smazano);
  // Slučování další fotky vychází z toho, co je v okně právě teď (i s opravami obsluhy).
  modelRef.current = { radky, cisloUz, stredisko, vytisteno, celkem };

  const uctenka: PrectenaUzaverka = useMemo(() => ({
    cislo: cisloUz.trim() || null,
    stredisko: stredisko.trim() || null,
    vytisteno,
    celkem: cisloZTextu(celkem),
    radky: platne.map(radekNaUzaverku),
  }), [cisloUz, stredisko, vytisteno, celkem, platne]);

  const kontrola = useMemo(() => zkontrolujUzaverku(uctenka), [uctenka]);
  // Co na fotce chybí z celé účtenky: začátek (číslo uzávěrky, čas tisku) a konec (Celkem).
  // Údaj, který obsluha doplní ručně, z výčtu zmizí.
  const neuplnaFotka = useMemo(() => {
    const t: string[] = [];
    if (!cisloUz.trim() && !vytisteno) t.push('Chybí začátek účtenky (číslo uzávěrky a „Vytištěno“) — bez čísla se nepozná, že už je uzávěrka zapsaná.');
    if (celkem.trim() === '') t.push('Chybí konec účtenky (řádek „Celkem“) — bez něj nejde ověřit, že žádný řádek nechybí.');
    return t;
  }, [cisloUz, vytisteno, celkem]);
  const problemyRadku = (i: number): ProblemUzaverky[] => kontrola.problemy.filter((p) => p.radek === i);
  const problemyCelku = kontrola.problemy.filter((p) => p.radek === null);
  const nepotvrzeno = platne.filter((r) => !r.zname && !r.volba.ostatni && !r.volba.potvrzeno && r.volba.beerId && r.volba.pkgId);
  // Řádky, u kterých appka nenavrhla (nebo nenašla) pivo a obal — bez výběru nejde zapsat.
  const nevyreseno = platne.filter((r) => !r.zname && !r.volba.ostatni && !(r.volba.beerId && r.volba.pkgId));
  const chybyRef = useRef<HTMLUListElement>(null);
  // Období téhle uzávěrky přetíná inventuru → prodej před ní by se odečetl podruhé.
  const presInventuru = useMemo(
    () => uzaverkyPresInventuru([{ id: 'nova', datum_od: od, datum_do: doDne, cislo: null }], data.inventury),
    [od, doDne, data.inventury],
  );

  // Tatáž účtenka zapsaná podruhé (třeba vyfocená na víckrát) by odečetla kusy ze skladu dvakrát.
  const duplicity = useMemo(
    () => najdiDuplicity({ od, do: doDne, stredisko: uctenka.stredisko, vytisteno, celkem: uctenka.celkem, radky: uctenka.radky }, data.uzaverky, data.radky),
    [od, doDne, uctenka, vytisteno, data.uzaverky, data.radky],
  );
  const bezCisla = platne.length > 0 && !cisloUz.trim();

  /** Odroluje na řádek (okno je dlouhé a nahoře drží fotka — chyba dole by jinak nebyla vidět). */
  function skocNaRadek(id: number) {
    document.getElementById(`uz-radek-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function potvrdVse() {
    setRadky((rs) => (rs ?? []).map((r) => (!r.zname && !r.volba.ostatni && r.volba.beerId && r.volba.pkgId ? { ...r, volba: { ...r.volba, potvrzeno: true } } : r)));
  }

  async function uloz() {
    setChyby([]);
    const zapis = pripravZapis({
      typ, od, do: doDne,
      cislo: uctenka.cislo, stredisko: uctenka.stredisko, vytisteno, celkem: uctenka.celkem,
      radky: uctenka.radky.map((r, i) => ({ ...r, prirazeni: prirazeniZVolby(platne[i]) })),
      znameZbozi: data.zbozi,
      existujiciUzaverky: data.uzaverky,
      zapsaneRadky: data.radky,
      potvrzenoBezCisla: souhlasBezCisla,
      souhlasPodobna,
    });
    if (zapis.chyby.length > 0) {
      setChyby(zapis.chyby);
      // Seznam chyb je pod celým seznamem řádků — bez odrolování by klepnutí na „Uložit" vypadalo, že se nic nestalo.
      setTimeout(() => chybyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
      return;
    }
    if (!typ) return;
    setUklada(true);
    try {
      const e = await zapisUzaverku({
        typ, od, do: doDne, cislo: uctenka.cislo, stredisko: uctenka.stredisko, vytisteno,
        trzba: uctenka.celkem, poznamka: poznamka.trim() || null, zapsal,
        radky: uctenka.radky.map((r) => ({ kod: r.kod, nazev: r.nazev, mnozstvi: r.mnozstvi, cena: r.cena, celkem: r.celkem })),
        noveZbozi: zapis.noveZbozi,
      });
      if (e) { setChyby([e]); return; }
      uspech(`Uzávěrka uložena — ${uctenka.radky.length} položek odečteno ze skladu obchodu.`);
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  const soucet = souctRadku(uctenka.radky);
  const lzeUlozit = !!typ && platne.length > 0 && kontrola.problemy.length === 0 && nevyreseno.length === 0 && nepotvrzeno.length === 0
    && (presInventuru.length === 0 || souhlasPresInventuru)
    && duplicity.stejna.length === 0 && (duplicity.podobne.length === 0 || souhlasPodobna)
    && (!bezCisla || souhlasBezCisla)
    && potvrzeno && !uklada;
  const prvniProblemRadek = kontrola.problemy.find((x) => x.radek !== null)?.radek ?? null;

  return (
    <Modal open onClose={onClose} title="Zadat uzávěrku z pokladny" wide maxWidth="max-w-5xl">
      <div className="space-y-4">
        <div>
          <div className="text-xs font-black text-neutral-700 mb-1">Jaká uzávěrka to je</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPY.map((t) => (
              <button
                key={t}
                type="button"
                className={`btn-zalozka px-4 ${typ === t ? 'btn-zalozka-aktivni' : ''}`}
                aria-pressed={typ === t}
                onClick={() => vyberTyp(t)}
              >
                {NAZVY_TYPU[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input ref={souborRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <button type="button" className="btn-primary !rounded flex items-center gap-2" disabled={cte} onClick={() => kameraRef.current?.click()}>
            <Camera size={16} /> Vyfotit uzávěrku
          </button>
          <button type="button" className="btn-ghost !rounded flex items-center gap-2" disabled={cte} onClick={() => souborRef.current?.click()}>
            <Upload size={16} /> Fotka z galerie
          </button>
          {radky === null && (
            <button type="button" className="btn-ghost !rounded text-xs" disabled={cte} onClick={zacniRucne}>Zadat ručně bez fotky</button>
          )}
        </div>
        {radky === null && (
          <p className="text-xs font-semibold text-neutral-700">
            Účtenka z pokladny je dlouhý pásek — vyfoť ji <strong>celou najednou</strong>, od „Sumář prodeje“ nahoře až po „Celkem“ dole,
            zpříma a ostře. Na jedné fotce se čísla ověří proti součtu a nic se nezdvojí.
          </p>
        )}

        {cte && <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 text-sm font-bold text-primary-900">Čtu fotku…</div>}
        {chybaCteni && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{chybaCteni}</span>
          </div>
        )}

        {fotky.length > 0 && (
          <div className="sticky top-0 z-20 -mx-6 bg-white border-b-2 border-primary-200 shadow-md">
            <div className="h-[38vh] sm:h-[42vh]">
              <PhotoReviewPane photos={fotky} activeIndex={Math.min(aktivniFotka, fotky.length - 1)} onChangeIndex={setAktivniFotka} />
            </div>
          </div>
        )}
        {fotky.length > 0 && radky !== null && (
          <div className="space-y-1.5">
            <input ref={pridatSouborRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? []), true); e.target.value = ''; }} />
            <input ref={pridatKameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? []), true); e.target.value = ''; }} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" disabled={cte} onClick={() => pridatKameraRef.current?.click()}>
                <Plus size={14} /> Přidat další fotku
              </button>
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" disabled={cte} onClick={() => pridatSouborRef.current?.click()}>
                <Upload size={14} /> z galerie
              </button>
              <span className="text-[11px] font-semibold text-neutral-600">
                Nevešla se účtenka na jednu fotku? Přidej další část — řádky, které jsou na obou fotkách, se nesečtou podruhé.
              </span>
            </div>
            {slouceni && (
              <div role="status" aria-label="Další fotka přidána" className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-900 space-y-1">
                <div className="flex items-start gap-1.5"><Check size={13} className="shrink-0 mt-0.5" /> <span>{slouceni.text}</span></div>
                {slouceni.rozdilne.length > 0 && (
                  <div className="flex items-start gap-1.5 text-amber-900">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      {slouceni.rozdilne.length === 1 ? 'Kód' : 'Kódy'} {slouceni.rozdilne.join(', ')} {slouceni.rozdilne.length === 1 ? 'je' : 'jsou'} na fotkách s RŮZNÝMI čísly —
                      jedno čtení je špatné. Nech jen správný řádek (druhý odstraň), jinak se uzávěrka nezapíše.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {fotka && radky === null && !cte && (
          <button type="button" className="btn-ghost !rounded text-xs flex items-center gap-1" onClick={() => void precti(fotka.dataUrl)}>
            <RotateCcw size={14} /> Zkusit přečíst znovu
          </button>
        )}

        {radky !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="label" htmlFor="uz-cislo">Číslo uzávěrky</label>
                <input id="uz-cislo" className="input font-bold" value={cisloUz} onChange={(e) => setCisloUz(e.target.value)} placeholder="2/2873" />
              </div>
              <div>
                <label className="label" htmlFor="uz-stredisko">Středisko</label>
                <input id="uz-stredisko" className="input font-bold" value={stredisko} onChange={(e) => setStredisko(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="uz-od">Období od</label>
                <input id="uz-od" type="date" className="input font-bold" value={od} onChange={(e) => { setOd(e.target.value); setObdobiRucne(true); }} />
              </div>
              <div>
                <label className="label" htmlFor="uz-do">Období do</label>
                <input id="uz-do" type="date" className="input font-bold" value={doDne} onChange={(e) => { setDoDne(e.target.value); setObdobiRucne(true); }} />
              </div>
            </div>
            {bezCisla && (
              <label className="flex items-start gap-2 text-xs font-bold text-amber-900 cursor-pointer select-none">
                <input type="checkbox" className="w-5 h-5 shrink-0" checked={souhlasBezCisla} onChange={(e) => setSouhlasBezCisla(e.target.checked)} />
                <span>
                  Chybí číslo uzávěrky. Podle něj se pozná, že už je účtenka zapsaná — opiš ho ze začátku účtenky („Uzaverka: 2/2873“),
                  nebo zaškrtni, že účtenka číslo nemá.
                </span>
              </label>
            )}
            <div className="text-xs font-semibold text-neutral-600">
              Odečet ze skladu platí ke dni <strong>{doDne}</strong> (konec období).
              {vytisteno ? <> Vytištěno {vytisteno.replace('T', ' ')}.</> : null}
            </div>

            {fotka && neuplnaFotka.length > 0 && (
              <div role="status" aria-label="Fotka není úplná" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-1.5 text-amber-950">
                <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Na fotce není celá účtenka</div>
                <ul className="text-xs font-bold space-y-0.5 list-disc pl-5">
                  {neuplnaFotka.map((t) => <li key={t}>{t}</li>)}
                </ul>
                <div className="text-xs font-semibold">
                  Vyfoť účtenku <strong>celou najednou</strong> (od „Sumář prodeje“ po „Celkem“) a načti ji znovu, přidej další část účtenky,
                  nebo chybějící údaje opiš z papíru.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold flex items-center gap-1" disabled={cte} onClick={() => kameraRef.current?.click()}>
                    <Camera size={14} /> Vyfotit znovu
                  </button>
                  <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold flex items-center gap-1" disabled={cte} onClick={() => pridatKameraRef.current?.click()}>
                    <Plus size={14} /> Přidat další fotku
                  </button>
                </div>
              </div>
            )}

            {duplicity.stejna.length > 0 && (
              <div role="alert" aria-label="Účtenka už je zapsaná" className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 space-y-1.5 text-rose-950">
                <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Tahle účtenka už je zapsaná</div>
                <ul className="text-xs font-bold space-y-0.5 list-disc pl-5">
                  {duplicity.stejna.map((u) => (
                    <li key={u.id ?? popisZapsane(u)}>Uzávěrka {popisZapsane(u)} má stejný čas tisku ({(u.vytisteno ?? '').slice(0, 16).replace('T', ' ')}) i stejné Celkem.</li>
                  ))}
                </ul>
                <div className="text-xs font-semibold">
                  Znovu se zapsat nedá — prodané kusy by se ze skladu odečetly podruhé. Když jsi účtenku fotil na víckrát,
                  dej všechny fotky do JEDNOHO okna (Přidat další fotku).
                </div>
              </div>
            )}
            {duplicity.podobne.length > 0 && (
              <div role="alert" aria-label="Podobná uzávěrka už je zapsaná" className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 space-y-2 text-rose-950">
                <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Podobná uzávěrka už je zapsaná</div>
                <ul className="text-xs font-bold space-y-0.5 list-disc pl-5">
                  {duplicity.podobne.map((pod) => (
                    <li key={pod.uzaverka.id ?? popisZapsane(pod.uzaverka)}>Uzávěrka {popisZapsane(pod.uzaverka)}: {pod.shodnych} z {pod.zNovych} řádků úplně stejných (kód, množství i cena).</li>
                  ))}
                </ul>
                <div className="text-xs font-semibold">Nejspíš tatáž účtenka vyfocená podruhé — ze skladu by se odečetla dvakrát.</div>
                <label className="flex items-start gap-2 text-xs font-bold cursor-pointer select-none">
                  <input type="checkbox" className="w-5 h-5 shrink-0" checked={souhlasPodobna} onChange={(e) => setSouhlasPodobna(e.target.checked)} />
                  Je to jiná účtenka — uložit i tak.
                </label>
              </div>
            )}

            {presInventuru.length > 0 && (
              <div role="alert" className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 space-y-2 text-rose-950">
                <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Tahle uzávěrka přetíná inventuru</div>
                <div className="text-xs font-bold">{vysvetleniPresInventuru(presInventuru[0])}</div>
                <div className="text-[11px] font-semibold">Lepší je zadat denní uzávěrky, nebo mít inventuru k poslednímu dni uzávěrky ({doDne}).</div>
                <label className="flex items-start gap-2 text-xs font-bold cursor-pointer select-none">
                  <input type="checkbox" className="w-5 h-5 shrink-0" checked={souhlasPresInventuru} onChange={(e) => setSouhlasPresInventuru(e.target.checked)} />
                  Přesto uložit — vím, že sklad bude o prodej do {Number(presInventuru[0].inventura.slice(8, 10))}. {Number(presInventuru[0].inventura.slice(5, 7))}. nižší.
                </label>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary-600" /> Přečtené řádky ke kontrole ({platne.length})
              </h3>
              <div className="flex gap-1.5">
                {nepotvrzeno.length > 0 && (
                  <button type="button" className="btn-emerald !rounded !py-1.5 text-xs" onClick={potvrdVse}>
                    <Check size={14} className="inline mr-1" /> Potvrdit navržené zboží ({nepotvrzeno.length})
                  </button>
                )}
                <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={pridejRadek}>
                  <Plus size={14} className="inline mr-1" /> Řádek
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {radky.map((r) => {
                if (r.smazano) {
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border border-neutral-200 bg-neutral-100 text-xs text-neutral-600">
                      <span className="line-through truncate">{r.kod} {r.nazev}</span>
                      <button type="button" className="font-bold text-primary-700 flex items-center gap-1" onClick={() => uprav(r.id, { smazano: false })}><RotateCcw size={12} /> Obnovit</button>
                    </li>
                  );
                }
                const i = platne.indexOf(r);
                const problemy = problemyRadku(i);
                const navrzeno = !r.zname && !r.volba.ostatni && !r.volba.potvrzeno && r.volba.beerId && r.volba.pkgId;
                const zbozi = r.zname ? data.zbozi.find((z) => z.kod === r.kod) : undefined;
                const popisZnameho = zbozi?.beer_id
                  ? `${data.piva.find((p) => p.id === zbozi.beer_id)?.name ?? 'pivo'} · ${data.obaly.find((o) => o.id === zbozi.package_id)?.label ?? 'obal'}`
                  : 'ostatní zboží';
                return (
                  <li
                    key={r.id}
                    id={`uz-radek-${r.id}`}
                    className={`p-2.5 rounded-xl border-2 space-y-2 ${problemy.length || nevyreseno.includes(r) ? 'border-rose-400 bg-rose-50' : navrzeno ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 grid grid-cols-[6rem_1fr] gap-2">
                        <input aria-label="Kód zboží" className="input !py-1.5 text-sm font-black" value={r.kod} onChange={(e) => zmenKod(r.id, e.target.value)} placeholder="kód" inputMode="numeric" />
                        <input aria-label="Název zboží" className="input !py-1.5 text-sm font-bold" value={r.nazev} onChange={(e) => uprav(r.id, { nazev: e.target.value })} placeholder="název" />
                      </div>
                      <button type="button" className="btn-danger btn-ikona" aria-label={`Odstranit řádek ${r.kod}`} onClick={() => uprav(r.id, { smazano: true })}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['ks', 'Ks', r.ks], ['cena', 'Cena', r.cena], ['celkem', 'Částka', r.celkem]] as const).map(([pole, popis, hodnota]) => (
                        <label key={pole} className="text-[11px] font-black uppercase text-neutral-500">
                          {popis}
                          <input
                            className="input !py-1.5 text-sm font-black text-center mt-0.5"
                            inputMode="decimal"
                            value={hodnota}
                            onChange={(e) => uprav(r.id, { [pole]: e.target.value } as Partial<Radek>)}
                          />
                        </label>
                      ))}
                    </div>

                    {problemy.map((p) => (
                      <div key={p.text} role="alert" className="text-xs font-bold text-rose-800 flex items-start gap-1.5 flex-wrap">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{p.text}</span>
                        {p.navrzeneMnozstvi != null && (
                          <button type="button" className="underline" onClick={() => uprav(r.id, { ks: String(p.navrzeneMnozstvi) })}>
                            Podle částky je to {p.navrzeneMnozstvi} ks — opravit
                          </button>
                        )}
                      </div>
                    ))}

                    {r.zname ? (
                      <div className="text-xs font-semibold text-neutral-600">Zboží v obchodě: <strong>{popisZnameho}</strong></div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-black uppercase text-amber-900">
                          {navrzeno ? 'Nové zboží — navrženo z názvu, potvrď' : 'Nové zboží — co to je?'}
                        </div>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <select
                            aria-label="Pivo"
                            className="input !py-1.5 text-xs font-bold"
                            disabled={r.volba.ostatni}
                            value={r.volba.beerId}
                            onChange={(e) => upravVolbu(r.id, { beerId: e.target.value, potvrzeno: !!e.target.value && !!r.volba.pkgId })}
                          >
                            <option value="">— pivo —</option>
                            {data.piva.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                          <select
                            aria-label="Obal"
                            className="input !py-1.5 text-xs font-bold"
                            disabled={r.volba.ostatni}
                            value={r.volba.pkgId}
                            onChange={(e) => upravVolbu(r.id, { pkgId: e.target.value, potvrzeno: !!e.target.value && !!r.volba.beerId })}
                          >
                            <option value="">— obal —</option>
                            {data.obaly.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-xs font-bold text-neutral-700 whitespace-nowrap">
                            <input type="checkbox" checked={r.volba.ostatni} onChange={(e) => upravVolbu(r.id, { ostatni: e.target.checked, potvrzeno: true })} />
                            ostatní
                          </label>
                        </div>
                        {navrzeno && (
                          <button type="button" className="btn-emerald !rounded !py-1 text-xs" onClick={() => upravVolbu(r.id, { potvrzeno: true })}>
                            <Check size={13} className="inline mr-1" /> Potvrdit
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="rounded-xl border-2 border-neutral-300 bg-neutral-50 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="text-xs font-bold text-neutral-700">Součet řádků<div className="text-base font-black text-neutral-950">{kc(soucet)}</div></div>
                <label className="text-xs font-bold text-neutral-700">
                  Celkem z účtenky
                  <input aria-label="Celkem z účtenky" className="input font-black text-base mt-0.5" inputMode="decimal" value={celkem} onChange={(e) => setCelkem(e.target.value)} />
                </label>
              </div>
              {problemyCelku.map((p) => (
                <div key={p.text} role="alert" className="text-xs font-bold text-rose-800 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {p.text}
                </div>
              ))}
              {kontrola.problemy.length === 0 && platne.length > 0 && (
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><Check size={14} /> Čísla na účtence sedí: množství × cena = částka i součet = Celkem.</div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="uz-pozn">Poznámka</label>
              <input id="uz-pozn" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} placeholder="nepovinná" />
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800 cursor-pointer select-none">
              <input type="checkbox" className="w-5 h-5" checked={potvrzeno} onChange={(e) => setPotvrzeno(e.target.checked)} />
              Zkontroloval jsem řádky podle fotky a souhlasí
            </label>

            {chyby.length > 0 && (
              <ul ref={chybyRef} role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border-2 border-rose-300 rounded-lg px-4 py-2 space-y-0.5 list-disc">
                {chyby.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}

            {!lzeUlozit && !uklada && (
              <div role="status" aria-label="Co ještě chybí k uložení" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-1.5 text-amber-950">
                <div className="text-sm font-black">Než půjde uzávěrka uložit:</div>
                <ul className="space-y-1.5 text-sm font-bold">
                  {!typ && <li>• Vyber typ uzávěrky (Denní / Týdenní / Měsíční) nahoře.</li>}
                  {kontrola.problemy.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2">
                      • Oprav {kontrola.problemy.length} {kontrola.problemy.length === 1 ? 'problém' : 'problémů'} (červené řádky a hlášky u částek).
                      {prvniProblemRadek !== null && platne[prvniProblemRadek] && (
                        <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold" onClick={() => skocNaRadek(platne[prvniProblemRadek].id)}>Ukázat první</button>
                      )}
                    </li>
                  )}
                  {nevyreseno.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2">
                      • U {nevyreseno.length} {nevyreseno.length === 1 ? 'řádku' : 'řádků'} vyber pivo a obal, nebo zaškrtni „ostatní".
                      <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold" onClick={() => skocNaRadek(nevyreseno[0].id)}>Ukázat první</button>
                    </li>
                  )}
                  {nepotvrzeno.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2">
                      • Potvrď navržené zboží ({nepotvrzeno.length} {nepotvrzeno.length === 1 ? 'řádek' : 'řádků'}).
                      <button type="button" className="btn-emerald !rounded !py-1 text-xs" onClick={potvrdVse}>Potvrdit navržené</button>
                    </li>
                  )}
                  {presInventuru.length > 0 && !souhlasPresInventuru && <li>• Uzávěrka přetíná inventuru — zaškrtni „Přesto uložit" výše, nebo změň období.</li>}
                  {duplicity.stejna.length > 0 && <li>• Tahle účtenka už je zapsaná — znovu se zapsat nedá (viz červené okno výše).</li>}
                  {duplicity.podobne.length > 0 && !souhlasPodobna && <li>• Podobná uzávěrka už je zapsaná — zaškrtni „Je to jiná účtenka“, nebo okno zavři.</li>}
                  {bezCisla && !souhlasBezCisla && <li>• Doplň číslo uzávěrky z účtenky, nebo zaškrtni, že ho účtenka nemá.</li>}
                  {!potvrzeno && <li>• Zaškrtni „Zkontroloval jsem řádky podle fotky".</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-neutral-100">
              <button type="button" className="btn-ghost !rounded min-h-[48px]" onClick={onClose}>Zrušit</button>
              <button type="button" className="btn-primary !rounded min-h-[48px] flex-1 sm:flex-none" disabled={!lzeUlozit} onClick={uloz}>
                {uklada ? 'Ukládám…' : 'Uložit uzávěrku a odečíst ze skladu'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
