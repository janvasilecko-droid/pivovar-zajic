// Verze aplikace — zvyšuje se při každé provedené úpravě, aby šlo v UI poznat,
// jestli je načtená nejnovější nasazená verze (řeší problémy s cachí prohlížeče/PWA).
export const APP_VERSION = '1.142';
export const APP_VERSION_DATE = '29.7.2026 17:37';

// Stručný přehled změn v aktuální verzi (zobrazuje se v admin sekci Nastavení)
export const APP_CHANGELOG: string[] = [
  '⚡ Rychlá tlačítka nahoře: každý uživatel si může v Nastavení navolit vlastní 4 tlačítka v hlavičce',
  '⚡ Editace objednávky: přidána automatická rezervace výčepu při uložení změn',
];
