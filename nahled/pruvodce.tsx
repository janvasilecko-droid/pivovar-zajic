// Náhled průvodce zadáním objednávky (components/objednavky/ObjednavkaPruvodce.tsx).
//
// Okno přes celou obrazovku s vymyšlenými odběrateli a pivy; „uložit" jen
// zapíše koncept do výpisu pod oknem (`data-testid="ulozeno"`), nic se
// neukládá a WhatsApp se neotevírá — „Uložit a odeslat na WhatsApp" se do
// výpisu zapíše stejně, jen s `odeslatNaWhatsApp: true`. Okno rezervace výčepu
// nahrazuje hotová rezervace „Výčep 2" na den závozu a zrušené rezervace se
// vypisují do `data-testid="zruseno"`. Slouží ke kontrole vzhledu na telefonu
// i na počítači a k E2E scénáři (scripts/e2e.mjs). Otevírá se `/pruvodce.html`,
// šířku okna řídí rodič (iframe) nebo prohlížeč — Tailwind se řídí šířkou okna.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { ObjednavkaPruvodce } from '../src/components/objednavky/ObjednavkaPruvodce';
import ToastHost from '../src/components/ToastHost';
import type { DataPruvodce } from '../src/components/objednavky/pruvodceTypy';
import { popisRezervaceVycepu, type KonceptObjednavky } from '../src/lib/objednavkaPruvodce';
import { businessDateISO, posunDen } from '../src/lib/businessDate';

const dnes = businessDateISO();

const misto = (id: string, nazev: string) => ({ id, nazev, adresa: null, lat: null, lng: null });
const odberatel = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, note: null, created_at: '', address: null, phone: null, opening_hours: null, ...extra,
});
const places = [
  odberatel('p-radek', 'Radek', { address: 'Lipová 1, Hradec Králové, 500 02', mista_zavozu: [misto('sklad', 'Sklad'), misto('drobak', 'Drobák')] }),
  odberatel('p-zizkov', 'Žižkov'),
  odberatel('p-jona', 'Jona'),
  odberatel('p-malesice', 'Malešice'),
  odberatel('p-seeberg', 'Seeberg', { vychozi_den_zavozu: 'pa' }),
  odberatel('p-luzec', 'Lužec', { vychozi_den_zavozu: 'pa' }),
  odberatel('p-restaurace', 'Restaurace', { vychozi_den_zavozu: 'zadny' }),
  odberatel('p-mates', 'Mates'),
  // Další odběratelé, ať je jich dost na lištu písmen (od 12) a na Č / CH / číslici.
  odberatel('p-karlin', '7 stupňů Karlín'),
  odberatel('p-adam', 'Adam'),
  odberatel('p-borek', 'Bořek'),
  odberatel('p-cenek', 'Čeněk'),
  odberatel('p-chlapy', 'Chlapy z Toužimi'),
  odberatel('p-dadali', 'Dadali'),
  // Starý odběratel z doby před sloučením — jméno je teď místem Radka, průvodce ho nenabízí.
  odberatel('p-sklad-stary', 'Sklad'),
];

const pivo = (id: string, name: string, sort: number, beer_color: string) => ({
  id, name, short_name: null, degree: null, color: null, beer_color, price_per_liter: null, is_active: true, sort_order: sort, created_at: '',
});
const beers = [
  pivo('b-12', '12° Světlá', 1, '#F59E0B'),
  pivo('b-11', '11° Světlá', 2, '#FDE68A'),
  pivo('b-10', '10° Desítka', 3, '#86EFAC'),
  pivo('b-12t', '12° Tmavá', 4, '#44403B'),
  pivo('b-jantar', 'Jantar', 5, '#540f0f'),
  pivo('b-osma', 'Osma', 6, '#14B8A6'),
  pivo('b-winter', 'winter', 7, '#FCA5A5'),
  pivo('b-kiwi', 'Kiwi', 8, '#BBF7D0'),
  pivo('b-grep', 'Grep', 9, '#FCE7F3'),
];

const obal = (id: string, kind: 'keg' | 'bottle', volume_l: number, label: string, sort_order: number) =>
  ({ id, code: id, kind, volume_l, label, sort_order });
const packages = [
  obal('k50', 'keg', 50, 'KEG 50l', 1), obal('k30', 'keg', 30, 'KEG 30l', 2), obal('k20', 'keg', 20, 'KEG 20l', 3),
  obal('k15', 'keg', 15, 'KEG 15l', 4), obal('k10', 'keg', 10, 'KEG 10l', 5),
  obal('l15', 'bottle', 1.5, 'PET 1,5l', 6), obal('l1', 'bottle', 1, 'PET 1l', 7),
  obal('l05', 'bottle', 0.5, 'Lahev 0,5l', 8), obal('l033', 'bottle', 0.33, 'Lahev 0,33l', 9),
];

