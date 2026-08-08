// Lokální test matcheru (whatsapp-auto-parse) — nerekurzivní, jen logika
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');

function normText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[ěščřžýáíéóúůťďň]/g, (c) => ({ ě: 'e', š: 's', č: 'c', ř: 'r', ž: 'z', ý: 'y', á: 'a', í: 'i', é: 'e', ó: 'o', ú: 'u', ů: 'u', ť: 't', ď: 'd', ň: 'n' }[c] ?? c))
    .replace(/[^a-z0-9°.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchBeerInText(text, beers, aliasMap, rawDegree) {
  if (!text) return null;
  let best = null, bestLen = 0;
  for (const b of beers) {
    for (const name of [b.name, b.short_name]) {
      const n = normText(name || '');
      if (n.length >= 3 && text.includes(n) && n.length > bestLen) { best = b.id; bestLen = n.length; }
    }
  }
  if (best) return best;
  for (const [alias, beerId] of aliasMap.beer) {
    const na = normText(alias);
    if (na.length >= 2 && (text === na || text.includes(na))) return beerId;
  }
  const degree = (rawDegree || '').replace('°', '').trim();
  if (degree) {
    const candidates = beers.filter((b) => (b.degree || '').replace('°', '').trim() === degree);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) {
      if (/tmav|dark|tl\b|cerne|cerna/.test(text)) {
        const dark = candidates.find((b) => /tmav|dark/.test(normText(b.name)));
        if (dark) return dark.id;
      }
      if (/svetl|svet|light|sv\b/.test(text)) {
        const light = candidates.find((b) => /svetl|svet|light|sv\b/.test(normText(b.name)));
        if (light) return light.id;
      }
    }
  }
  return null;
}

function matchBeerId(item, beers, aliasMap) {
  const rawText = normText([item.raw_line, item.degree].filter(Boolean).join(' '));
  if (rawText) {
    const hit = matchBeerInText(rawText, beers, aliasMap, item.degree);
    if (hit) return hit;
  }
  const aiName = normText(item.beer_name || '');
  if (aiName) {
    const hit = matchBeerInText(aiName, beers, aliasMap, item.degree);
    if (hit) return hit;
  }
  return null;
}

function matchPackageId(item, packages, aliasMap) {
  // Primárně párujeme z package_label od AI — to je obal KONKRÉTNÍ položky.
  // raw_line může obsahovat VÍCE obalů najednou ("3x50l KEG + 24x1,5l PET +
  // 20x0,5l lahev") — párovat proti celému raw_line by přiřadilo všem položkám
  // řádku jeden (nejdelší) obal. raw_line použij JEN jako zálohu.
  const labelText = normText(item.package_label || '');
  const rawText = normText(item.raw_line || '');
  const text = labelText || rawText;
  if (!text) return null;
  let best = null, bestLen = 0;
  for (const p of packages) {
    const n = normText(p.label);
    if (n.length >= 2 && text.includes(n) && n.length > bestLen) { best = p.id; bestLen = n.length; }
  }
  if (best) return best;
  const volRe = text.match(/(\d+(?:[.,]\d+)?)\s*l/i);
  if (volRe) {
    const v = parseFloat(volRe[1].replace(',', '.'));
    const byVol = packages.find((p) => Number(p.volume_l) === v) ??
      packages.find((p) => normText(p.label) === `${v}l` || normText(p.label) === String(v));
    if (byVol) return byVol.id;
  }
  for (const [alias, pkgId] of aliasMap.package) {
    const na = normText(alias);
    if (na.length >= 2 && (text === na || text.includes(na))) return pkgId;
  }
  return null;
}

const beers = await (await fetch(`${SU}/rest/v1/beers?select=id,name,degree,short_name&order=name`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })).json();
const packages = await (await fetch(`${SU}/rest/v1/packages?select=id,label,volume_l&order=label`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })).json();
const aliasMap = { beer: new Map(), package: new Map() };

const cases = [
  { beer_name: null, package_label: 'KEG 50l', degree: '12°', raw_line: '2x 12° světlý ležák 50l', expectBeer: '12° Světlá', expectPkg: '50l' },
  { beer_name: null, package_label: 'KEG 30l', degree: '13°', raw_line: '1x 13° jantar 30l', expectBeer: 'Jantar', expectPkg: '30l' },
  { beer_name: '12° Světlá', package_label: 'KEG 50l', degree: '12°', raw_line: '2x 12° světlý ležák 50l', expectBeer: '12° Světlá', expectPkg: '50l' },
  { beer_name: 'Jantar', package_label: 'KEG 30l', degree: '13°', raw_line: '1x 13° jantar 30l', expectBeer: 'Jantar', expectPkg: '30l' },
  { beer_name: '12° Tmavá', package_label: 'KEG 30l', degree: '12°', raw_line: '2x 12° tmavý ležák 30l', expectBeer: '12° Tmavá', expectPkg: '30l' },
  // AI si vymyslela pivo podle stupně, ale originál jasně říká "jantar" → musí vyhrát Jantar
  { beer_name: '13 Hazy Bunny', package_label: 'KEG 30l', degree: '13°', raw_line: '1x 13° jantar 30l', expectBeer: 'Jantar', expectPkg: '30l' },
  // Jen stupeň 12 + "světlé" → 12° Světlá
  { beer_name: null, package_label: 'KEG 50l', degree: '12°', raw_line: '4x50 12sv', expectBeer: '12° Světlá', expectPkg: '50l' },
  // ⚠️ SLOUČENÝ ŘÁDEK S VÍCE OBALY: každá položka si musí ponechat VLASTNÍ obal,
  // i když raw_line obsahuje i jiné objemy ("3x50l KEG + 24x1,5l PET + 20x0,5l lahev").
  { beer_name: '12° Světlá', package_label: 'KEG 50l', degree: '12°', raw_line: 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)', expectBeer: '12° Světlá', expectPkg: '50l' },
  { beer_name: '12° Světlá', package_label: 'PET 1.5l', degree: '12°', raw_line: 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)', expectBeer: '12° Světlá', expectPkg: '1.5l' },
  { beer_name: '12° Světlá', package_label: 'Lahve 0.5l', degree: '12°', raw_line: 'SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)', expectBeer: '12° Světlá', expectPkg: '0.5l' },
  { beer_name: 'Jantar', package_label: 'KEG 30l', degree: null, raw_line: 'Jantar 12 = 3x30l KEG + 12x1,5l PET', expectBeer: 'Jantar', expectPkg: '30l' },
  { beer_name: 'Jantar', package_label: 'PET 1.5l', degree: null, raw_line: 'Jantar 12 = 3x30l KEG + 12x1,5l PET', expectBeer: 'Jantar', expectPkg: '1.5l' },
];

for (const it of cases) {
  const bid = matchBeerId(it, beers, aliasMap);
  const pid = matchPackageId(it, packages, aliasMap);
  const beer = beers.find((b) => b.id === bid);
  const pkg = packages.find((p) => p.id === pid);
  const okBeer = beer?.name === it.expectBeer;
  const okPkg = pkg?.label?.trim() === it.expectPkg;
  console.log(`${okBeer && okPkg ? '✅' : '❌'} ${it.raw_line || it.beer_name} → ${beer?.name ?? 'NULL'} / ${pkg?.label ?? 'NULL'} (očekávám ${it.expectBeer} / ${it.expectPkg})`);
}
