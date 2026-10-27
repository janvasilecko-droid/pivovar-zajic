// Jen zobrazení v okně čtení objednávky — parser ani data v DB nemění.
// 27. 10. 2026: majitel nechce opakované / technické chyby čtení.

export function unikatniHlaseni(texty: (string | null | undefined)[]): string[] {
  const videne = new Set<string>();
  const vysledek: string[] = [];
  for (const raw of texty) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    const klic = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    if (videne.has(klic)) continue;
    videne.add(klic);
    vysledek.push(text);
  }
  return vysledek;
}

/** Technický dump (timeout, JSON, stack) přeloží na krátkou větu pro obsluhu. */
export function srozumitelnaChybaCteni(raw?: string | null): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/timed?\s*out|timeout|ETIMEDOUT|aborted/i.test(text)) {
    return 'Čtení trvalo moc dlouho. Zkuste znovu.';
  }
  if (/429|rate.?limit|quota|resource.?exhausted/i.test(text)) {
    return 'Čtení je teď přetížené. Zkuste znovu za chvíli.';
  }
  if (
    text.length > 160
    || /at\s+\S+\s+\(|stack|ECONN|ENOTFOUND|TypeError|ReferenceError|SyntaxError/i.test(text)
    || (/json/i.test(text) && /error|exception|failed|unexpected/i.test(text))
  ) {
    return 'Čtení se nepovedlo. Zkuste znovu.';
  }
  return text;
}

export type PolozkaProNahled = {
  qty?: number | null;
  beer_name?: string | null;
  package_label?: string | null;
  raw_line?: string | null;
};

export function popisPrectenychPolozek(polozky?: PolozkaProNahled[] | null, max = 6): string {
  if (!polozky?.length) return '';
  const radky = polozky
    .map((p) => {
      const ks = p.qty != null && Number(p.qty) > 0 ? `${Number(p.qty)}×` : '';
      const pivo = String(p.beer_name ?? '').trim();
      const obal = String(p.package_label ?? '').trim();
      const slozene = [ks, pivo, obal].filter(Boolean).join(' ');
      return slozene || String(p.raw_line ?? '').trim();
    })
    .filter(Boolean);
  if (radky.length <= max) return radky.join(', ');
  return `${radky.slice(0, max).join(', ')}…`;
}

export function popisMistaADne(zprava: {
  parsed_place_name?: string | null;
  sender_name?: string | null;
  parsed_delivery_day?: string | null;
  parsed_delivery_date?: string | null;
}): { misto: string; den: string } {
  const misto = String(zprava.parsed_place_name || zprava.sender_name || '').trim() || 'Neznámé místo';
  const denSlovy = String(zprava.parsed_delivery_day || '').trim();
  let datum = '';
  if (zprava.parsed_delivery_date) {
    const d = new Date(`${zprava.parsed_delivery_date}T12:00:00`);
    if (!Number.isNaN(d.getTime())) datum = d.toLocaleDateString('cs-CZ');
    else datum = zprava.parsed_delivery_date;
  }
  const den = [denSlovy, datum].filter(Boolean).join(' · ');
  return { misto, den };
}
