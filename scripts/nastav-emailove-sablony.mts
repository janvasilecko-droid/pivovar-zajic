// ✉️ Nastaví šablony e-mailů Supabase (pozvánka a zapomenuté heslo) z kódu.
// ---------------------------------------------------------------------------
// Majitel 19. 10. 2026: v předmětu e-mailu zůstávalo anglické „Reset your
// password“ a pole v Supabase se mu nedařilo najít. Šablony (předmět + tělo
// s návodem) proto drží repozitář — lib/pozvanka.ts — a tenhle skript je při
// nasazení pošle do Supabase přes Management API (token je v GitHub secretu
// SUPABASE_ACCESS_TOKEN, stejný jako pro nasazení funkcí).
//
// Spuštění: npx vite-node scripts/nastav-emailove-sablony.mts [--suchy]
//   --suchy  jen vypíše, co by se poslalo (bez tokenu a bez sítě)
import { PREDMET_SABLONY, sablonaEmailuSupabase } from '../src/lib/pozvanka';

const PROJEKT = 'sasqexjadvlqyticxwja';
const suchy = process.argv.includes('--suchy');

const telo = {
  mailer_subjects_invite: PREDMET_SABLONY.pozvanka,
  mailer_templates_invite_content: sablonaEmailuSupabase('pozvanka'),
  mailer_subjects_recovery: PREDMET_SABLONY.obnova,
  mailer_templates_recovery_content: sablonaEmailuSupabase('obnova'),
};

if (suchy) {
  for (const [k, v] of Object.entries(telo)) console.log(`${k}: ${String(v).length > 80 ? `${String(v).length} znaků` : v}`);
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('SUPABASE_ACCESS_TOKEN není nastaven — šablony e-mailů se nenastavují.');
  process.exit(0);
}

const adresa = `https://api.supabase.com/v1/projects/${PROJEKT}/config/auth`;
const hlavicky = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const odpoved = await fetch(adresa, { method: 'PATCH', headers: hlavicky, body: JSON.stringify(telo) });
if (!odpoved.ok) {
  console.error(`Nastavení šablon selhalo: HTTP ${odpoved.status} ${(await odpoved.text()).slice(0, 300)}`);
  process.exit(1);
}
const po = await (await fetch(adresa, { headers: hlavicky })).json() as Record<string, unknown>;
const shoda = po.mailer_subjects_recovery === telo.mailer_subjects_recovery && po.mailer_subjects_invite === telo.mailer_subjects_invite;
console.log(`Šablony e-mailů nastaveny. Předmět zapomenutého hesla v Supabase: „${po.mailer_subjects_recovery}“, pozvánky: „${po.mailer_subjects_invite}“.`);
process.exit(shoda ? 0 : 1);
