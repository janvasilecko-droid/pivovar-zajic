// 🧠 Co už víme z dřívějška — historie objednávek jako kontext pro čtení zprávy.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „nauč aplikaci na základě i předchozích objednávek
// pořádně číst kontexty a odpovědi na zprávy, pořádně číst odběratele ve
// zprávách i pokud není již uložený, aby ho aplikace dokázala vždy najít."
//
// AI dosud viděla jen text zprávy, seznam piv a seznam odběratelů. Nevěděla
// nic o tom, CO SE UŽ STALO — a přitom je to v týhle skupině ta nejsilnější
// nápověda:
//   • posel („Bednář") posílá objednávky pořád pro tytéž hospody, takže když
//     v textu odběratel není, historie ho skoro vždycky určí,
//   • hospoda bere pořád dokola totéž, takže „2x10" se dá rozhodnout podle
//     toho, co ta hospoda bere obvykle.
//
// ⚠️ HISTORIE SMÍ ROZHODOVAT MEZI VÝKLADY, NE DOPLŇOVAT POLOŽKY.
// To je hranice, kterou nesmí AI překročit: kdyby z historie dopsala, co
// odběratel „obvykle bere", vznikne objednávka, kterou nikdo neposlal.
// Pravidlo je i v promptu (order-rules.ts), tady je kvůli němu tvar dat:
// posílají se POČTY a TYPICKÉ položky, ne hotová objednávka k opsání.

export type ObjednavkaOdesilatele = {
  place_name: string | null;
};

export type PolozkaOdberatele = {
  place_name: string | null;
  beer_name: string | null;
  package_label: string | null;
  quantity: number;
};

/** „Lužec (12×), Duck and Dog (3×)" — pro koho tenhle odesílatel objednával. */
export function odberateleOdesilatele(objednavky: ObjednavkaOdesilatele[]): { jmeno: string; pocet: number }[] {
  const pocty = new Map<string, number>();
  for (const o of objednavky) {
    const jmeno = (o.place_name ?? '').trim();
    if (!jmeno) continue;
    pocty.set(jmeno, (pocty.get(jmeno) ?? 0) + 1);
  }
  return [...pocty.entries()]
    .map(([jmeno, pocet]) => ({ jmeno, pocet }))
    .sort((a, b) => b.pocet - a.pocet || a.jmeno.localeCompare(b.jmeno));
}

/**
 * „4× KEG 50l 12° Světlá, 2× KEG 30l 11° Světlá" — co odběratel bere obvykle.
 *
 * Množství je MEDIÁN, ne součet ani průměr: součet by u pěti objednávek dal
 * dvacet sudů a vypadal jako jedna obrovská objednávka, průměr zase rozbije
 * celá čísla („3,4 sudu"). Medián odpovídá tomu, co člověk myslí slovem
 * „obvykle".
 */
export function obvykleBere(polozky: PolozkaOdberatele[]): string[] {
  const podleDruhu = new Map<string, number[]>();
  for (const p of polozky) {
    const pivo = (p.beer_name ?? '').trim();
    const obal = (p.package_label ?? '').trim();
    if (!pivo || !obal) continue;
    const klic = `${obal} ${pivo}`;
    const mnozstvi = Number(p.quantity || 0);
    if (mnozstvi <= 0) continue;
    if (!podleDruhu.has(klic)) podleDruhu.set(klic, []);
    podleDruhu.get(klic)!.push(mnozstvi);
  }
  return [...podleDruhu.entries()]
    // Nejdřív to, co bere nejčastěji — tam je nápověda nejsilnější.
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([klic, mnozstvi]) => {
      const serazene = [...mnozstvi].sort((a, b) => a - b);
      const median = serazene[Math.floor(serazene.length / 2)];
      return `${median}× ${klic}`;
    });
}

/**
 * Celý blok do promptu. Prázdný řetězec, když není co říct — prázdný nadpis
 * v promptu jen ubírá pozornost od pravidel, která něco znamenají.
 */
export function blokHistorie(opts: {
  odesilatel: string | null;
  objednavkyOdesilatele: ObjednavkaOdesilatele[];
  polozkyPodleOdberatele: Record<string, PolozkaOdberatele[]>;
}): string {
  const radky: string[] = [];

  const odberatele = odberateleOdesilatele(opts.objednavkyOdesilatele).slice(0, 6);
  if (opts.odesilatel && odberatele.length > 0) {
    radky.push(
      `Odesílatel „${opts.odesilatel}" dosud poslal objednávky pro: `
      + odberatele.map((o) => `${o.jmeno} (${o.pocet}×)`).join(', ') + '.',
    );
    if (odberatele.length === 1) {
      radky.push(
        `Posílal vždycky jen pro „${odberatele[0].jmeno}" — když v textu odběratel není `
        + 'a nejde určit z citace, je to skoro jistě on. Pořád ale platí: když si nejsi jistý, zeptej se.',
      );
    }
  }

  const obvykle = Object.entries(opts.polozkyPodleOdberatele)
    .map(([jmeno, polozky]) => ({ jmeno, radky: obvykleBere(polozky) }))
    .filter((o) => o.radky.length > 0);
  if (obvykle.length > 0) {
    radky.push('', 'Co tihle odběratelé berou obvykle:');
    for (const o of obvykle) radky.push(`  • ${o.jmeno}: ${o.radky.join(', ')}`);
  }

  if (radky.length === 0) return '';

  return `
════════════════════════════════════════════════════════════════════
HISTORIE — CO UŽ VÍME Z DŘÍVĚJŠÍCH OBJEDNÁVEK
════════════════════════════════════════════════════════════════════
${radky.join('\n')}

⚠️ K ČEMU HISTORIE JE A K ČEMU NENÍ:
  • JE k rozhodnutí mezi dvěma výklady téhož textu — který odběratel,
    jestli je „10" stupeň nebo objem, který obal odběratel běžně bere.
  • NENÍ k doplňování položek. Co ve zprávě není napsané, do objednávky
    NEPATŘÍ, i kdyby to odběratel bral každý týden. Objednávka, kterou
    nikdo neposlal, je horší chyba než chybějící položka.
  • Odběratele z historie použij jen tehdy, když v textu ANI v citované
    zprávě žádný není. Co je napsané ve zprávě, má vždycky přednost.
`;
}

