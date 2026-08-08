#!/usr/bin/env node
/** Verifies RLS policies on whatsapp_incoming via Management API. Requires env var SB_TOKEN. */
const token = process.env.SB_TOKEN;
if (!token) {
  console.error('Missing SB_TOKEN environment variable');
  process.exit(1);
}
const projectRef = 'sasqexjadvlqyticxwja';
const query = "SELECT policyname, cmd, roles::text, qual FROM pg_policies WHERE tablename = 'whatsapp_incoming' ORDER BY policyname";
const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
console.log(`HTTP ${resp.status}`);
const rows = await resp.json();
for (const r of rows) {
  console.log(`- ${r.policyname} | ${r.cmd} | roles=${r.roles} | qual=${r.qual || ''}`);
}
