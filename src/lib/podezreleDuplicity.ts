// 🔍 Podezřelé duplicity odběratelů — jen NÁVRH pro ruční kontrolu.
//
// Audit 16.–17. 9. 2026 našel katalog plný skoro-stejných jmen (Malenovice /
// Malenovoce, Zizkov / Ma Zizkov) i párů se stejnou adresou pod jiným jménem
// (Mathovi, Černošice / Maťha). Automatické sloučení je ale nebezpečné —
// stejný audit navrhl sloučit "petr" a "Petr moravcik prodejna" podle jména
// a chybějící adresy, a byli to dva různí lidé. Tahle funkce proto jen
// VYPÍŠE kandidáty (jméno se skoro shoduje, nebo se přesně shoduje adresa) —
// rozhodnutí sloučit/nechat dělá vždycky člověk v PlacesScreen.
import { placesMatch } from './orderParser';

export interface MistoKandidat {
  id: string;
  name: string;
  address?: string | null;
}

export interface KandidatDuplicity {
  a: MistoKandidat;
  b: MistoKandidat;
  duvod: 'jmeno' | 'adresa';
}

export function najdiPodezreleDuplicity(mista: MistoKandidat[]): KandidatDuplicity[] {
  const out: KandidatDuplicity[] = [];
  for (let i = 0; i < mista.length; i++) {
    for (let j = i + 1; j < mista.length; j++) {
      const a = mista[i];
      const b = mista[j];
      if (placesMatch(a.name, b.name)) {
        out.push({ a, b, duvod: 'jmeno' });
        continue;
      }
      const adrA = (a.address || '').trim().toLowerCase();
      const adrB = (b.address || '').trim().toLowerCase();
      if (adrA && adrB && adrA === adrB) {
        out.push({ a, b, duvod: 'adresa' });
      }
    }
  }
  return out;
}
