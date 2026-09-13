import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Thermometer, FlaskConical } from 'lucide-react';
import { Beer, CellarTank, fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { EmptyState, Field, Kostra, Modal } from './ui';
import { chyba, oznam, potvrd } from '../lib/toast';
import { chybiTabulka } from '../lib/chybyHlaseni';
import { useAuth } from '../lib/auth';
import { bodyGrafu, dalsiGenerace, posledniStupnovitost, prokvaseni, type Mereni, type Varka } from '../lib/varky';

/**
 * 🧪 Várky ve sklepě — průběh kvašení a generace kvasnic.
 *
 * Tabulka cellar_batches v databázi byla, ale nic do ní nepsalo. Tady se
 * várka založí, průběžně se k ní zapisuje stupňovitost a teplota a u
 * kvasnic se ví, kolikátá generace to je a z které várky pocházejí.
 */
export function VarkySklep({ beers, tanks }: { beers: Beer[]; tanks: CellarTank[] }) {
  const { profile, user } = useAuth();
  const kdo = profile?.display_name || user?.email?.split('@')[0] || null;

  const [varky, setVarky] = useState<Varka[]>([]);
  const [mereni, setMereni] = useState<Mereni[]>([]);
  const [stav, setStav] = useState<'nacitam' | 'ok' | 'bez-migrace' | 'chyba'>('nacitam');
  const [upravit, setUpravit] = useState<Varka | 'nova' | null>(null);
  const [otevrena, setOtevrena] = useState<string | null>(null);

  async function nacti() {
    const [v, m] = await Promise.all([
      fetchAllRows('cellar_batches', '*').order('started_at', { ascending: false, nullsFirst: false }),
      fetchAllRows('cellar_batch_mereni', '*').order('measured_at'),
    ]);
    const err = v.error ?? m.error;
    if (err) { setStav(chybiTabulka(err) || /kvasnice_/.test(err.message ?? '') ? 'bez-migrace' : 'chyba'); return; }
    setVarky((v.data as Varka[]) ?? []);
    setMereni((m.data as Mereni[]) ?? []);
    setStav('ok');
  }
  useEffect(() => { void nacti(); }, []);
  useRealtime(['cellar_batches', 'cellar_batch_mereni'], () => void nacti());

  const mereniPodleVarky = useMemo(() => {
    const map = new Map<string, Mereni[]>();
    for (const m of mereni) map.set(m.batch_id, [...(map.get(m.batch_id) ?? []), m]);
    return map;
  }, [mereni]);

  async function smazVarku(v: Varka) {
    if (!(await potvrd(`Smazat várku ${v.batch_number || v.beer_name || ''} i se všemi měřeními?`))) return;
    const { error } = await supabase.from('cellar_batches').delete().eq('id', v.id);
    if (error) chyba(`Várku se nepodařilo smazat: ${error.message}`);
  }

  if (stav === 'nacitam') return <Kostra radku={3} />;
  if (stav === 'bez-migrace') {
    return (
      <EmptyState
        text="Várky potřebují migraci 20261231050000_varky_mereni_a_kvasnice.sql — spusť ji v Nastavení → Diagnostika → Databázové migrace."
      />
    );
  }
  if (stav === 'chyba') return <EmptyState varianta="chyba" text="Várky se nepodařilo načíst." akce={{ popis: 'Zkusit znovu', onClick: () => void nacti() }} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-700">Průběh kvašení a generace kvasnic u jednotlivých várek.</p>
        <button type="button" className="btn-primary" onClick={() => setUpravit('nova')}>
          <Plus className="ikona-text" /> Nová várka
        </button>
      </div>

      {varky.length === 0 ? (
        <EmptyState text="Zatím není zapsaná žádná várka." akce={{ popis: 'Založit první várku', onClick: () => setUpravit('nova') }} />
      ) : (
        varky.map((v) => {
          const m = mereniPodleVarky.get(v.id) ?? [];
          const zdroj = v.kvasnice_z_varky ? varky.find((x) => x.id === v.kvasnice_z_varky) : null;
          const pk = prokvaseni(v.og, v.fg ?? posledniStupnovitost(v, m));
          const jeOtevrena = otevrena === v.id;
          return (
            <div key={v.id} className="card p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-display font-black text-neutral-900">
                    {v.beer_name || 'Pivo neuvedeno'}{v.batch_number ? ` · várka ${v.batch_number}` : ''}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {v.tank_label || 'bez tanku'}
                    {v.volume_hl != null ? ` · ${Number(v.volume_hl).toLocaleString('cs-CZ')} hl` : ''}
                    {v.started_at ? ` · od ${new Date(v.started_at).toLocaleDateString('cs-CZ')}` : ''}
                    {v.finished_at ? ` do ${new Date(v.finished_at).toLocaleDateString('cs-CZ')}` : ''}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-ghost" aria-label="Upravit várku" onClick={() => setUpravit(v)}><Pencil className="ikona-text" /></button>
                  <button type="button" className="btn-danger" aria-label="Smazat várku" onClick={() => void smazVarku(v)}><Trash2 className="ikona-text" /></button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="chip bg-amber-50 text-amber-900 border border-amber-200">
                  {v.og != null ? `${v.og} °P` : '? °P'} → {v.fg != null ? `${v.fg} °P` : posledniStupnovitost(v, m) != null ? `teď ${posledniStupnovitost(v, m)} °P` : '?'}
                </span>
                {pk != null && <span className="chip bg-emerald-50 text-emerald-900 border border-emerald-200">prokvašení {pk} %</span>}
                {v.kvasnice_generace != null && (
                  <span className="chip bg-sky-50 text-sky-900 border border-sky-200">
                    kvasnice {v.kvasnice_generace}. generace{zdroj ? ` (z ${zdroj.batch_number || zdroj.beer_name})` : ''}
                  </span>
                )}
              </div>

              <button type="button" className="btn-ghost" aria-expanded={jeOtevrena} onClick={() => setOtevrena(jeOtevrena ? null : v.id)}>
                <FlaskConical className="ikona-text" /> Měření ({m.length}) {jeOtevrena ? '▲' : '▼'}
              </button>
              {jeOtevrena && <MereniVarky varka={v} mereni={m} kdo={kdo} />}
            </div>
          );
        })
      )}

      {upravit && (
        <VarkaForm
          varka={upravit === 'nova' ? null : upravit}
          varky={varky}
          beers={beers}
          tanks={tanks}
          onClose={() => setUpravit(null)}
        />
      )}
    </div>
  );
}

