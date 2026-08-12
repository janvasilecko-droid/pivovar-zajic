// Unit test logiky validace výstupu LLM (stejná logika jako v
// supabase/functions/parse-order-text/index.ts — normKey/cleanJson/validateOutput/acceptOutput).
// Ověřuje, že se přijme validní výstup a odmítne rozbitý (nevalidní JSON,
// špatné schéma, hallucinovaná piva/obaly mimo katalog, špatné typy).
// Použití: node scripts/test-parse-order-validation.mjs
let failures = 0;

// === kopie logiky z index.ts ===
function normKey(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cleanJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  try {
    return { ok: true, cleaned, parsed: JSON.parse(cleaned) };
  } catch {
    return { ok: false, cleaned, parsed: null };
  }
}

function validateOutput(parsed, beerNameKeys, pkgLabelKeys) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'odpověď není objekt' };
  }
  if (!Array.isArray(parsed.items)) {
    return { ok: false, reason: 'items není pole' };
  }
  if (parsed.items.length === 0) {
    return { ok: true };
  }
  let checkable = 0;
  let matched = 0;
  for (const it of parsed.items) {
    if (typeof it !== 'object' || it === null) {
      return { ok: false, reason: 'položka není objekt' };
    }
    if (it.quantity !== null && it.quantity !== undefined && typeof it.quantity !== 'number') {
      return { ok: false, reason: 'quantity není číslo/null' };
    }
    for (const f of ['degree', 'beer_name', 'package_label', 'place_name', 'date']) {
      const v = it[f];
      if (v !== null && v !== undefined && typeof v !== 'string') {
        return { ok: false, reason: `${f} není string/null` };
      }
    }
    const pkg = it.package_label;
    if (pkg != null && String(pkg).trim() !== '' && pkgLabelKeys.size > 0) {
      checkable++;
      if (pkgLabelKeys.has(normKey(String(pkg)))) matched++;
    }
    const beer = it.beer_name;
    if (beer != null && String(beer).trim() !== '' && beerNameKeys.size > 0) {
      checkable++;
      const bk = normKey(String(beer));
      if (beerNameKeys.has(bk) || [...beerNameKeys].some((k) => k.includes(bk) || bk.includes(k))) matched++;
    }
  }
  if (checkable > 0 && matched / checkable < 0.5) {
    return { ok: false, reason: `jen ${matched}/${checkable} pivo/obal polí odpovídá katalogu` };
  }
  return { ok: true };
}

function acceptOutput(provider, candidate, beerNameKeys, pkgLabelKeys) {
  if (!candidate) return '';
  const clean = cleanJson(candidate);
  if (!clean.ok) return '';
  const v = validateOutput(clean.parsed, beerNameKeys, pkgLabelKeys);
  if (!v.ok) return '';
  return clean.cleaned;
}
// === konec kopie ===

const BEERS = [
  { name: '12° Světlá' },
  { name: '11° Světlá' },
  { name: '10° Desítka' },
  { name: '12° Tmavá' },
  { name: 'Jantar' },
  { name: 'Summer Ale' },
  { name: '13 Hazy Bunny' },
  { name: 'Hazy Spring Day' },
];
const PACKAGES = [
  { label: 'KEG 50l' },
  { label: 'KEG 30l' },
  { label: 'KEG 20l' },
  { label: 'KEG 15l' },
  { label: 'KEG 10l' },
  { label: 'Lahve 1.5l' },
  { label: 'Lahve 1l' },
  { label: 'Lahve 0.5l' },
  { label: 'Lahve 0.33l' },
];
const beerNameKeys = new Set(BEERS.map((b) => normKey(b.name)));
const pkgLabelKeys = new Set(PACKAGES.map((p) => normKey(p.label)));

const item = (over = {}) => ({
  quantity: 2,
  degree: '12°',
  beer_name: '12° Světlá',
  package_label: 'KEG 50l',
  raw_line: 'Seeberg 2x50 12sv',
  place_name: 'Seeberg',
  date: '2026-08-06',
  ...over,
});

function t(name, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r.ok;
    detail = r.detail;
  } catch (e) {
    detail = 'výjimka: ' + e.message;
  }
  console.log(`  ${ok ? 'OK ' : '✗ '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log('=== Přijetí (validní výstup) ===');
t('validní výstup Gemini', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item(), item({ quantity: 1, package_label: 'KEG 30l', raw_line: 'Seeberg 1x30' })], place_name: 'Seeberg', raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r !== '', detail: r === '' ? 'odmítnuto' : '' };
});
t('pivo bez stupně ("Světlá" vs "12° Světlá")', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item({ beer_name: 'Světlá' })], raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r !== '', detail: r === '' ? 'odmítnuto' : '' };
});
t('překlep obalu ("KEG50l")', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item({ package_label: 'KEG50l' })], raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r !== '', detail: r === '' ? 'odmítnuto' : '' };
});
t('prázdné items (zpráva bez objednávky)', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [], place_name: null, raw_text: 'Dobrý den.' }), beerNameKeys, pkgLabelKeys);
  return { ok: r !== '', detail: r === '' ? 'odmítnuto' : '' };
});
t('poloviční shoda (1/2 sedí na katalog)', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item(), item({ beer_name: 'Nějaké Neznámé Pivo', package_label: 'Nějaký Obal' })], raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r !== '', detail: r === '' ? 'odmítnuto' : '' };
});

console.log('=== Odmítnutí (rozbitý výstup) ===');
t('nevalidní JSON', () => {
  const r = acceptOutput('gemini', 'tohle není json {', beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('items není pole', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: 'du', raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('odpověď není objekt (jen text)', () => {
  const r = acceptOutput('gemini', JSON.stringify('jen text'), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('položka není objekt', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: ['pivko'] }), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('quantity je string', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item({ quantity: '2' })] }), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('hallucinovaná piva i obaly (0/6 na katalog)', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item({ beer_name: 'Tatranský Ležák', package_label: 'Sud 300l' }), item({ beer_name: 'Mořské Pivo', package_label: 'Krabice 12l' })], raw_text: 'x' }), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('place_name není string', () => {
  const r = acceptOutput('gemini', JSON.stringify({ items: [item({ place_name: 123 })] }), beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});
t('prázdný kandidát (prázdný text)', () => {
  const r = acceptOutput('gemini', '', beerNameKeys, pkgLabelKeys);
  return { ok: r === '', detail: r !== '' ? 'přijato' : '' };
});

console.log(`\n===== VÝSLEDEK: ${failures === 0 ? 'OK' : `${failures} CHYB`} =====`);
process.exit(failures > 0 ? 1 : 0);
