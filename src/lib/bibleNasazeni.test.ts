// Nasazení edge funkcí PROJEKTU BIBLE (samostatný Supabase, R12): nikdy do
// hlavního projektu a nikdy bez verify_jwt = false.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { funkceBible, nactiZaznam, otiskFunkce } from '../../scripts/bible-nasazeni.mjs';

const DEPLOY = readFileSync('.github/workflows/deploy.yml', 'utf8');
const krok = (nazev: string) => {
  const od = DEPLOY.indexOf(`- name: ${nazev}`);
  expect(od, nazev).toBeGreaterThan(-1);
  // Krok končí dalším krokem, komentářem nad ním nebo dalším jobem.
  const dalsi = DEPLOY.slice(od + 10).search(/\n {6}(?:- name: |# )|\n {2}[a-z-]+:\n/);
  return DEPLOY.slice(od, dalsi === -1 ? undefined : od + 10 + dalsi);
};

describe('funkce projektu bible', () => {
  it('otisk: bible-api a bible-migrace, stabilní a různý pro každou funkci', () => {
    expect(funkceBible()).toEqual(['bible-api', 'bible-migrace']);
    const a = otiskFunkce('bible-api');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(otiskFunkce('bible-api')).toBe(a);
    expect(otiskFunkce('bible-migrace')).not.toBe(a);
    expect(otiskFunkce('neexistuje')).toBe('');
  });

  it('záznam nasazení zná jen funkce, které v repozitáři jsou', () => {
    for (const slug of Object.keys(nactiZaznam())) expect(funkceBible()).toContain(slug);
  });

  it('CI je nasazuje do projektu bible, s vypnutým verify_jwt, připnutým CLI a bez --prune', () => {
    const k = krok('Edge funkce projektu bible');
    expect(k).toMatch(/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_BIBLE_ACCESS_TOKEN \}\}/);
    expect(k).toMatch(/BIBLE_REF: cegrelgvkygcatupqwrx/);
    expect(k).toMatch(/supabase@2\.\d+\.\d+ --workdir bible functions deploy "\$f" --project-ref "\$BIBLE_REF" --no-verify-jwt/);
    expect(k).toMatch(/secrets set --project-ref "\$BIBLE_REF" --env-file/);
    expect(k).toMatch(/if: always\(\)/);
    expect(k).not.toMatch(/--prune|supabase link|sasqexjadvlqyticxwja|git diff --name-only|github\.event\.before/);
    expect(k).toMatch(/bible-nasazeni\.mjs --jen-jmena/);
  });

  it('funkce appky se dál nasazují jen do hlavního projektu a bible do nich nepatří', () => {
    const k = krok('Změněné edge funkce');
    expect(k).toMatch(/--project-ref sasqexjadvlqyticxwja/);
    expect(k).not.toMatch(/--workdir bible|cegrelgvkygcatupqwrx/);
    expect(Object.keys(JSON.parse(readFileSync('supabase/nasazeno.json', 'utf8')))).not.toContain('bible-api');
  });
});
