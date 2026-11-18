// 📍 Sklad a Drobák patří pod odběratele Radek — migrace 20261231480000.
//
// Majitel 18. 11. 2026: „Sklad, Drobák patří pod odběratele Radek." Migrace
// dá Radkovi dvě místa závozu, přepíše na něj objednávky Skladu a přidá aliasy,
// aby se „Sklad" a „Drobák" ve zprávě přiřadily Radkovi. Samotný SQL se zkouší
// v místní databázi; tenhle test hlídá to, co jde ověřit bez ní: pojistky ve
// zdroji a že data z migrace appka opravdu přečte a použije.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mistaOdberatele, mistoObjednavky } from './mistaZavozu';
import { matchAgainstCatalog, normPlaceName } from '../../supabase/functions/_shared/place-match';

const SQL = readFileSync('supabase/migrations/20261231480000_sklad_a_drobak_pod_radka.sql', 'utf8');
/** SQL bez komentářů — kontroly se nesmí nechat zmást slovem v komentáři. */
const BEZ_KOMENTARU = SQL.split('\n').filter((r) => !r.trim().startsWith('--')).join('\n');

describe('migrace Sklad a Drobák pod Radka — pojistky ve zdroji', () => {
  it('nic se nemaže ani neshazuje', () => {
    expect(BEZ_KOMENTARU).not.toMatch(/\bDELETE\b/i);
    expect(BEZ_KOMENTARU).not.toMatch(/\bDROP\b/i);
    expect(BEZ_KOMENTARU).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('každý UPDATE má WHERE (Supabase má pg_safeupdate)', () => {
    const updaty = BEZ_KOMENTARU.split(/\bUPDATE\b/i).slice(1);
    expect(updaty.length).toBeGreaterThanOrEqual(3);
    for (const u of updaty) {
      const telo = u.split(';')[0];
      expect(telo, `UPDATE bez WHERE: ${telo.slice(0, 80)}`).toMatch(/\bWHERE\b/i);
    }
  });

  it('bez migrace míst závozu, bez jediného Radka a při víc Radcích se nic neudělá', () => {
    expect(BEZ_KOMENTARU).toMatch(/column_name = 'mista_zavozu'/);
    expect(BEZ_KOMENTARU).toMatch(/column_name = 'misto_zavozu'/);
    expect(BEZ_KOMENTARU).toMatch(/IF v_pocet <> 1 THEN[\s\S]{0,160}RETURN;/);
  });

  it('už zvolené místo u objednávky se nepřepisuje a existující alias taky ne', () => {
    expect(BEZ_KOMENTARU).toMatch(/WHERE misto_zavozu IS NULL/);
    expect(BEZ_KOMENTARU).toMatch(/ON CONFLICT \(wrong_name\) DO NOTHING/);
  });

  it('nesahá do dnů ani dat závozu a nepřepisuje zprávy z WhatsAppu', () => {
    expect(BEZ_KOMENTARU).not.toMatch(/delivery_day|delivery_date|order_date/i);
    expect(BEZ_KOMENTARU).not.toMatch(/whatsapp_incoming/i);
  });
});

describe('data z migrace v aplikaci', () => {
  // Přesně takhle migrace zapíše místa Radka (jsonb_build_object z migrace).
  const radek = {
    name: 'Radek',
    address: null,
    mista_zavozu: [
      { id: 'misto-sklad', nazev: 'Sklad', adresa: null, lat: null, lng: null },
      { id: 'misto-drobak', nazev: 'Drobák', adresa: null, lat: null, lng: null },
    ],
  };

  it('zdroj migrace obsahuje přesně tyhle id a názvy míst', () => {
    expect(SQL).toContain("'id', 'misto-sklad', 'nazev', 'Sklad'");
    expect(SQL).toContain("'id', 'misto-drobak', 'nazev', 'Drobák'");
  });

  it('appka přečte obě místa a objednávka s „misto-sklad" jede na Sklad', () => {
    expect(mistaOdberatele(radek).map((m) => m.nazev)).toEqual(['Sklad', 'Drobák']);
    const cil = mistoObjednavky({ misto_zavozu: 'misto-sklad' }, radek);
    expect(cil).toMatchObject({ id: 'misto-sklad', nazev: 'Sklad', zvoleno: true, ztracene: false });
    expect(mistoObjednavky({ misto_zavozu: 'misto-drobak' }, radek).nazev).toBe('Drobák');
  });

  it('objednávka Radka bez zvoleného místa se pozná jako nevybraná (Kniha jízd upozorní)', () => {
    expect(mistoObjednavky({ misto_zavozu: null }, radek).zvoleno).toBe(false);
  });
});

describe('aliasy z migrace — „Sklad" a „Drobák" ve zprávě je Radek', () => {
  const radek = { id: 'p-radek', name: 'Radek' };
  const sklad = { id: 'p-sklad', name: 'Sklad' };
  // Pravopis aliasů ve zdroji migrace.
  const aliasyZMigrace = [...SQL.matchAll(/\('([a-z]+)', v_radek, v_radek_jmeno\)/g)].map((m) => ({
    wrong_name: m[1],
    correct_name: 'Radek',
  }));

  it('migrace zakládá právě aliasy sklad a drobak', () => {
    expect(aliasyZMigrace.map((a) => a.wrong_name)).toEqual(['sklad', 'drobak']);
  });

  it('pravopis aliasů je totéž, co z názvu udělá normalizace odběratelů', () => {
    expect(normPlaceName('Sklad')).toBe('sklad');
    expect(normPlaceName('Drobák')).toBe('drobak');
    expect(normPlaceName('Drobák ')).toBe(aliasyZMigrace[1].wrong_name);
  });

  it('„Drobák" se přiřadí Radkovi, i když takový odběratel v katalogu není', () => {
    expect(matchAgainstCatalog('Drobák', [radek, sklad], aliasyZMigrace)).toEqual({ id: 'p-radek', name: 'Radek' });
    expect(matchAgainstCatalog('drobak', [radek], aliasyZMigrace)).toEqual({ id: 'p-radek', name: 'Radek' });
  });

  it('„Sklad" se přiřadí Radkovi, i když odběratel Sklad v katalogu zůstal (alias má přednost před shodou jména)', () => {
    expect(matchAgainstCatalog('Sklad', [radek, sklad], aliasyZMigrace)).toEqual({ id: 'p-radek', name: 'Radek' });
    // Bez aliasu by to bylo naopak — právě proto migrace aliasy zakládá.
    expect(matchAgainstCatalog('Sklad', [radek, sklad], [])).toEqual({ id: 'p-sklad', name: 'Sklad' });
  });

  it('ostatní odběratelé zůstávají, jak byli', () => {
    const jona = { id: 'p-jona', name: 'Jona' };
    expect(matchAgainstCatalog('Jona', [radek, sklad, jona], aliasyZMigrace)).toEqual({ id: 'p-jona', name: 'Jona' });
  });
});
