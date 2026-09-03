# Co se mění

<!-- Jedna věta pro člověka, který tu obrazovku používá, ne pro programátora.
     „Objednávky se načítají od nejstarších" — ne „změněn order by v dotazu". -->

## Proč

<!-- Co se dělo předtím a proč to bylo špatně. Když se to stalo v provozu,
     napiš jak se to poznalo — příště se to hledá podle příznaku, ne podle
     názvu funkce. -->

## Jak je to ověřené

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run`
- [ ] `npm run zkontroluj-tridy`
- [ ] `npm run zkontroluj-kontrast`
- [ ] `npm run zkontroluj-workflow` (jen když se měnil soubor v `.github/workflows/`)
- [ ] `npm run build`

Nové testy jsem ověřil tím, že jsem kód rozbil a testy spadly:

<!-- Test, který projde i nad rozbitým kódem, je horší než žádný — tváří se
     jako pojistka a není. Napiš, co jsi rozbil a který test to chytil. -->

## Čeho se to NEDOTKLO

<!-- Užitečnější než výčet změn. Typicky: „nedotýká se výpočtu skladu",
     „nemění uložené rozložení plochy", „nemění žádnou migraci". -->

## Ruční krok po nasazení

<!-- Migrace, kterou musí někdo pustit, nastavení v Supabase, klíč
     v repozitáři… Když nic není, napiš „žádný". Tohle je řádek, kvůli
     kterému dvě migrace dva dny čekaly. -->

žádný

## Verze

<!-- `src/lib/version.ts` i `public/version.json` musí být zvednuté SPOLU,
     jinak service worker novou verzi nikdy nenabídne a v aplikaci se
     neukáže „Aktualizovat". -->

- [ ] `src/lib/version.ts` a `public/version.json` zvednuté na stejné číslo
- [ ] záznam v `src/lib/changelog.ts` (píše se pro lidi v pivovaru, ne pro vývojáře)
