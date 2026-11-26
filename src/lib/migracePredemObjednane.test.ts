// 🔔 Pondělní push „Předem objednané“ — migrace 20261231500000 (majitel 26. 11. 2026: „…upozornit v pondělí týden
// kdy to má být stočený“). Samotné SQL se zkouší v místní databázi (PostgreSQL 16: dvanáct scénářů a jedenáct
// úmyslných chyb, viz popis PR); tenhle test hlídá to, co jde ověřit bez ní: pojistky ve zdroji a že pravidlo
// v SQL je totéž, co v aplikaci (lib/predemObjednane.ts) — dvě kopie jednoho pravidla se jinak rozejdou potichu.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREDSTIH_DNI } from './predemObjednane';
import { STAVY_OBJEDNAVKY, jeVyrizena } from './stavyObjednavek';

const SQL = readFileSync('supabase/migrations/20261231500000_predem_objednane_push.sql', 'utf8');
/** SQL bez komentářů — kontroly se nesmí nechat zmást slovem v komentáři. */
const BEZ_KOMENTARU = SQL.split('\n').filter((r) => !r.trim().startsWith('--')).join('\n');

describe('migrace pondělního pushu „Předem objednané“ — pojistky ve zdroji', () => {
  it('jen čte: žádný zápis do dat, nic se nemaže ani neshazuje', () => {
    expect(BEZ_KOMENTARU).not.toMatch(/\b(UPDATE|DELETE|INSERT|DROP|TRUNCATE|ALTER)\b/i);
  });

  it('předstih v SQL je stejný jako PREDSTIH_DNI v aplikaci', () => {
    const m = BEZ_KOMENTARU.match(/o\.delivery_date - o\.order_date >= (\d+)/);
    expect(m, 'v SQL chybí podmínka předstihu').not.toBeNull();
    expect(Number(m![1])).toBe(PREDSTIH_DNI);
  });

  it('vynechané stavy v SQL jsou storno + všechno, co aplikace bere jako vyřízené', () => {
    const m = BEZ_KOMENTARU.match(/coalesce\(o\.status, ''\) NOT IN \(([^)]*)\)/);
    expect(m, 'v SQL chybí výčet stavů').not.toBeNull();
    const vSql = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort();
    const vAplikaci = ['storno', ...Object.keys(STAVY_OBJEDNAVKY).filter((s) => jeVyrizena(s))].sort();
    expect(vSql).toEqual(vAplikaci);
    expect(BEZ_KOMENTARU).toMatch(/NOT coalesce\(o\.is_delivered, false\)/);
  });

  it('týden je pondělí až neděle v pražském čase', () => {
    expect(BEZ_KOMENTARU).toMatch(/\(now\(\) AT TIME ZONE 'Europe\/Prague'\)::date/);
    expect(BEZ_KOMENTARU).toMatch(/date_trunc\('week', p_dnes::timestamp\)::date;/);
    expect(BEZ_KOMENTARU).toMatch(/date_trunc\('week', p_dnes::timestamp\)::date \+ 6;/);
    expect(BEZ_KOMENTARU).toMatch(/o\.delivery_date BETWEEN v_pondeli AND v_nedele/);
  });

  it('bez tajného klíče a bez předem objednaných se nic neposílá', () => {
    expect(BEZ_KOMENTARU).toMatch(/IF v_secret IS NULL THEN\s+RETURN;/);
    expect(BEZ_KOMENTARU).toMatch(/IF v_pocet = 0 THEN\s+RETURN;/);
  });

  it('push jde přes posli-push se sdíleným tajným klíčem a vlastním tagem', () => {
    expect(BEZ_KOMENTARU).toMatch(/SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET'/);
    expect(BEZ_KOMENTARU).toMatch(/functions\/v1\/posli-push/);
    expect(BEZ_KOMENTARU).toMatch(/'X-Internal-Cron-Secret', v_secret/);
    expect(BEZ_KOMENTARU).toMatch(/'tag', 'predem-objednane'/);
  });

  it('plánovač: pondělí v 5:00 UTC a volání bez parametru', () => {
    expect(BEZ_KOMENTARU).toMatch(/cron\.schedule\(\s*'predem-objednane-push',\s*'0 5 \* \* 1',\s*\$\$SELECT public\.posli_predem_objednane\(\);\$\$\s*\)/);
  });

  it('volat smí jen plánovač (SECURITY DEFINER, pevný search_path, bez práv pro přihlášené)', () => {
    expect(BEZ_KOMENTARU).toMatch(/SECURITY DEFINER\s+SET search_path = public, extensions/);
    expect(BEZ_KOMENTARU).toMatch(/REVOKE ALL ON FUNCTION public\.posli_predem_objednane\(date\) FROM PUBLIC, anon, authenticated;/);
  });
});
