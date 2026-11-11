// 📈 Trend várek (etapa 10): jedna hodnota přes várky v čase, cíl receptury
// jako referenční čára. Jen zapsané a spočítané hodnoty — várka bez hodnoty
// v grafu není a pod grafem se řekne, u kolika chybí (nic se nedomýšlí).
//
// Graf podle zásad dataviz: jedna řada (bez legendy, název ji pojmenuje),
// čára 2 px, body r 4 s prstencem v barvě podkladu, mřížka vlasová, popisek
// jen u poslední hodnoty, nitkový kříž s bublinou na najetí i z klávesnice
// (šipky) a vždy dostupná tabulka hodnot.
import { useMemo, useState } from 'react';
import {
  CIL_HODNOTY, cislo, datumCesky, HODNOTY_VARKY, ODVOZENE, odchylka, odvozenaHodnota,
  type RecepturaZaznam, type VarkaZaznam,
} from '../../../bible/supabase/functions/_shared/varky-popisy.ts';

// Barvy (kontrast vůči bg-neutral-900 #171717 spočítaný validátorem dataviz):
const RADA = '#fbbf24'; // amber-400, 10,7 : 1
const CIL = '#a3a3a3'; // neutral-400, 7,1 : 1
const MRIZKA = '#404040'; // neutral-700, vlasová a tichá
const TEXT = '#d4d4d4'; // neutral-300, 12,1 : 1
const PODKLAD = '#171717';

type Metrika = { klic: string; nazev: string; jednotka: string; mist: number };

const METRIKY: readonly Metrika[] = [
  ...ODVOZENE.map((o) => ({ klic: o.klic, nazev: `${o.nazev} (výpočet)`, jednotka: o.jednotka, mist: o.mist })),
  ...HODNOTY_VARKY.map((h) => ({ klic: h.klic, nazev: h.nazev, jednotka: h.jednotka, mist: h.mist })),
];

function hodnotaMetriky(klic: string, v: VarkaZaznam): number | null {
  const o = ODVOZENE.find((x) => x.klic === klic);
  if (o) {
    const r = odvozenaHodnota(o, v.hodnoty);
    return 'hodnota' in r ? r.hodnota : null;
  }
  return typeof v.hodnoty[klic] === 'number' ? v.hodnoty[klic] : null;
}

/** Hezké dělení osy: 3–5 čísel 1·2·5 × 10^n, rozsah včetně okrajů. */
export function osaY(min: number, max: number): { od: number; do: number; kroky: number[] } {
  if (min === max) { const d = Math.abs(min) * 0.05 || 1; min -= d; max += d; }
  const surovy = (max - min) / 4;
  const rad = 10 ** Math.floor(Math.log10(surovy));
  const krok = [1, 2, 5, 10].map((k) => k * rad).find((k) => k >= surovy) ?? 10 * rad;
  const od = Math.floor(min / krok) * krok;
  const doH = Math.ceil(max / krok) * krok;
  const kroky: number[] = [];
  for (let t = od; t <= doH + krok / 1000; t += krok) kroky.push(Number(t.toFixed(10)));
  return { od, do: doH, kroky };
}

const S = 360;
const V = 190;
const OKRAJ = { l: 44, r: 52, t: 14, b: 30 };

