import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CropPreview } from '../components/CropPreview'

// Mock HTMLCanvasElement methods
global.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  imageSmoothingQuality: 'high'
}))

// Mock Image constructor — capture the instance the component creates,
// so tests can fire onload/onerror on the real instance used by the component.
let lastImage: { onload: () => void; onerror: () => void; src: string; naturalWidth: number; naturalHeight: number } | null = null
global.Image = vi.fn().mockImplementation(() => {
  lastImage = {
    onload: vi.fn(),
    onerror: vi.fn(),
    src: '',
    naturalWidth: 800,
    naturalHeight: 600
  }
  return lastImage
})

describe('CropPreview Component', () => {
  it('should render canvas element', () => {
    render(<CropPreview src="test-image.jpg" />)
    
    const canvas = screen.getByRole('img', { hidden: true })
    expect(canvas).toBeInTheDocument()
    expect(canvas.tagName).toBe('CANVAS')
  })

  it('should apply className prop', () => {
    render(<CropPreview src="test-image.jpg" className="custom-class" />)
    
    const canvas = screen.getByRole('img', { hidden: true })
    expect(canvas).toHaveClass('custom-class')
  })

  it('should apply maxHeight style', () => {
    const maxHeight = 120
    render(<CropPreview src="test-image.jpg" maxHeight={maxHeight} />)
    
    const canvas = screen.getByRole('img', { hidden: true })
    expect(canvas).toHaveStyle(`max-height: ${maxHeight}px`)
    expect(canvas).toHaveStyle(`height: ${maxHeight}px`)
  })

  it('should have cursor style when onClick is provided', () => {
    const onClick = vi.fn()
    render(<CropPreview src="test-image.jpg" onClick={onClick} />)
    
    const canvas = screen.getByRole('img', { hidden: true })
    expect(canvas).toHaveStyle('cursor: zoom-in')
  })

  it('should not have cursor style when onClick is not provided', () => {
    render(<CropPreview src="test-image.jpg" />)
    
    const canvas = screen.getByRole('img', { hidden: true })
    expect(canvas).not.toHaveStyle('cursor: zoom-in')
  })

  describe('Image loading', () => {
    it('should handle image load success', () => {
      const mockImage = new Image() as any
      render(<CropPreview src="test-image.jpg" />)
      
      // Simulate image load
      mockImage.onload()
      
      const canvas = screen.getByRole('img', { hidden: true })
      expect(canvas).toBeInTheDocument()
    })

    it('should handle image load error', () => {
      const { container } = render(<CropPreview src="invalid-image.jpg" />)

      // Simulate image error on the instance the component actually created
      act(() => {
        lastImage!.onerror()
      })

      // Component should return null when failed
      expect(container.firstChild).toBeNull()
    })
  })

  describe('Bounding box cropping', () => {
    const mockBbox = {
      x0: 10,
      y0: 20,
      x1: 90,
      y1: 80
    }

    it('should use bbox when provided', () => {
      const mockImage = new Image() as any
      render(<CropPreview src="test-image.jpg" bbox={mockBbox} />)
      
      const canvas = screen.getByRole('img', { hidden: true })
      expect(canvas).toBeInTheDocument()
    })

    it('should handle bbox with padding', () => {
      const mockImage = new Image() as any
      render(<CropPreview src="test-image.jpg" bbox={mockBbox} paddingPct={10} />)
      
      const canvas = screen.getByRole('img', { hidden: true })
      expect(canvas).toBeInTheDocument()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup when component unmounts', () => {
      const mockImage = new Image() as any
      const { unmount } = render(<CropPreview src="test-image.jpg" />)
      
      // Component should handle cleanup
      expect(() => unmount()).not.toThrow()
    })
  })
})