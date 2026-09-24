import '@testing-library/jest-dom'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom neimplementuje ResizeObserver (komponenty jako PhotoReviewPane ho
// používají k auto-fit fotky do plochy náhledu) — bez stubu render spadne.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
}

// jsdom taky neimplementuje scrollIntoView — TabBar.tsx (sdílená záložková
// lišta: Objednávky, Kalendář, Odběratelé, Auta…) ho volá na aktivní
// záložce při KAŽDÉM přepnutí, takže bez stubu spadne render jakékoliv
// obrazovky, co TabBar používá.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Automatically cleanup after each test
afterEach(() => {
  cleanup()
})

// Extend Vitest's expect with Jest DOM matchers
expect.extend({
  // Add any custom matchers here if needed
})