// 🔍 Odpovídá objednávka z WhatsAppu tomu, co bylo ve zprávě?
//
// Z provozu 13. 9. 2026: „Tm: 2x30l" (Lužec) i „5 beden 12tm" se zapsaly
// jako 12° Světlá a přišlo se na to až podle nesedícího skladu. Kontrola
// všech objednávek pak našla i jiné případy. Tahle kontrola to umí pustit
// kdokoli z aplikace (Inventura → Hloubkový audit).
//
// Zprávu čte ZNOVU stejným párováním, jaké zakládá objednávky na serveru
// (supabase/functions/_shared/beer-match.ts) — ne vlastní kopií pravidel,
// která by se s ním dřív nebo později rozešla — a porovná výsledek
// s položkami uložené objednávky.
//
// Rozdíl nemusí být chyba: obsluha mohla objednávku při schválení opravit,
// nebo ji upravila navazující zpráva. Proto dvě úrovně:
//   • rozpor barvy — úsek zprávy u položky říká „tm"/„tmavá", ale v objednávce
//     je světlá (nebo naopak). To je skoro jistě chyba čtení.
//   • jiný rozdíl (pivo, obal, počet) — k ověření proti zprávě.
import { matchBeerId, matchPackageId, barvaPolozky, normText } from '../../supabase/functions/_shared/beer-match';

export type PivoProCteni = { id: string; name: string; degree?: string | null; short_name?: string | null };
export type ObalProCteni = { id: string; label: string; volume_l?: number | null };
export type ZpravaSObjednavkou = {
  created_at: string;
  message_text: string | null;
  foto?: boolean;
  imported_order_id: string;
  parsed_items: any[] | null;
};
export type PolozkaObjednavky = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };
export type ObjednavkaProCteni = { id: string; place_name: string | null; delivery_date: string | null; order_date: string | null; status: string };
export type ZkratkaProCteni = { alias_text: string; beer_id: string | null; package_id: string | null };

export type RozdilCteni = {
  objednavkaId: string;
  misto: string;
  den: string;
  zprava: string;
  foto: boolean;
  /** Úsek zprávy říká jinou barvu, než má položka — skoro jistě chyba. */
  rozporBarvy: string[];
  /** Podle zprávy má být, v objednávce není. */
  chybi: string[];
  /** V objednávce je, podle zprávy ne. */
  navic: string[];
};

export function porovnejCteni(vstup: {
  zpravy: ZpravaSObjednavkou[];
  polozky: PolozkaObjednavky[];
  objednavky: ObjednavkaProCteni[];
  piva: PivoProCteni[];
  obaly: ObalProCteni[];
  zkratky: ZkratkaProCteni[];
}): RozdilCteni[] {
  const { zpravy, polozky, objednavky, piva, obaly, zkratky } = vstup;
  const aliasMap = { beer: new Map<string, string>(), package: new Map<string, string>() };
  for (const z of zkratky) {
    if (z.beer_id) aliasMap.beer.set(z.alias_text, z.beer_id);
    if (z.package_id) aliasMap.package.set(z.alias_text, z.package_id);
  }
  const jmenoPiva = (id: string | null) => piva.find((b) => b.id === id)?.name?.trim() ?? 'neznámé pivo';
  const jmenoObalu = (id: string | null) => obaly.find((p) => p.id === id)?.label?.trim() ?? 'neznámý obal';
  const jeTmave = (id: string | null) => /tmav|dark/.test(normText(jmenoPiva(id)));
  const popis = (beer: string | null, pkg: string | null, ks: number) => `${jmenoPiva(beer)} ${jmenoObalu(pkg)} ×${Number(ks)}`;

  const podleObjednavky = new Map<string, PolozkaObjednavky[]>();
  for (const p of polozky) podleObjednavky.set(p.order_id, [...(podleObjednavky.get(p.order_id) ?? []), p]);
  const objednavka = new Map(objednavky.map((o) => [o.id, o]));

  const vysledek: RozdilCteni[] = [];
  for (const z of zpravy) {
    const o = objednavka.get(z.imported_order_id);
    const skutecne = podleObjednavky.get(z.imported_order_id) ?? [];
    if (!o || o.status === 'storno' || !skutecne.length || !Array.isArray(z.parsed_items)) continue;

    const ocekavane = z.parsed_items
      .map((it) => {
        const item = { ...it, quantity: it.qty ?? it.quantity };
        return { item, beer: matchBeerId(item, piva, aliasMap), pkg: matchPackageId(item, obaly, aliasMap), ks: Number(item.quantity || 0) };
      })
      // Řádek, ze kterého AI nevyčetla nic (bez textu, piva i obalu), se
      // neporovnává — v detailu by byl jen šum „neznámé pivo neznámý obal".
      .filter((e) => e.ks > 0 && (e.beer || e.pkg || String(e.item.raw_line ?? '').trim()));

    const zbyva = skutecne.map((s) => popis(s.beer_id, s.package_id, s.quantity));
    const chybi: string[] = [];
    for (const e of ocekavane) {
      const i = zbyva.indexOf(popis(e.beer, e.pkg, e.ks));
      if (i >= 0) zbyva.splice(i, 1);
      else chybi.push(`${popis(e.beer, e.pkg, e.ks)} („${String(e.item.raw_line ?? '').trim()}")`);
    }

    const rozporBarvy: string[] = [];
    for (const e of ocekavane) {
      const barva = barvaPolozky(e.item);
      if (!barva) continue;
      const stejnyRadek = skutecne.filter((s) => s.package_id === e.pkg && Number(s.quantity) === e.ks);
      if (stejnyRadek.length && stejnyRadek.every((s) => (barva === 'tmave') !== jeTmave(s.beer_id))) {
        rozporBarvy.push(`„${String(e.item.raw_line ?? '').trim()}" je ${barva === 'tmave' ? 'TMAVÉ' : 'světlé'}, v objednávce ${stejnyRadek.map((s) => popis(s.beer_id, s.package_id, s.quantity)).join(' / ')}`);
      }
    }

    if (!chybi.length && !zbyva.length && !rozporBarvy.length) continue;
    vysledek.push({
      objednavkaId: o.id,
      misto: o.place_name || 'Neznámý odběratel',
      den: o.delivery_date || o.order_date || '',
      zprava: String(z.message_text ?? '').replace(/\s*\n\s*/g, ' / ').slice(0, 160),
      foto: !!z.foto,
      rozporBarvy,
      chybi,
      navic: zbyva,
    });
  }
  return vysledek.sort((a, b) => b.den.localeCompare(a.den));
}