export function BibleTrendVarek({ varky, receptury }: { varky: readonly VarkaZaznam[]; receptury: readonly RecepturaZaznam[] }) {
  const [metrika, setMetrika] = useState('vytezek_pct');
  const [recepturaId, setRecepturaId] = useState('');
  const [aktivni, setAktivni] = useState<number | null>(null);

  const m = METRIKY.find((x) => x.klic === metrika) ?? METRIKY[0];
  const vybrane = useMemo(
    () => varky.filter((v) => !recepturaId || v.receptura_id === recepturaId)
      .slice().sort((a, b) => a.datum_varu.localeCompare(b.datum_varu) || (a.cislo ?? '').localeCompare(b.cislo ?? '', 'cs', { numeric: true })),
    [varky, recepturaId],
  );
  const body = vybrane.map((v) => ({ v, h: hodnotaMetriky(m.klic, v) })).filter((b): b is { v: VarkaZaznam; h: number } => b.h !== null);
  const chybi = vybrane.length - body.length;
  const receptura = receptury.find((r) => r.id === recepturaId) ?? null;
  const pole = CIL_HODNOTY[m.klic];
  const cil = receptura && pole && typeof receptura[pole] === 'number' ? (receptura[pole] as number) : null;

  const hodnoty = body.map((b) => b.h);
  const osa = body.length > 0 ? osaY(Math.min(...hodnoty, ...(cil !== null ? [cil] : [])), Math.max(...hodnoty, ...(cil !== null ? [cil] : []))) : null;
  const sirka = S - OKRAJ.l - OKRAJ.r;
  const vyska = V - OKRAJ.t - OKRAJ.b;
  const x = (i: number) => OKRAJ.l + (body.length === 1 ? sirka / 2 : (i / (body.length - 1)) * sirka);
  const y = (h: number) => (osa ? OKRAJ.t + vyska - ((h - osa.od) / (osa.do - osa.od)) * vyska : 0);
  const popisBodu = (b: { v: VarkaZaznam }) => `${b.v.cislo ? `č. ${b.v.cislo} · ` : ''}${datumCesky(b.v.datum_varu)}`;
  const text = (h: number) => `${cislo(h, m.mist)}${m.jednotka ? ` ${m.jednotka}` : ''}`;
  const souhrn = body.length === 0 ? '' : `${m.nazev}: ${body.length} várek, od ${text(Math.min(...hodnoty))} do ${text(Math.max(...hodnoty))}, poslední ${text(hodnoty[hodnoty.length - 1])}${cil !== null ? `, cíl receptury ${text(cil)}` : ''}.`;

  function najdiBod(clientX: number, svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * S;
    let nej = 0;
    body.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(nej) - sx)) nej = i; });
    setAktivni(nej);
  }

  const a = aktivni !== null && aktivni < body.length ? body[aktivni] : null;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-3" aria-label="Trend várek">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="text-base font-black text-neutral-50 mr-auto">Trend várek</h3>
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
          Hodnota
          <select className="input w-full normal-case" value={metrika} onChange={(e) => { setMetrika(e.target.value); setAktivni(null); }}>
            {METRIKY.map((x) => <option key={x.klic} value={x.klic}>{x.nazev}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
          Receptura
          <select className="input w-full normal-case" value={recepturaId} onChange={(e) => { setRecepturaId(e.target.value); setAktivni(null); }}>
            <option value="">Všechny várky</option>
            {receptury.map((r) => <option key={r.id} value={r.id}>{r.nazev}</option>)}
          </select>
        </label>
      </div>

      {body.length === 0 ? (
        <p className="text-sm text-neutral-300">{vybrane.length === 0 ? 'Žádná várka.' : `${m.nazev} není zapsaná (ani spočítaná) u žádné z ${vybrane.length} várek.`}</p>
      ) : (
        <figure className="space-y-1">
          <figcaption className="text-sm font-bold text-neutral-100">{m.nazev}{m.jednotka ? ` (${m.jednotka})` : ''} · {body.length} várek</figcaption>
          <div className="relative">
            <svg
              viewBox={`0 0 ${S} ${V}`} className="w-full h-auto touch-none select-none" role="img" aria-label={souhrn} tabIndex={0}
              onPointerMove={(e) => najdiBod(e.clientX, e.currentTarget)}
              onPointerDown={(e) => najdiBod(e.clientX, e.currentTarget)}
              onPointerLeave={() => setAktivni(null)}
              onFocus={() => setAktivni((p) => p ?? body.length - 1)}
              onBlur={() => setAktivni(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); setAktivni((p) => Math.max(0, (p ?? body.length) - 1)); }
                if (e.key === 'ArrowRight') { e.preventDefault(); setAktivni((p) => Math.min(body.length - 1, (p ?? -1) + 1)); }
              }}
            >
              {osa!.kroky.map((t) => (
                <g key={t}>
                  <line x1={OKRAJ.l} x2={S - OKRAJ.r} y1={y(t)} y2={y(t)} stroke={MRIZKA} strokeWidth={1} />
                  <text x={OKRAJ.l - 6} y={y(t)} fill={TEXT} fontSize={11} textAnchor="end" dominantBaseline="middle" className="tabular-nums">{cislo(t, m.mist)}</text>
                </g>
              ))}
              {cil !== null && (
                <g>
                  <line x1={OKRAJ.l} x2={S - OKRAJ.r} y1={y(cil)} y2={y(cil)} stroke={CIL} strokeWidth={1} strokeDasharray="4 3" />
                  <text x={S - OKRAJ.r + 4} y={y(cil)} fill={TEXT} fontSize={11} dominantBaseline="middle">cíl</text>
                </g>
              )}
              {body.length > 1 && (
                <polyline points={body.map((b, i) => `${x(i)},${y(b.h)}`).join(' ')} fill="none" stroke={RADA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {a && <line x1={x(aktivni!)} x2={x(aktivni!)} y1={OKRAJ.t} y2={OKRAJ.t + vyska} stroke={TEXT} strokeWidth={1} />}
              {body.map((b, i) => (
                <circle key={b.v.id} cx={x(i)} cy={y(b.h)} r={i === aktivni ? 5 : 4} fill={RADA} stroke={PODKLAD} strokeWidth={2} />
              ))}
              <text x={x(body.length - 1) + 8} y={y(body[body.length - 1].h)} fill={TEXT} fontSize={11} fontWeight={700} dominantBaseline="middle" className="tabular-nums">
                {cislo(body[body.length - 1].h, m.mist)}
              </text>
              <text x={x(0)} y={V - 8} fill={TEXT} fontSize={11} textAnchor={body.length === 1 ? 'middle' : 'start'}>{popisBodu(body[0])}</text>
              {body.length > 1 && <text x={x(body.length - 1)} y={V - 8} fill={TEXT} fontSize={11} textAnchor="end">{popisBodu(body[body.length - 1])}</text>}
            </svg>
            {a && (
              <div className="pointer-events-none absolute top-0 rounded-lg border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs shadow-lg"
                style={{ left: `${Math.min(70, Math.max(0, (x(aktivni!) / S) * 100 - 15))}%` }} role="status">
                <span className="block text-sm font-black text-neutral-50 tabular-nums">{text(a.h)}</span>
                <span className="block font-semibold text-neutral-300">{popisBodu(a)}</span>
                {cil !== null && <span className="block font-semibold text-neutral-300">cíl {cislo(cil, m.mist)} · {odchylka(a.h, cil, m.mist)}</span>}
              </div>
            )}
          </div>
          {chybi > 0 && <p className="text-xs font-semibold text-neutral-300">U {chybi} {chybi === 1 ? 'várky' : 'várek'} hodnota chybí (nezapsáno) — v grafu nejsou.</p>}
          {receptura && cil === null && pole && <p className="text-xs font-semibold text-neutral-300">Receptura nemá cíl pro tuhle hodnotu.</p>}
          <details className="text-sm">
            <summary className="cursor-pointer py-2 font-bold text-neutral-200">Hodnoty v tabulce</summary>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black text-neutral-300">
                  <th scope="col" className="py-1 pr-3">Várka</th>
                  <th scope="col" className="py-1 pr-3">{m.nazev}</th>
                  {cil !== null && <th scope="col" className="py-1 pr-3">Odchylka od cíle</th>}
                </tr>
              </thead>
              <tbody>
                {body.map((b) => (
                  <tr key={b.v.id} className="border-t border-neutral-800">
                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-neutral-300">{popisBodu(b)}</th>
                    <td className="py-1 pr-3 font-bold text-neutral-50 tabular-nums">{text(b.h)}</td>
                    {cil !== null && <td className="py-1 pr-3 text-neutral-200 tabular-nums">{odchylka(b.h, cil, m.mist)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      )}
    </section>
  );
}
