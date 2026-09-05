import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

// ============================================================
// 1) Re-seed the packages table (idempotent)
// ============================================================
const seedPackages = [
  { code: 'KEG50',   kind: 'keg',    volume_l: 50,   label: 'KEG 50l',    sort_order: 1 },
  { code: 'KEG30',   kind: 'keg',    volume_l: 30,   label: 'KEG 30l',    sort_order: 2 },
  { code: 'KEG20',   kind: 'keg',    volume_l: 20,   label: 'KEG 20l',    sort_order: 3 },
  { code: 'KEG15',   kind: 'keg',    volume_l: 15,   label: 'KEG 15l',    sort_order: 4 },
  { code: 'KEG10',   kind: 'keg',    volume_l: 10,   label: 'KEG 10l',    sort_order: 5 },
  { code: 'LAHEV15', kind: 'bottle', volume_l: 1.5,  label: 'Lahve 1.5l', sort_order: 6 },
  { code: 'LAHEV1',  kind: 'bottle', volume_l: 1,    label: 'Lahve 1l',   sort_order: 7 },
  { code: 'LAHEV05', kind: 'bottle', volume_l: 0.5,  label: 'Lahve 0.5l', sort_order: 8 },
  { code: 'LAHEV033',kind: 'bottle', volume_l: 0.33, label: 'Lahve 0.33l',sort_order: 9 },
];

console.log('=== Re-seeding packages ===');
for (const p of seedPackages) {
  const { data, error } = await supabase
    .from('packages')
    .upsert(p, { onConflict: 'code' })
    .select('id, code, volume_l, label');
  if (error) {
    console.error(`ERROR upserting ${p.code}:`, error.message);
  } else {
    console.log(`  ${p.code} -> ${data?.[0]?.id} (${p.volume_l}L)`);
  }
}

// Fetch all packages
const { data: packages, error: pkgErr } = await supabase.from('packages').select('id, code, kind, volume_l, label');
if (pkgErr) {
  console.error('ERROR fetching packages:', pkgErr.message);
  process.exit(1);
}
const pkgByCode = new Map((packages ?? []).map((p) => [p.code, p]));
console.log(`Total packages: ${packages?.length ?? 0}`);

// ============================================================
// 2) Fetch all bottling records
// ============================================================
const { data: bottling, error: bErr } = await supabase
  .from('bottling')
  .select('id, entry_date, beer_name, package_id, package_label, quantity, kegs_used, kegs_used_package_id, source_volume_l');

if (bErr) {
  console.error('ERROR fetching bottling:', bErr.message);
  process.exit(1);
}

console.log(`\nTotal bottling records: ${bottling?.length ?? 0}`);

// ============================================================
// 3) Map old package_id -> new package based on package_label
// ============================================================
function bottleVolumeFromLabel(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('0.33')) return 0.33;
  if (l.includes('0.5')) return 0.5;
  if (l.includes('1.5')) return 1.5;
  if (l.includes('1l') || l.includes('1 l') || l.includes('1.0')) return 1;
  return null;
}

// Map old kegs_used_package_id -> keg volume (inferred from source_volume_l / kegs_used)
const kegVolumeByOldId = new Map();
(bottling ?? []).forEach((r) => {
  if (r.kegs_used && r.source_volume_l) {
    const vol = r.source_volume_l / r.kegs_used;
    if (vol === 50 || vol === 30 || vol === 20 || vol === 15 || vol === 10) {
      kegVolumeByOldId.set(r.kegs_used_package_id, vol);
    }
  }
});

console.log('\n=== Inferred keg volumes by old kegs_used_package_id ===');
kegVolumeByOldId.forEach((vol, id) => console.log(`  ${id} -> ${vol}L`));

// ============================================================
// 4) Compute and apply fixes
// ============================================================
console.log('\n=== Applying fixes ===');
let updated = 0;
for (const r of bottling ?? []) {
  const bottleVol = bottleVolumeFromLabel(r.package_label);
  const kegVol = kegVolumeByOldId.get(r.kegs_used_package_id);

  if (bottleVol == null || kegVol == null) {
    console.log(`  SKIP ${r.beer_name} | ${r.package_label} | qty=${r.quantity} | kegs_used=${r.kegs_used} (cannot determine volumes)`);
    continue;
  }

  const totalVolume = r.quantity * bottleVol;
  const newKegsUsed = Math.max(1, Math.ceil(totalVolume / kegVol));
  const newSourceVolumeL = newKegsUsed * kegVol;

  // Find the correct new package for the bottle type
  const bottleCode = bottleVol === 0.33 ? 'LAHEV033' : bottleVol === 0.5 ? 'LAHEV05' : bottleVol === 1.5 ? 'LAHEV15' : 'LAHEV1';
  const newBottlePkg = pkgByCode.get(bottleCode);
  // Find the correct new package for the keg type
  const kegCode = kegVol === 50 ? 'KEG50' : kegVol === 30 ? 'KEG30' : kegVol === 20 ? 'KEG20' : kegVol === 15 ? 'KEG15' : 'KEG10';
  const newKegPkg = pkgByCode.get(kegCode);

  if (!newBottlePkg || !newKegPkg) {
    console.log(`  SKIP ${r.beer_name} | ${r.package_label} (missing package for ${bottleCode}/${kegCode})`);
    continue;
  }

  const changed = r.kegs_used !== newKegsUsed || r.source_volume_l !== newSourceVolumeL || r.package_id !== newBottlePkg.id || r.kegs_used_package_id !== newKegPkg.id;

  if (changed) {
    const { error } = await supabase
      .from('bottling')
      .update({
        package_id: newBottlePkg.id,
        package_label: newBottlePkg.label,
        kegs_used: newKegsUsed,
        kegs_used_package_id: newKegPkg.id,
        source_volume_l: newSourceVolumeL,
      })
      .eq('id', r.id);

    if (error) {
      console.log(`  ERROR ${r.beer_name} | ${r.package_label}: ${error.message}`);
    } else {
      console.log(`  FIXED ${r.beer_name} | ${r.package_label} | qty=${r.quantity} | kegs_used ${r.kegs_used}->${newKegsUsed} | srcL ${r.source_volume_l}->${newSourceVolumeL} | pkg ${r.package_id}->${newBottlePkg.id} | keg ${r.kegs_used_package_id}->${newKegPkg.id}`);
      updated++;
    }
  } else {
    console.log(`  OK ${r.beer_name} | ${r.package_label} | qty=${r.quantity} | kegs_used=${r.kegs_used} (no change)`);
  }
}

console.log(`\nDone. Updated ${updated} records.`);
