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

// Automatically cleanup after each test
afterEach(() => {
  cleanup()
})

// Extend Vitest's expect with Jest DOM matchers
expect.extend({
  // Add any custom matchers here if needed
})