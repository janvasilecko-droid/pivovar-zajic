#!/usr/bin/env node
/** Kontrola platnosti Supabase tokenů z .env proti Management API (maska, žádný token ven). */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const names = ['SUPABASE_ACCESS_TOKEN', 'SB_TOKEN'];

for (const name of names) {
  const m = env.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\r\n]+)`, 'm'));
  if (!m) {
    console.log(`${name} = NOT FOUND`);
    continue;
  }
  const t = m[1].trim();
  const mask = t.length > 16 ? `${t.slice(0, 12)}...${t.slice(-4)}` : '***';
  try {
    const r = await fetch('https://api.supabase.com/v1/projects', {
      headers: { Authorization: `Bearer ${t}` },
    });
    console.log(`${name} (${mask}) -> HTTP ${r.status}${r.ok ? ` projects=${(await r.json()).length}` : ''}`);
  } catch (e) {
    console.log(`${name} (${mask}) -> NETERR ${e.message}`);
  }
}
