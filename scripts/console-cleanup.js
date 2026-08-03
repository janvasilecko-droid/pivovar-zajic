/**
 * VYČIŠTĚNÍ DATABÁZE — SPUSTIT V KONZOLI PROHLÍŽEČE (F12)
 *
 * Tento skript se spouští v prohlížeči, kde jste přihlášeni do aplikace.
 * Využije váš přihlašovací token (uložený v localStorage) a vymaže
 * VŠECHNA uživatelská data z databáze Supabase.
 *
 * POSTUP:
 * 1. Otevřete aplikaci a přihlaste se (musíte být přihlášeni).
 * 2. Stiskněte F12 → záložka Console.
 * 3. Vložte celý tento kód a stiskněte Enter.
 * 4. Počkejte na dokončení (zobrazí se přehled smazaných tabulek).
 */

(async () => {
  const SUPABASE_URL = 'https://sasqexjadvlqyticxwja.supabase.co';
  const PROJECT_REF = 'sasqexjadvlqyticxwja';

  // 1) Najdeme přihlašovací token v localStorage
  let accessToken = null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes('auth-token')) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        accessToken = val?.access_token || val?.session?.access_token || null;
        if (accessToken) break;
      } catch {}
    }
  }

  if (!accessToken) {
    console.error('❌ Nebyl nalezen přihlašovací token. Přihlaste se do aplikace a zkuste znovu.');
    return;
  }
  console.log('✅ Přihlašovací token nalezen.');

  // 2) Tabulky s uživatelskými daty (všechny se vymažou)
  const USER_TABLES = [
    'order_items', 'orders',
    'bottling', 'bottling_entries', 'kegging', 'kegging_entries',
    'writeoffs', 'inventory', 'monthly_inventory',
    'fasovani', 'fasovani_private',
    'akce_items', 'akce', 'event_items',
    'calendar_events', 'reminders',
    'sanitation_logs', 'srotovani', 'zadavani',
    'cellar_transfers', 'cellar_tank_cycles', 'kegging_tanks',
    'places', 'price_list', 'vehicles',
    'parser_aliases', 'audit_log', 'user_app_versions', 'feedback_notes',
  ];

  // 3) Referenční číselníky — reset na seed
  const SEED_BEERS = [
    ['12° Světlá', '12°', 'světlé', '#FDE68A', 1],
    ['11° Světlá', '11°', 'světlé', '#FEF3C7', 2],
    ['10° Desítka', '10°', 'světlé', '#FCD34D', 3],
    ['12° Tmavá', '12°', 'tmavé', '#44403B', 4],
    ['Jantar', null, 'jantarové', '#F59E0B', 5],
    ['Summer Ale', null, 'ovocné', '#86EFAC', 6],
    ['13 Hazy Bunny', '13°', 'nefiltrované', '#FCA5A5', 7],
    ['Hazy Spring Day', null, 'nefiltrované', '#F9A8D4', 8],
  ];
  const SEED_PACKAGES = [
    ['KEG50', 'keg', 50, 'KEG 50l', 1],
    ['KEG30', 'keg', 30, 'KEG 30l', 2],
    ['KEG20', 'keg', 20, 'KEG 20l', 3],
    ['KEG15', 'keg', 15, 'KEG 15l', 4],
    ['KEG10', 'keg', 10, 'KEG 10l', 5],
    ['LAHEV15', 'bottle', 1.5, 'Lahve 1.5l', 6],
    ['LAHEV1', 'bottle', 1, 'Lahve 1l', 7],
    ['LAHEV05', 'bottle', 0.5, 'Lahve 0.5l', 8],
    ['LAHEV033', 'bottle', 0.33, 'Lahve 0.33l', 9],
  ];

  const headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhc3FleGphZHZscXl0aWN4d2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDUwNDIsImV4cCI6MjEwMDIyMTA0Mn0.ydJoE65MhlUpUDrl3bWzSpt0D6jauHVkgwI5uBKTgRs',
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  const api = (path, opts = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });

  // 4) Vymazání uživatelských tabulek
  console.log('🗑️  Mažu uživatelská data...');
  for (const table of USER_TABLES) {
    try {
      const res = await api(`${table}?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
      if (res.ok) console.log(`   ✅ ${table}`);
      else console.log(`   ⚠️  ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    } catch (e) {
      console.log(`   ⚠️  ${table}: ${e.message}`);
    }
  }

  // 5) Reset referenčních číselníků
  console.log('🔄 Resetuji referenční číselníky...');

  // Piva
  try { await api('beers?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' }); } catch {}
  for (const [name, degree, color, beer_color, sort_order] of SEED_BEERS) {
    try { await api('beers', { method: 'POST', body: JSON.stringify({ name, degree, color, beer_color, is_active: true, sort_order }) }); } catch {}
  }
  console.log('   ✅ beers (8 piv)');

  // Obaly
  try { await api('packages?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' }); } catch {}
  for (const [code, kind, volume_l, label, sort_order] of SEED_PACKAGES) {
    try { await api('packages', { method: 'POST', body: JSON.stringify({ code, kind, volume_l, label, sort_order }) }); } catch {}
  }
  console.log('   ✅ packages (9 obalů)');

  // Sklepní tanky
  try { await api('cellar_tanks?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' }); } catch {}
  for (let i = 1; i <= 8; i++) {
    try { await api('cellar_tanks', { method: 'POST', body: JSON.stringify({ label: `Tank ${i}`, capacity_l: 7500, current_volume_l: 0, status: 'empty' }) }); } catch {}
  }
  console.log('   ✅ cellar_tanks (8 tanků)');

  console.log('\n🎉 VYČIŠTĚNÍ DOKONČENO!');
  console.log('Aplikace je připravena na ostrý provoz.');
  console.log('Doporučuji obnovit stránku (F5).');
})();
