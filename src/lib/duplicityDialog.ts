// 🔁 Dialogy „tohle už nejspíš existuje" — zdvojená objednávka a zdvojený řádek.
// ---------------------------------------------------------------------------
// Co se shoduje a proč na tom záleží, říká lib/duplicityObjednavek.ts. Tady je
// jen otázka člověku. Výchozí odpověď je VŽDY „nezakládat": dialog zavřený
// klepnutím vedle (nebo bez namontovaného hostitele dialogů) nic nezaloží.
// Zdvojit objednávku musí člověk výslovně — druhá objednávka s týmiž položkami
// odečte sklad podruhé.
import { volba } from './toast';
import { formatPackageLabel } from './supabase';
import {
  textDuplicity, textZdvojenychRadku,
  type Nazvy, type Shoda, type ZdvojenyRadek,
} from './duplicityObjednavek';

/** Názvy piv a obalů z katalogu pro texty dialogů. */
export function nazvyZKatalogu(
  piva: { id: string; name: string }[],
  obaly: { id: string; label: string | null }[],
): Nazvy {
  // Prázdný název by v textu nechal v řádku díru („Světlá  ×1") — raději obecné slovo.
  const pivo = new Map(piva.map((b) => [b.id, (b.name || '').trim() || 'pivo']));
  const obal = new Map(obaly.map((p) => [p.id, formatPackageLabel(p.label).trim() || 'obal']));
  return {
    pivo: (id) => (id ? pivo.get(id) : undefined) ?? 'pivo',
    obal: (id) => (id ? obal.get(id) : undefined) ?? 'obal',
  };
}

export type OdpovedDuplicity = 'presto' | 'zrusit' | 'ignorovat';

/**
 * Otázka u nové objednávky, která se podobá uložené. `ignorovat` se nabízí jen
 * u zprávy z WhatsAppu (zpráva se označí jako vyřízená, ať nevisí mezi
 * nevyřízenými).
 */
export async function zeptejSeNaDuplicitu(
  shody: Shoda[],
  nazvy: Nazvy,
  { ignorovat = false }: { ignorovat?: boolean } = {},
): Promise<OdpovedDuplicity> {
  const co = await volba(
    textDuplicity(shody, nazvy),
    [
      { klic: 'zrusit', label: 'Nezakládat', ton: 'hlavni' },
      ...(ignorovat ? [{ klic: 'ignorovat', label: 'Ignorovat zprávu', ton: 'nebezpecne' as const }] : []),
      { klic: 'presto', label: 'Přesto vytvořit', ton: 'nebezpecne' },
    ],
    { titulek: 'Tahle objednávka už nejspíš existuje', zrusit: 'Zpět' },
  );
  return co === 'presto' || co === 'ignorovat' ? co : 'zrusit';
}

export type OdpovedRadku = 'pridat' | 'preskocit' | 'zrusit';

/**
 * Otázka u řádků přidávaných do už uložené objednávky, které v ní jsou.
 * `preskocit` se nabízí tam, kde se přidává víc řádků naráz (fotka) — zbylé
 * řádky se přidají a ty zdvojené ne.
 */
export async function zeptejSeNaZdvojeneRadky(
  z: ZdvojenyRadek[],
  nazvy: Nazvy,
  { preskocit = false }: { preskocit?: boolean } = {},
): Promise<OdpovedRadku> {
  const co = await volba(
    textZdvojenychRadku(z, nazvy),
    [
      { klic: 'zrusit', label: preskocit ? 'Nic nepřidávat' : 'Nepřidávat', ton: 'hlavni' },
      ...(preskocit ? [{ klic: 'preskocit', label: 'Přidat jen ostatní řádky', ton: 'vedlejsi' as const }] : []),
      { klic: 'pridat', label: preskocit ? 'Přidat i zdvojené' : 'Přidat i tak', ton: 'nebezpecne' },
    ],
    { titulek: 'Tenhle řádek už v objednávce je', zrusit: 'Zpět' },
  );
  return co === 'pridat' || co === 'preskocit' ? co : 'zrusit';
}
