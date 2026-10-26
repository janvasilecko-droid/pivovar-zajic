// 🏠 Výchozí plocha pro všechny — vzhled a rozložení hlavní plochy správce.
// ---------------------------------------------------------------------------
// Majitel 18. 10. 2026: vzhled pro všechny má být jako tehdejší primární
// plocha správce — úvodní přihlášení tak, jak je momentálně, barvy,
// rozložení, dlaždice podle toho, kdo má jaká práva.
//
// Tohle je snímek `home_layout` správce z toho dne (bez jeho
// osobních odpočtů a poznámek). Dostane ho každý, kdo si plochu ještě
// nepřizpůsobil — nový uživatel i ten, komu se uložila prázdná plocha. Kdo už
// má vlastní rozložení s dlaždicemi, nechává se mu. Které dlaždice se ukážou,
// určují práva uživatele (getHomeLayout je filtruje jako vždy).
//
// Spodní lišta: poslední slot je „Objednávky“ — u správce tam byl omylem druhý „Domů“
// (majitel 19. 10. 2026: „ať tam jsou objednávky a ne 2× menu“).
//
// Dlaždice „Foukání CO2“ ve snímku chybí schválně — je vypnutá (CO2_ZAPNUTO).
//
// Chcete-li výchozí plochu změnit, přepište tenhle snímek (obnovení „Výchozí
// rozložení“ na ploše ho použije taky).

export const VYCHOZI_PLOCHA = {
  "pages": [
    [
      "nakladka",
      "orders_zavoz",
      "cellar",
      "notes",
      "prodejna",
      "bottling_needs",
      "timer",
      "history",
      "orders",
      "kegging",
      "bottling",
      "dashboard",
      "akce",
      "vehicles",
      "export_excel",
      "navod",
      "audit",
      "users",
      "zaloha",
      "inventory",
      "exkurze",
      "vycepy",
      "app_settings",
      "signout",
      "male_sudy",
      "rozbor",
      "concentration",
      "depozitar",
      "obchod"
    ]
  ],
  "overrides": {
    "akce": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 6,
      "color": "#ff0000"
    },
    "audit": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 8,
      "color": "slate"
    },
    "navod": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 8,
      "color": "slate"
    },
    "notes": {
      "h": 2,
      "w": 1,
      "x": 0,
      "y": 3,
      "color": "citrus"
    },
    "timer": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 14,
      "color": "charcoal"
    },
    "users": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 8,
      "color": "slate"
    },
    "cellar": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 2,
      "color": "navy"
    },
    "obchod": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 6,
      "color": "amber2"
    },
    "orders": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 12,
      "color": "lime"
    },
    "rozbor": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 4,
      "color": "emerald"
    },
    "vycepy": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 11,
      "color": "sky"
    },
    "zaloha": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 9,
      "color": "slate"
    },
    "exkurze": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 11,
      "color": "amber2"
    },
    "history": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 2,
      "color": "teal"
    },
    "kegging": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 3,
      "color": "sky"
    },
    "signout": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 12,
      "color": "slate"
    },
    "bottling": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 4,
      "color": "sky"
    },
    "nakladka": {
      "h": 2,
      "w": 3,
      "x": 0,
      "y": 0,
      "color": "#ffe3e3"
    },
    "prodejna": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 3,
      "color": "#ff0000"
    },
    "vehicles": {
      "h": 1,
      "w": 1,
      "x": 1,
      "y": 13,
      "color": "#ffffff"
    },
    "dashboard": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 5,
      "color": "navy"
    },
    "depozitar": {
      "h": 1,
      "w": 1,
      "x": 0,
      "y": 7,
      "color": "forest"
    },
    "inventory": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 7,
      "color": "#000000"
    },
    "male_sudy": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 5,
      "color": "sky"
    },
    "app_settings": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 11,
      "color": "slate"
    },
    "export_excel": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 12,
      "color": "lime"
    },
    "orders_zavoz": {
      "h": 1,
      "w": 1,
      "x": 3,
      "y": 5,
      "color": "#ffffff"
    },
    "concentration": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 6,
      "color": "indigo"
    },
    "bottling_needs": {
      "h": 1,
      "w": 1,
      "x": 6,
      "y": 2,
      "color": "sky"
    }
  },
  "dock": [
    "bottling",
    "dashboard",
    "home",
    "prodejna",
    "kegging",
    "orders"
  ],
  "tileGap": 4,
  "tileOpacity": 0.9,
  "fixedColors": {},
  "rozlozeniVerze": 19
} as const;