const objednavka = (id: string, place_id: string, place_name: string, dnuZpet: number) => ({
  id, order_date: posunDen(dnes, -dnuZpet), place_id, place_name, source: 'rucne', status: 'nova', note: null, created_at: '',
  delivery_day: null, delivery_date: null, is_prepared: false, is_packaged: false, is_delivered: true, delivered_at: null,
});
const orders = [
  ...[3, 10, 17, 24].map((d, i) => objednavka(`o-radek-${i}`, 'p-radek', 'Radek', d)),
  ...[4, 11, 18].map((d, i) => objednavka(`o-zizkov-${i}`, 'p-zizkov', 'Žižkov', d)),
  ...[5, 12].map((d, i) => objednavka(`o-jona-${i}`, 'p-jona', 'Jona', d)),
  objednavka('o-malesice', 'p-malesice', 'Malešice', 6),
  objednavka('o-seeberg', 'p-seeberg', 'Seeberg', 7),
  objednavka('o-luzec', 'p-luzec', 'Lužec', 8),
  // Dalších sedm odběratelů s objednávkou — 13 celkem, takže nahoře je jen 10 nejčastějších (majitel 23. 11. 2026)
  // a tři další jsou jen v abecedě. Chlapy z Toužimi a Sklad záměrně nemají žádnou: v E2E se hledají v abecedě.
  ...[9, 16].map((d, i) => objednavka(`o-mates-${i}`, 'p-mates', 'Mates', d)),
  objednavka('o-restaurace', 'p-restaurace', 'Restaurace', 9),
  objednavka('o-karlin', 'p-karlin', '7 stupňů Karlín', 10),
  objednavka('o-adam', 'p-adam', 'Adam', 11),
  objednavka('o-borek', 'p-borek', 'Bořek', 12),
  objednavka('o-cenek', 'p-cenek', 'Čeněk', 13),
  objednavka('o-dadali', 'p-dadali', 'Dadali', 14),
];
const polozka = (id: string, order_id: string, beer_id: string, beer_name: string, package_id: string, package_label: string, quantity: number) =>
  ({ id, order_id, beer_id, beer_name, package_id, package_label, quantity, is_prepared: false, is_bottled: false });
const items = {
  'o-zizkov-0': [polozka('i1', 'o-zizkov-0', 'b-12', '12° Světlá', 'k50', 'KEG 50l', 2), polozka('i2', 'o-zizkov-0', 'b-11', '11° Světlá', 'l1', 'PET 1l', 10)],
};
const historie = [
  { beer_id: 'b-12', package_id: 'k50', quantity: 2, entry_date: posunDen(dnes, -10) },
  { beer_id: 'b-12', package_id: 'k50', quantity: 3, entry_date: posunDen(dnes, -17) },
  { beer_id: 'b-12', package_id: 'k50', quantity: 2, entry_date: posunDen(dnes, -24) },
  { beer_id: 'b-11', package_id: 'l1', quantity: 10, entry_date: posunDen(dnes, -10) },
  { beer_id: 'b-11', package_id: 'l1', quantity: 12, entry_date: posunDen(dnes, -17) },
];

const data = { places, beers, packages, orders, items, dnes } as unknown as DataPruvodce;

function Obsah() {
  const [otevrene, setOtevrene] = useState(true);
  const [ulozeno, setUlozeno] = useState<(KonceptObjednavky & { odeslatNaWhatsApp: boolean })[]>([]);
  const [zruseno, setZruseno] = useState<string[]>([]);
  return (
    <>
      {otevrene ? (
        <ObjednavkaPruvodce
          data={data}
          historie={historie}
          onUlozit={async (k, volby) => { setUlozeno((u) => [...u, { ...k, odeslatNaWhatsApp: volby.whatsapp }]); return { stav: 'ulozeno' as const }; }}
          onZavrit={() => setOtevrene(false)}
          vyberVycep={async ({ datum }) => ({ id: 'rez-nahled', popis: popisRezervaceVycepu('Výčep 2', datum, datum) })}
          zrusVycep={async (id) => { setZruseno((z) => [...z, id]); return null; }}
        />
      ) : (
        <button type="button" className="btn-primary m-4" onClick={() => setOtevrene(true)}>Otevřít průvodce</button>
      )}
      <pre data-testid="ulozeno" className="sr-only">{JSON.stringify(ulozeno)}</pre>
      <pre data-testid="zruseno" className="sr-only">{JSON.stringify(zruseno)}</pre>
      <ToastHost />
    </>
  );
}

createRoot(document.getElementById('pruvodce')!).render(<Obsah />);
