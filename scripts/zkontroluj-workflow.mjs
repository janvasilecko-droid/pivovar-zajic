#!/usr/bin/env node
/**
 * Kontrola workflow souborů GitHub Actions.
 *
 * PROČ TENHLE SKRIPT EXISTUJE: workflow se dá zkazit tak, že se nespustí
 * VŮBEC. GitHub kontroluje výrazy `${{ }}` už při čtení souboru, a když
 * v nich najde kontext, který na daném místě nesmí být, zahodí celý soubor
 * jako neplatný — běh se objeví červený, bez jediného jobu, a v seznamu se
 * místo jména workflow ukáže cesta k souboru. Nikde nespadne test, nic
 * nekřičí; navenek to vypadá jen tak, že „appka nechce aktualizovat".
 *
 * Přesně to se stalo s `if: secrets.SEND_TOKEN != ''`: `secrets` se v `if`
 * použít nesmí (jen v `env`, `with` a `run`). Soubor byl přitom platné YAML,
 * takže ho ověření YAML pustilo dál — kontrola YAML tuhle chybu nenajde.
 *
 * Skript proto hledá zakázané kontexty ve větvích `if:` a pár dalších
 * překlepů, které mají stejný následek (nespuštěný workflow).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';

/** Kontexty, které se ve `if:` použít nesmí — GitHub tím zneplatní soubor. */
const ZAKAZANE_V_IF = ['secrets', 'steps.env', 'hashFiles'];

function souboryWorkflow() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((j) => /\.ya?ml$/.test(j))
    .map((j) => join(DIR, j));
}

const nalezy = [];

for (const soubor of souboryWorkflow()) {
  const zdroj = readFileSync(soubor, 'utf8');
  const radky = zdroj.split('\n');

  radky.forEach((radek, i) => {
    const cislo = i + 1;

    // `if:` na řádku (klíč, ne text v hodnotě jiného klíče)
    const mIf = radek.match(/^\s*(?:-\s+)?if\s*:\s*(.*)$/);
    if (mIf) {
      const vyraz = mIf[1];
      for (const kontext of ZAKAZANE_V_IF) {
        if (new RegExp(`\\b${kontext.replace('.', '\\.')}\\s*[.[]`).test(vyraz)) {
          nalezy.push(
            `${soubor}:${cislo} → v \`if:\` je \`${kontext}\`, což GitHub nedovolí a CELÝ soubor zahodí `
            + '(nespustí se ani jeden job). Předej hodnotu přes `env:` a ověř ji v shellu.',
          );
        }
      }
    }

    // Jméno workflow musí být — bez něj se v seznamu běhů ukazuje cesta
    // k souboru a nedá se poznat, co spadlo.
    if (cislo === 1 && !/^name\s*:/.test(radek)) {
      nalezy.push(`${soubor}:1 → chybí \`name:\` na začátku souboru.`);
    }

    // Nezavřený výraz — `${{ ... }` GitHub taky zahodí.
    const otevreno = (radek.match(/\$\{\{/g) || []).length;
    const zavreno = (radek.match(/\}\}/g) || []).length;
    if (otevreno !== zavreno) {
      nalezy.push(`${soubor}:${cislo} → nezavřený výraz \`\${{ … }}\`.`);
    }
  });
}

if (nalezy.length > 0) {
  console.error('Workflow: nalezené chyby, které by workflow zneplatnily:\n');
  for (const n of nalezy) console.error(`  ${n}`);
  console.error('');
  process.exit(1);
}

console.log('Workflow: žádný zakázaný kontext ve `if:`, výrazy jsou uzavřené.');