function GrafKvaseni({ mereni }: { mereni: Mereni[] }) {
  const SIRKA = 300;
  const VYSKA = 80;
  const body = bodyGrafu(mereni, SIRKA, VYSKA);
  if (body.length < 2) return null;
  const min = Math.min(...body.map((b) => b.hodnota));
  const max = Math.max(...body.map((b) => b.hodnota));
  return (
    <figure className="m-0">
      <svg viewBox={`-6 -6 ${SIRKA + 12} ${VYSKA + 12}`} className="w-full max-w-md h-24 text-amber-700" role="img"
        aria-label={`Stupňovitost klesla z ${body[0].hodnota} na ${body[body.length - 1].hodnota} °P`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={body.map((b) => `${b.x},${b.y}`).join(' ')} />
        {body.map((b) => <circle key={b.cas} cx={b.x} cy={b.y} r="3" fill="currentColor" />)}
      </svg>
      <figcaption className="text-xs text-neutral-600">Stupňovitost {max} → {min} °P</figcaption>
    </figure>
  );
}

function MereniVarky({ varka, mereni, kdo }: { varka: Varka; mereni: Mereni[]; kdo: string | null }) {
  const [cas, setCas] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [plato, setPlato] = useState('');
  const [teplota, setTeplota] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [bezi, setBezi] = useState(false);

  async function pridej() {
    const s = plato.trim() === '' ? null : Number(plato.replace(',', '.'));
    const t = teplota.trim() === '' ? null : Number(teplota.replace(',', '.'));
    if (s == null && t == null) { oznam('Zadej aspoň stupňovitost nebo teplotu.'); return; }
    if ((s != null && !Number.isFinite(s)) || (t != null && !Number.isFinite(t))) { oznam('Hodnota musí být číslo.'); return; }
    setBezi(true);
    const { error } = await supabase.from('cellar_batch_mereni').insert({
      batch_id: varka.id,
      measured_at: new Date(cas).toISOString(),
      stupnovitost: s,
      teplota_c: t,
      poznamka: poznamka.trim() || null,
      zapsal: kdo,
    });
    setBezi(false);
    if (error) { chyba(`Měření se nepodařilo uložit: ${error.message}`); return; }
    setPlato(''); setTeplota(''); setPoznamka('');
  }

  async function smaz(id: string) {
    if (!(await potvrd('Smazat tohle měření?'))) return;
    const { error } = await supabase.from('cellar_batch_mereni').delete().eq('id', id);
    if (error) chyba(`Měření se nepodařilo smazat: ${error.message}`);
  }

  const serazena = [...mereni].sort((a, b) => b.measured_at.localeCompare(a.measured_at));

  return (
    <div className="space-y-3 border-t border-neutral-200 pt-3">
      <GrafKvaseni mereni={mereni} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <Field label="Kdy">
          <input type="datetime-local" className="input" value={cas} onChange={(e) => setCas(e.target.value)} />
        </Field>
        <Field label="Stupňovitost °P">
          <input type="text" inputMode="decimal" className="input" value={plato} onChange={(e) => setPlato(e.target.value)} />
        </Field>
        <Field label="Teplota °C">
          <input type="text" inputMode="decimal" className="input" value={teplota} onChange={(e) => setTeplota(e.target.value)} />
        </Field>
        <Field label="Poznámka">
          <input type="text" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} />
        </Field>
      </div>
      <button type="button" className="btn-emerald" disabled={bezi} onClick={() => void pridej()}>
        <Plus className="ikona-text" /> {bezi ? 'Ukládám…' : 'Zapsat měření'}
      </button>

      {serazena.length > 0 && (
        <ul className="divide-y divide-neutral-200 text-sm">
          {serazena.map((m) => (
            <li key={m.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-neutral-600 text-xs">{new Date(m.measured_at).toLocaleString('cs-CZ')}</span>
              <span className="font-bold tabular-nums">
                {m.stupnovitost != null ? `${m.stupnovitost} °P` : ''}
                {m.teplota_c != null ? <span className="ml-2 text-sky-800"><Thermometer size={12} className="inline -mt-0.5" aria-hidden /> {m.teplota_c} °C</span> : null}
              </span>
              {m.poznamka && <span className="text-xs text-neutral-700 basis-full">{m.poznamka}</span>}
              <button type="button" className="btn-ghost" aria-label="Smazat měření" onClick={() => void smaz(m.id)}><Trash2 className="ikona-text" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VarkaForm({ varka, varky, beers, tanks, onClose }: {
  varka: Varka | null; varky: Varka[]; beers: Beer[]; tanks: CellarTank[]; onClose: () => void;
}) {
  const [cislo, setCislo] = useState(varka?.batch_number ?? '');
  const [beerId, setBeerId] = useState(varka?.beer_id ?? '');
  const [tankId, setTankId] = useState(varka?.tank_id ?? '');
  const [objem, setObjem] = useState(varka?.volume_hl != null ? String(varka.volume_hl) : '');
  const [og, setOg] = useState(varka?.og != null ? String(varka.og) : '');
  const [fg, setFg] = useState(varka?.fg != null ? String(varka.fg) : '');
  const [od, setOd] = useState(varka?.started_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [doKdy, setDoKdy] = useState(varka?.finished_at?.slice(0, 10) ?? '');
  const [zdrojId, setZdrojId] = useState(varka?.kvasnice_z_varky ?? '');
  const [generace, setGenerace] = useState(varka?.kvasnice_generace != null ? String(varka.kvasnice_generace) : '1');
  const [pozn, setPozn] = useState(varka?.note ?? '');
  const [bezi, setBezi] = useState(false);

  function vyberZdroj(id: string) {
    setZdrojId(id);
    setGenerace(String(dalsiGenerace(id ? varky.find((v) => v.id === id) : null)));
  }

  const cisloNeboNull = (s: string) => {
    if (s.trim() === '') return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  async function uloz() {
    const hodnoty = { volume_hl: cisloNeboNull(objem), og: cisloNeboNull(og), fg: cisloNeboNull(fg), gen: cisloNeboNull(generace) };
    if (Object.values(hodnoty).some((n) => Number.isNaN(n))) { oznam('Objem, stupňovitost i generace musí být čísla.'); return; }
    if (hodnoty.gen != null && hodnoty.gen < 1) { oznam('Generace kvasnic začíná jedničkou.'); return; }
    const pivo = beers.find((b) => b.id === beerId);
    const tank = tanks.find((t) => t.id === tankId);
    const radek = {
      batch_number: cislo.trim() || null,
      beer_id: pivo?.id ?? null,
      beer_name: pivo?.name ?? null,
      tank_id: tank?.id ?? null,
      tank_label: tank?.label ?? null,
      volume_hl: hodnoty.volume_hl,
      og: hodnoty.og,
      fg: hodnoty.fg,
      started_at: od ? new Date(`${od}T00:00:00`).toISOString() : null,
      finished_at: doKdy ? new Date(`${doKdy}T00:00:00`).toISOString() : null,
      kvasnice_z_varky: zdrojId || null,
      kvasnice_generace: hodnoty.gen == null ? null : Math.round(hodnoty.gen),
      note: pozn.trim() || null,
    };
    setBezi(true);
    const { error } = varka
      ? await supabase.from('cellar_batches').update(radek).eq('id', varka.id)
      : await supabase.from('cellar_batches').insert(radek);
    setBezi(false);
    if (error) { chyba(`Várku se nepodařilo uložit: ${error.message}`); return; }
    onClose();
  }

  const mozneZdroje = varky.filter((v) => v.id !== varka?.id);

  return (
    <Modal open onClose={onClose} title={varka ? 'Upravit várku' : 'Nová várka'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Číslo várky"><input className="input" value={cislo} onChange={(e) => setCislo(e.target.value)} /></Field>
          <Field label="Objem (hl)"><input className="input" inputMode="decimal" value={objem} onChange={(e) => setObjem(e.target.value)} /></Field>
        </div>
        <Field label="Pivo">
          <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
            <option value="">— vyber —</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Tank">
          <select className="input" value={tankId} onChange={(e) => setTankId(e.target.value)}>
            <option value="">— bez tanku —</option>
            {tanks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Počáteční °P"><input className="input" inputMode="decimal" value={og} onChange={(e) => setOg(e.target.value)} /></Field>
          <Field label="Konečná °P" hint="Nech prázdné, dokud kvasí."><input className="input" inputMode="decimal" value={fg} onChange={(e) => setFg(e.target.value)} /></Field>
          <Field label="Zakvašeno"><input type="date" className="input" value={od} onChange={(e) => setOd(e.target.value)} /></Field>
          <Field label="Hotovo"><input type="date" className="input" value={doKdy} onChange={(e) => setDoKdy(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kvasnice z várky" hint="Prázdné = čerstvé kvasnice.">
            <select className="input" value={zdrojId} onChange={(e) => vyberZdroj(e.target.value)}>
              <option value="">— čerstvé —</option>
              {mozneZdroje.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.batch_number || v.beer_name || 'várka'}{v.kvasnice_generace ? ` (${v.kvasnice_generace}. gen.)` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Generace kvasnic"><input className="input" inputMode="numeric" value={generace} onChange={(e) => setGenerace(e.target.value)} /></Field>
        </div>
        <Field label="Poznámka"><textarea className="input" rows={2} value={pozn} onChange={(e) => setPozn(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn-primary" disabled={bezi} onClick={() => void uloz()}>{bezi ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}
