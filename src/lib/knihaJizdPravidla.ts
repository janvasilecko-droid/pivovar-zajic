// 🚐 Pravidla Knihy jízd pro generování z objednávek.
// ---------------------------------------------------------------------------
// Zadání 11. 10. 2026: „kniha jízd ukazuje špatně: Matěs, Petr, restaurace se
// nepočítá do knihy jízd, ostatní má generovat Kynšperk, místa trasy a zase
// Kynšperk, ke každé jízdě do Prahy, Hradce… +30 km."

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Odběratelé, kteří se do Knihy jízd NEpočítají (přesný název, ne podřetězec). */
const MIMO_KNIHU_JIZD = ['mates', 'petr', 'restaurace'];

export function jeMimoKnihuJizd(placeName: string | null | undefined): boolean {
  const n = norm(placeName);
  return !!n && MIMO_KNIHU_JIZD.includes(n);
}

/** Příplatek za jízdu do velkého města v km (městský provoz, hledání zastávky…). */
export const PRIPLATEK_MESTO_KM = 30;

/** Velká města s příplatkem — název s běžnými pády. Rozšíření = přidat řádek. */
const VELKA_MESTA: { mesto: string; vzor: RegExp }[] = [
  { mesto: 'Praha', vzor: /\bpra(ha|hy|ze|hu|hou)\b/ },
  { mesto: 'Hradec Králové', vzor: /\bhrad(ec|ce|ci|cem)\b/ },
  { mesto: 'Pardubice', vzor: /\bpardubic(e|ich|im|emi)\b/ },
  { mesto: 'Plzeň', vzor: /\bplzen\b|\bplzn(i|e|i)\b/ },
  { mesto: 'Brno', vzor: /\bbrn(o|a|e|u|em)\b/ },
  { mesto: 'Ostrava', vzor: /\bostrav(a|y|e|u|ou)\b/ },
  { mesto: 'Liberec', vzor: /\bliber(ec|ce|ci|cem)\b/ },
  { mesto: 'Olomouc', vzor: /\bolomou(c|ce|ci|cem)\b/ },
  { mesto: 'České Budějovice', vzor: /\bcesk(e|ych) budejovic(e|ich)\b/ },
  { mesto: 'Ústí nad Labem', vzor: /\busti nad labem\b/ },
  { mesto: 'Jihlava', vzor: /\bjihlav(a|y|e|u|ou)\b/ },
  { mesto: 'Zlín', vzor: /\bzlin\b|\bzlin(e|u|em)\b/ },
];

/** Město, do kterého zastávka patří (podle adresy, jinak podle názvu), nebo null. */
export function velkeMestoZastavky(nazev: string | null | undefined, adresa: string | null | undefined): string | null {
  for (const text of [norm(adresa), norm(nazev)]) {
    if (!text) continue;
    const m = VELKA_MESTA.find((v) => v.vzor.test(text));
    if (m) return m.mesto;
  }
  return null;
}

export type ZastavkaDne = { name: string; address?: string | null };

/**
 * Příplatek dne: +30 km za KAŽDOU zastávku ve velkém městě (každá zastávka je
 * samostatná jízda tam a zpět z Kynšperka). Vrací km a názvy měst.
 */
export function priplatekDne(zastavky: ZastavkaDne[]): { km: number; mesta: string[] } {
  const mesta: string[] = [];
  for (const z of zastavky) {
    const m = velkeMestoZastavky(z.name, z.address);
    if (m) mesta.push(m);
  }
  return { km: mesta.length * PRIPLATEK_MESTO_KM, mesta: [...new Set(mesta)] };
}
