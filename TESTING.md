# Testování projektu Minipivovar

Tento projekt nyní obsahuje kompletní testovací infrastrukturu.

## Instalace testovacích závislostí

Pokud ještě nemáte nainstalované testovací závislosti, spusťte:

```bash
pnpm install
```

nebo

```bash
npm install
```

## Dostupné testovací příkazy

V `package.json` jsou definovány následující testovací skripty:

- `pnpm test` - Spustí všechny testy jednou
- `pnpm test:watch` - Spustí testy ve watch módu (automaticky se spustí při změnách)
- `pnpm test:ui` - Spustí Vitest UI pro vizuální kontrolu testů
- `pnpm test:coverage` - Spustí testy a vygeneruje report pokrytí kódu

## Struktura testů

Testy jsou umístěny vedle testovaných souborů s příponou `.test.ts` nebo `.test.tsx`:

- `src/lib/density.test.ts` - Testy pro utility funkce z density.ts
- `src/components/CropPreview.test.tsx` - Testy pro React komponentu CropPreview
- `src/test/setup.ts` - Globální setup pro testy

## Jak přidat nové testy

1. Pro utility funkce vytvořte soubor vedle testovaného souboru s příponou `.test.ts`
2. Pro React komponenty vytvořte soubor s příponou `.test.tsx`
3. Importujte potřebné funkce/komponenty a použijte Vitest API

### Příklad testu pro utility funkci

```typescript
import { describe, it, expect } from 'vitest'
import { mojeFunkce } from './mojeFunkce'

describe('mojeFunkce', () => {
  it('should return correct value', () => {
    expect(mojeFunkce(1, 2)).toBe(3)
  })
})
```

### Příklad testu pro React komponentu

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MojeKomponenta } from './MojeKomponenta'

describe('MojeKomponenta', () => {
  it('should render correctly', () => {
    render(<MojeKomponenta text="Test" />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})
```

## Pokrytí kódu

Pro vygenerování reportu pokrytí kódu:

```bash
pnpm test:coverage
```

Report bude vygenerován v `coverage/` složce. Otevřete `coverage/index.html` v prohlížeči pro vizuální přehled.

## Vytváření testů pro různé typy kódu

### Utility funkce
- Testujte vstupy a výstupy
- Testujte edge cases
- Používejte mocky pro externí závislosti (localStorage, fetch, atd.)

### React komponenty
- Testujte renderování s různými props
- Testujte uživatelské interakce (kliknutí, změny inputů)
- Používejte `@testing-library/react` pro interakce s DOM
- Mockujte externí závislosti a API volání

### Integrační testy
- Testujte interakce mezi komponentami
- Testujte kompletní uživatelské flow

## Konfigurace

Hlavní konfigurační soubory:

- `vitest.config.ts` - Konfigurace Vitest
- `tsconfig.json` - Typy pro testování
- `src/test/setup.ts` - Globální setup pro testy

## Řešení problémů

### Testy neběží
- Zkontrolujte, že máte nainstalované všechny závislosti
- Zkontrolujte, že Node.js je nainstalován
- Zkuste odstranit `node_modules` a spustit `pnpm install` znovu

### Typy nejsou rozpoznány
- Zkontrolujte `tsconfig.json`, že obsahuje `"types": ["vitest/globals", "@testing-library/jest-dom"]`
- Zkuste restartovat VS Code/editor

### Mocky nefungují
- Používejte `vi.fn()` pro vytváření mock funkcí
- Resetujte mocky pomocí `vi.restoreAllMocks()` v `afterEach`

## Příklady hotových testů v projektu

1. **Density utility testy** (`src/lib/density.test.ts`)
   - Testuje ukládání a načítání density preferencí z localStorage
   - Testuje aktualizaci CSS tříd na dokumentu
   - Zahrnuje testy pro server-side rendering

2. **CropPreview component testy** (`src/components/CropPreview.test.tsx`)
   - Testuje renderování canvas elementu
   - Testuje image loading
   - Testuje CSS styly a třídy

## Další kroky

1. Přidejte testy pro další utility funkce v `src/lib/`
2. Přidejte testy pro klíčové komponenty v `src/components/`
3. Přidejte testy pro screens v `src/screens/`
4. Nastavte CI/CD pipeline pro automatické spouštění testů