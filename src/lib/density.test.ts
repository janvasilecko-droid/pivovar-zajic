import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDensity, setDensity, initDensity, DENSITY_OPTIONS, type DensityMode } from '../lib/density'

describe('Density Utilities', () => {
  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
      removeItem: vi.fn(),
      key: vi.fn(),
      length: 0
    }
    
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
    
    // Mock document.documentElement
    Object.defineProperty(document, 'documentElement', {
      value: {
        classList: {
          remove: vi.fn(),
          add: vi.fn()
        }
      },
      writable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('DENSITY_OPTIONS', () => {
    it('should have correct density options', () => {
      expect(DENSITY_OPTIONS).toHaveLength(5)
      
      const expectedOptions = [
        { value: 'xs', label: 'XS', desc: 'Velmi husté' },
        { value: 'compact', label: 'S', desc: 'Husté' },
        { value: 'normal', label: 'M', desc: 'Výchozí' },
        { value: 'large', label: 'L', desc: 'Větší' },
        { value: 'xl', label: 'XL', desc: 'Velmi velké' }
      ]
      
      expect(DENSITY_OPTIONS).toEqual(expectedOptions)
    })
  })

  describe('getDensity', () => {
    it('should return normal when localStorage is empty', () => {
      window.localStorage.getItem.mockReturnValue(null)
      const result = getDensity()
      expect(result).toBe('normal')
    })

    it('should return saved density when valid', () => {
      const testValues: DensityMode[] = ['xs', 'compact', 'normal', 'large', 'xl']
      
      testValues.forEach(testValue => {
        window.localStorage.getItem.mockReturnValue(testValue)
        const result = getDensity()
        expect(result).toBe(testValue)
      })
    })

    it('should return normal when localStorage has invalid value', () => {
      window.localStorage.getItem.mockReturnValue('invalid')
      const result = getDensity()
      expect(result).toBe('normal')
    })

    it('should return normal when window is undefined (server-side)', () => {
      // Temporarily set window to undefined
      const originalWindow = global.window
      delete (global as any).window
      
      const result = getDensity()
      expect(result).toBe('normal')
      
      // Restore window
      global.window = originalWindow
    })
  })

  describe('setDensity', () => {
    it('should set density in localStorage', () => {
      setDensity('compact')
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'minipivovar_density',
        'compact'
      )
    })

    it('should update document classes', () => {
      setDensity('large')
      
      // Check that all density classes were removed
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
        'density-xs',
        'density-compact',
        'density-normal',
        'density-large',
        'density-xl'
      )
      
      // Check that new density class was added
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('density-large')
    })

    it('should not crash when window is undefined (server-side)', () => {
      // Temporarily set window to undefined
      const originalWindow = global.window
      delete (global as any).window
      
      // This should not throw
      expect(() => setDensity('normal')).not.toThrow()
      
      // Restore window
      global.window = originalWindow
    })
  })

  describe('initDensity', () => {
    it('should initialize density from localStorage', () => {
      window.localStorage.getItem.mockReturnValue('xl')

      initDensity()

      // setDensity(…) applies the density class to <html>
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('density-xl')
    })

    it('should use normal as default when localStorage is empty', () => {
      window.localStorage.getItem.mockReturnValue(null)

      initDensity()

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('density-normal')
    })
  })
})