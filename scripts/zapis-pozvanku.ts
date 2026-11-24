// Přepíše public/pozvanka.html z lib/pozvanka.ts (htmlCitelnePozvanky).
// Spouští se `npm run pozvanka` po každé změně textu pozvánky — test v lib/pozvanka.test.ts
// hlídá, že soubor odpovídá tomu, co by se vygenerovalo.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { htmlCitelnePozvanky } from '../src/lib/pozvanka';

const cil = fileURLToPath(new URL('../public/pozvanka.html', import.meta.url));
writeFileSync(cil, htmlCitelnePozvanky(), 'utf-8');
console.log(`Zapsáno: ${cil}`);
