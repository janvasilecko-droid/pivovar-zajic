// 🔎 Hledání, které nezáleží na diakritice a velikosti písmen.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „vyhledávání odběratelů ať jde i bez diakritiky."
// Na telefonu se háčky a čárky píšou pomalu, a odběratelé je mají skoro
// všichni (Lužec, Žižkov, U Lípy, Říčany). Ve výběru odběratele a v seznamu
// objednávek to šlo, v Číselnících, v Rozvozu, v týdenním přehledu a ve
// vracení piva ne — „luzec" tam nenašlo nic.
//
// Jedno místo pro pravidlo, ať se hledání zase nerozejde: pole, ve kterém se
// hledá, i to, co člověk napsal, se přepíšou stejně (malá písmena, bez
// diakritiky, jedny mezery) a dotaz se rozdělí na slova — musí sedět všechna,
// v libovolném pořadí („radek sklad" najde „Sklad Radek").

/** Text pro porovnání: malá písmena, bez diakritiky, jednotné mezery. */
export function proHledani(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Odpovídá některé z polí dotazu? Prázdný dotaz odpovídá všemu. Každé slovo
 * z dotazu musí být obsažené v některém z polí (slova se mohou dělit mezi pole:
 * „lužec 12" najde odběratele Lužec s pivem 12° Světlá).
 */
export function shodaHledani(pole: ReadonlyArray<string | null | undefined> | string | null | undefined, dotaz: string | null | undefined): boolean {
  const slova = proHledani(dotaz).split(' ').filter(Boolean);
  if (slova.length === 0) return true;
  const seznam = Array.isArray(pole) ? pole : [pole as string | null | undefined];
  const text = seznam.map(proHledani).join(' ');
  return slova.every((s) => text.includes(s));
}
