# Dočasně skryté části aplikace

Zadání 13. 10. 2026: „pojďme tu aplikaci ostrouhat — zatím odstraň, ale ulož,
budeme je později nasazovat." Kód zůstal celý. Skrytí se vypíná na jednom místě:
`src/lib/skryteModuly.ts`.

| Příznak | Co skrývá | Návrat |
|---|---|---|
| `SANITACE_ZAPNUTA` | dlaždice Sanitace, sanitační deníky (lahve, kegy, výčepy, tanky), HACCP | přepnout na `true` |
| `CHECKLISTY_ZAPNUTE` | check-listy a úkoly před/po stáčením (KEG, Lahve, plocha); brána „před uložením stáčení vyplň checklist" se nehlídá | přepnout na `true` |
| `SKLO_PROMO_ZAPNUTO` | Sklo, Etikety, Podtáčky (dlaždice, záložka ve Skladu) | přepnout na `true` |
| `KALENDAR_ZAPNUT` | Kalendář & Upozornění (dlaždice, stránka) | přepnout na `true` |
| `TYDENNI_INVENTURA_DO_SKLADU` | týdenní počítání jako základ skladu (stav v pondělí = inventura) | přepnout na `true` |
| `CO2_ZAPNUTO` | Foukání CO2 (dlaždice i kulaté tlačítko nahoře) | přepnout na `true` |

Dlaždice „Nová obj." není na ploše ani v nabídce dlaždic (`DLAZDICE_JEN_V_OBJEDNAVKACH`),
zůstává jako záložka uvnitř Objednávek a ve spodní liště.

„Audit" se přejmenoval na **Systém** (v menu, nadpisu i nápovědách; interní id stránky zůstává `audit`).

Skryté stránky se přesměrují na Domů (`App.tsx`), nenabízejí se na ploše ani ve vyhledávání.
Data v databázi se nemění.
