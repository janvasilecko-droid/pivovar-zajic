// @vitest-environment node
// 🧭 Napojení vektorového hledání (R38) mimo čistý kód: bible-api, Správa znalostí a workflow v Actions.
// Tohle se jinak nedá spustit (Deno funkce, GitHub Actions), a když se spojení rozbije, hledání podle významu
// tiše přestane fungovat nebo — hůř — klíč OpenAI skončí ve veřejném logu. Proto se tu hlídá text souborů.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_VEKTORU } from './vektory.ts';

const cti = (cesta: string) => readFileSync(cesta, 'utf-8');

/** Text kroku workflow od „- name: X“ do dalšího kroku (nebo do konce souboru). */
function krok(workflow: string, nazev: string): string {
  const zacatek = workflow.indexOf(`      - name: ${nazev}\n`);
  expect(zacatek, `krok „${nazev}“ ve workflow chybí`).toBeGreaterThan(-1);
  const dalsi = workflow.indexOf('\n      - name: ', zacatek + 1);
  return workflow.slice(zacatek, dalsi === -1 ? undefined : dalsi);
}

describe('bible-api: stav vektorů pro správce', () => {
  const api = cti('bible/supabase/functions/bible-api/index.ts');

  it('ptá se na stav pro model vektorů a hlásí jen počty, model a to, zda je klíč OpenAI (ne jeho hodnotu)', () => {
    expect(api).toContain("db.rpc('bible_vektory_stav', { p_model: MODEL_VEKTORU })");
    expect(api).toContain("klic: Boolean(Deno.env.get('OPENAI_API_KEY')), model: MODEL_VEKTORU");
    expect(api).not.toMatch(/klic: Deno\.env\.get\('OPENAI_API_KEY'\)/);
  });
});

describe('Správa znalostí: stav hledání podle významu', () => {
  it('vidí ho jen ten, kdo smí spravovat (stejně jako náklady na AI)', () => {
    const sprava = cti('src/components/bible/BibleSprava.tsx');
    expect(sprava).toContain('{smiSpravovat(role) && <NakladyPanel />}');
    expect(sprava).toContain('{smiSpravovat(role) && <BibleVektoryStav />}');
  });
});