/** Kolik dní zpátky se historie čte. Sezóna se mění, starší už neplatí. */
const DNU_ZPET = 120;

/**
 * Načte historii odesílatele a rovnou z ní udělá blok do promptu.
 *
 * ⚠️ Tohle musí být na JEDNOM místě, ne dvakrát. Čtení zprávy má dvě cesty —
 * server (whatsapp-auto-parse, když zpráva přijde) a klient (whatsappParser,
 * tlačítko „Přečíst znovu") — a celý `_shared/` vznikl právě proto, že se ty
 * dvě cesty rozcházely a táž zpráva se pak přečetla jinak podle toho, kudy
 * přišla. Dotazy jsou tu psané tak, aby prošly přes obě: `supabase` je klient
 * z @supabase/supabase-js, který má server i aplikace.
 *
 * Nikdy nevyhazuje výjimku — bez historie se čte jako dosud. Kvůli nápovědě
 * nesmí zpráva propadnout.
 */
export async function nactiHistorii(
  supabase: {
    from: (t: string) => any;
  },
  opts: {
    /** Jméno odesílatele (posla), jak je u zprávy. */
    odesilatel: string | null | undefined;
    /** Kdy zpráva přišla (ISO) — historie se čte zpětně od ní. */
    kdy: string;
  },
): Promise<{ text: string; odberatele: string[] }> {
  const prazdno = { text: '', odberatele: [] as string[] };
  const odesilatel = (opts.odesilatel ?? '').trim();
  if (!odesilatel) return prazdno;

  try {
    const odKdy = new Date(new Date(opts.kdy).getTime() - DNU_ZPET * 24 * 60 * 60 * 1000).toISOString();

    // Objednávky, které z tohohle odesílatele už vznikly. Filtruje se až tady
    // v JS: odesílatel je v `participant_name` NEBO `sender_name` a jméno může
    // obsahovat cokoliv, takže skládat z něj `.or()` by koledovalo o potíže.
    const { data: drivejsiZpravy } = await supabase
      .from('whatsapp_incoming')
      .select('imported_order_id, participant_name, sender_name')
      .not('imported_order_id', 'is', null)
      .gte('created_at', odKdy)
      .order('created_at', { ascending: false })
      .limit(300);
    const mojeIds = (drivejsiZpravy ?? [])
      .filter((z: any) => ((z.participant_name || z.sender_name || '').trim() === odesilatel))
      .map((z: any) => z.imported_order_id)
      .filter(Boolean)
      .slice(0, 60);
    if (mojeIds.length === 0) return prazdno;

    const { data: ord } = await supabase.from('orders').select('id, place_name').in('id', mojeIds);
    const objednavkyOdesilatele: ObjednavkaOdesilatele[] = (ord ?? []).map((o: any) => ({ place_name: o.place_name }));

    // Co ti odběratelé berou obvykle — jen pro tři nejčastější, ať prompt
    // nenaroste o výpis celého skladu.
    const polozkyPodleOdberatele: Record<string, PolozkaOdberatele[]> = {};
    const nejcastejsi = odberateleOdesilatele(objednavkyOdesilatele).slice(0, 3).map((o) => o.jmeno);
    if (nejcastejsi.length > 0) {
      const { data: pol } = await supabase
        .from('order_items')
        .select('quantity, beer_name, package_label, orders!inner(place_name, order_date)')
        .in('orders.place_name', nejcastejsi)
        .gte('orders.order_date', odKdy.slice(0, 10))
        .limit(300);
      for (const r of (pol ?? []) as any[]) {
        const jmeno = r.orders?.place_name ?? '';
        if (!jmeno) continue;
        (polozkyPodleOdberatele[jmeno] ||= []).push({
          place_name: jmeno,
          beer_name: r.beer_name,
          package_label: r.package_label,
          quantity: Number(r.quantity || 0),
        });
      }
    }

    return {
      text: blokHistorie({ odesilatel, objednavkyOdesilatele, polozkyPodleOdberatele }),
      odberatele: odberateleOdesilatele(objednavkyOdesilatele).map((o) => o.jmeno),
    };
  } catch (e) {
    console.error('Historie objednávek se nenačetla (čte se bez ní):', e);
    return prazdno;
  }
}