/** Je tohle id dlaždice vlastní odpočet (cd_…)? Ty si nese každý sám. */
const jeOdpocet = (id: unknown) => typeof id === 'string' && id.startsWith('cd_');

/**
 * Má uložená plocha nějakou skutečnou dlaždici? Prázdná plocha, `{}`, nebo jen
 * vlastní odpočty (cd_…) znamená „nic si nepřizpůsobil“ — dostane výchozí.
 * (Starý plochý formát `order` se počítá taky.)
 */
export function maVlastniPlochu(raw: unknown): boolean {
  const r = raw as { pages?: unknown; order?: unknown } | null | undefined;
  const ids: unknown[] = [
    ...(Array.isArray(r?.pages) ? (r!.pages as unknown[]).flatMap((p) => (Array.isArray(p) ? p : [])) : []),
    ...(Array.isArray(r?.order) ? (r!.order as unknown[]) : []),
  ];
  return ids.some((id) => !jeOdpocet(id));
}

/** Platná uložená spodní lišta (ne prázdná a ne samé „home“ — to je dřívější poškození). */
function jePouzitelnaLista(dock: unknown): boolean {
  return Array.isArray(dock) && dock.length > 0 && !(dock.length > 1 && dock.every((d) => d === 'home'));
}

/**
 * Uložená plocha, nebo — když žádnou vlastní nemá — výchozí plocha správce.
 * Doplňuje jen to, co uživatel nemá: stránky s dlaždicemi, jejich barvy a
 * velikosti, spodní lištu, průhlednost a mezery. Aby byla plocha u všech
 * STEJNÁ, nepřidávají se jeho dlaždice odpočtů (data odpočtů zůstávají).
 */
export function zakladniRozlozeni(raw: unknown): unknown {
  if (maVlastniPlochu(raw)) return raw;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const vlastniPrepisy = (r.overrides && typeof r.overrides === 'object' ? r.overrides : {}) as Record<string, unknown>;
  return {
    ...r,
    // Vlastní dlaždice odpočtů uživatele se nepřidávají — výchozí plocha je u všech stejná
    // (odpočty samy zůstávají uložené a jdou přidat zpět).
    pages: [[...VYCHOZI_PLOCHA.pages[0]], []],
    overrides: { ...VYCHOZI_PLOCHA.overrides, ...vlastniPrepisy },
    groups: r.groups && typeof r.groups === 'object' ? r.groups : {},
    hidden: Array.isArray(r.hidden) ? r.hidden : [],
    dock: jePouzitelnaLista(r.dock) ? r.dock : [...VYCHOZI_PLOCHA.dock],
    tileGap: typeof r.tileGap === 'number' ? r.tileGap : VYCHOZI_PLOCHA.tileGap,
    tileOpacity: typeof r.tileOpacity === 'number' ? r.tileOpacity : VYCHOZI_PLOCHA.tileOpacity,
    fixedColors: r.fixedColors && typeof r.fixedColors === 'object' && Object.keys(r.fixedColors).length > 0 ? r.fixedColors : { ...VYCHOZI_PLOCHA.fixedColors },
    rozlozeniVerze: VYCHOZI_PLOCHA.rozlozeniVerze,
  };
}

/** Počet dlaždic ve výchozí ploše (pro zjištění, kolik jich uživatel kvůli právům nevidí). */
export const POCET_VYCHOZICH_DLAZDIC = VYCHOZI_PLOCHA.pages[0].length;