describe('deploy.yml: klíč OpenAI pro funkce bible', () => {
  const deploy = cti('.github/workflows/deploy.yml');
  const cteni = krok(deploy, 'Klíč OpenAI pro hledání podle významu');
  const funkce = krok(deploy, 'Edge funkce projektu bible');

  it('čte jen řádek OPENAI_API_KEY z app_secrets hlavní appky, hned ho zamaskuje a uloží do souboru jen pro vlastníka', () => {
    expect(cteni).toContain('app_secrets?select=value&key=eq.OPENAI_API_KEY');
    expect(cteni).toContain('echo "::add-mask::$klic"');
    expect(cteni).toContain(`umask 077; printf '%s' "$klic" > "$RUNNER_TEMP/openai-klic"`);
    expect(cteni).toContain('if: always()');
  });

  it('hodnotu klíče nikam nevypisuje — jen maska a soubor', () => {
    const vypisy = cteni.split('\n').filter((r) => /\b(echo|printf)\b/.test(r) && r.includes('$klic')).map((r) => r.trim());
    expect(vypisy).toEqual([
      'echo "::add-mask::$klic"',
      `( umask 077; printf '%s' "$klic" > "$RUNNER_TEMP/openai-klic" )`,
    ]);
    expect(cteni).not.toContain('GITHUB_STEP_SUMMARY" <<');
    expect(cteni.split('\n').filter((r) => r.includes('GITHUB_STEP_SUMMARY')).every((r) => !r.includes('$klic'))).toBe(true);
  });

  it('krok bible klíč přidá do secrets funkcí a soubor s klíčem smaže i při předčasném konci', () => {
    expect(funkce).toContain(`printf 'OPENAI_API_KEY=%s\\n' "$(cat "$RUNNER_TEMP/openai-klic")" >> "$RUNNER_TEMP/bible.env"`);
    expect(funkce).toMatch(/if \[ -s "\$RUNNER_TEMP\/openai-klic" \]; then\n\s+\( umask 077; printf 'OPENAI_API_KEY=/); // jen když je klíč přečtený
    expect(funkce).toContain('rm -f "$RUNNER_TEMP/claude-klic" "$RUNNER_TEMP/openai-klic"'); // bez tokenu bible
    expect(funkce).toContain('\n          rm -f "$RUNNER_TEMP/openai-klic"\n'); // po zapsání do env souboru
  });

  it('klíč se čte dřív, než se nastavují secrets funkcí bible', () => {
    expect(deploy.indexOf('- name: Klíč OpenAI pro hledání podle významu')).toBeLessThan(deploy.indexOf('- name: Edge funkce projektu bible'));
  });

  it('secret se jmenuje OPENAI_API_KEY — pod tímhle jménem ho čtou funkce i skript', () => {
    expect(funkce).toContain("OPENAI_API_KEY=%s");
    for (const f of ['bible-chat', 'bible-mcp', 'bible-api']) {
      expect(cti(`bible/supabase/functions/${f}/index.ts`)).toContain("Deno.env.get('OPENAI_API_KEY')");
    }
  });
});

describe('bible-zpracovani.yml: vektory pasáží', () => {
  const w = cti('.github/workflows/bible-zpracovani.yml');
  const fronta = krok(w, 'Čeká něco?');
  const klic = krok(w, 'Klíč OpenAI');
  const zpracovat = krok(w, 'Zpracovat knihy');

  it('kontrola migrací běží na obrazu s pgvector (migrace zapíná rozšíření vector)', () => {
    expect(w).toContain('image: pgvector/pgvector:pg16');
    expect(w).not.toContain('image: postgres:16');
  });

  it('fronta: vektory čekají jen s klíčem OpenAI v app_secrets a po migraci; z klíče se čte jen existence řádku', () => {
    expect(fronta).toContain('vektory_cekaji()');
    expect(fronta).toContain('app_secrets?select=key&key=eq.OPENAI_API_KEY');
    expect(fronta).not.toContain('select=value');
    expect(fronta).toContain(`"p_model": "${MODEL_VEKTORU}"`);
    expect(fronta).toContain('bible_vektory_chybi');
    expect(fronta).toMatch(/elif vektory_cekaji; then\n\s+echo "prace=ano" >> "\$GITHUB_OUTPUT"/);
  });

  it('fronta: soubor s odpovědí o vektorech se po kontrole smaže', () => {
    expect(fronta).toContain('rm -f prehledy.json oblasti.json kapitoly.json dodatky.json vektory.json');
  });

  it('krok „Klíč OpenAI“: běží jen když je co zpracovat, klíč maskuje a předá workeru přes prostředí', () => {
    expect(klic).toContain("if: steps.fronta.outputs.prace == 'ano'");
    expect(klic).toContain('app_secrets?select=value&key=eq.OPENAI_API_KEY');
    expect(klic).toContain('echo "::add-mask::$klic"');
    expect(klic).toContain('echo "OPENAI_API_KEY=$klic" >> "$GITHUB_ENV"');
    // maska předchází zápisu do prostředí
    expect(klic.indexOf('::add-mask::')).toBeLessThan(klic.indexOf('>> "$GITHUB_ENV"'));
    const vypisy = klic.split('\n').filter((r) => /\becho\b/.test(r) && r.includes('$klic')).map((r) => r.trim());
    expect(vypisy).toEqual(['echo "::add-mask::$klic"', 'echo "OPENAI_API_KEY=$klic" >> "$GITHUB_ENV"']);
  });

  it('klíč se čte dřív, než worker začne (a worker nedostane klíč service role hlavní appky)', () => {
    expect(w.indexOf('- name: Klíč OpenAI')).toBeLessThan(w.indexOf('- name: Zpracovat knihy'));
    // (BIBLE_SUPABASE_SERVICE_ROLE_KEY je klíč projektu bible — ten worker má mít; hlavní appky ne)
    expect(zpracovat).not.toMatch(/HLAVNI_KLIC|secrets\.SUPABASE_SERVICE_ROLE_KEY|secrets\.VITE_SUPABASE_URL|OPENAI_API_KEY/);
    expect(zpracovat).toContain('BIBLE_KLIC: ${{ secrets.BIBLE_SUPABASE_SERVICE_ROLE_KEY }}');
  });
});
