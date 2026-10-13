// 🙈 Dočasně skryté části aplikace (zatím se nenasazují, později se vrátí).
// ---------------------------------------------------------------------------
// Zadání 13. 10. 2026: „pojďme tu aplikaci ostrouhat — sanitační deníky, check
// listy a Sklo, Etikety, Podtáčky zatím odstraň, ale ulož je, budeme je
// později nasazovat." Kód zůstal celý; tady je jediné místo, kde se to
// vypíná. Pro návrat stačí přepnout příslušný příznak na `true`.
//
//   SANITACE_ZAPNUTA   dlaždice Sanitace, Sanitační deníky (lahve, kegy,
//                      výčepy, tanky), HACCP
//   CHECKLISTY_ZAPNUTE Check-listy a úkoly před/po stáčením (KEG i Lahve,
//                      plocha) — včetně brány „před uložením stáčení vyplň
//                      checklist"
//   SKLO_PROMO_ZAPNUTO Sklo, Etikety, Podtáčky
//   CO2_ZAPNUTO        Foukání CO2 (dlaždice i kulaté tlačítko nahoře)
//
// Dlaždice „Nová obj." je jen záložka uvnitř Objednávek (+ spodní lišta),
// ne dlaždice na ploše — viz DLAZDICE_JEN_V_OBJEDNAVKACH.
export const SANITACE_ZAPNUTA = false;
export const CHECKLISTY_ZAPNUTE = false;
export const SKLO_PROMO_ZAPNUTO = false;
/** Foukání CO2: dlaždice na ploše i kulaté tlačítko nahoře (13. 10. 2026). */
export const CO2_ZAPNUTO = false;

const SANITACE = ['haccp', 'sanitation_log', 'sanitace_lahve', 'sanitace_kegy', 'sanitace_vycepy'];

/** Stránky, které se zatím nikde nenabízejí (plocha, hledání) a nejdou otevřít. */
export function skryteStranky(): string[] {
  return [
    ...(SANITACE_ZAPNUTA ? [] : SANITACE),
    ...(CHECKLISTY_ZAPNUTE ? [] : ['checklists']),
    ...(SKLO_PROMO_ZAPNUTO ? [] : ['sklo_promo']),
  ];
}

export const jeStrankaSkryta = (id: string): boolean => skryteStranky().includes(id);

/** Dlaždice, které na ploše nejsou, ale zůstávají jako záložka jiné obrazovky. */
export const DLAZDICE_JEN_V_OBJEDNAVKACH: string[] = ['orders_entry'];

/** Smí se dlaždice ukázat na ploše / v nabídce dlaždic a ve vyhledávání? */
export const smiBytDlazdici = (id: string): boolean => !jeStrankaSkryta(id) && !DLAZDICE_JEN_V_OBJEDNAVKACH.includes(id);
