import { useEffect } from 'react'

function useVisualViewport(containerRef) {
  useEffect(() => {
    const viewport = window.visualViewport
    const container = containerRef.current
    if (!viewport || !container) return undefined

    function syncViewport() {
      container.style.setProperty('--visual-viewport-height', `${Math.round(viewport.height)}px`)
      container.style.setProperty('--visual-viewport-top', `${Math.round(viewport.offsetTop)}px`)
    }

    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)
    window.addEventListener('orientationchange', syncViewport)
    window.addEventListener('pageshow', syncViewport)

    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
      window.removeEventListener('orientationchange', syncViewport)
      window.removeEventListener('pageshow', syncViewport)
      container.style.removeProperty('--visual-viewport-height')
      container.style.removeProperty('--visual-viewport-top')
    }
  }, [containerRef])
}

export { useVisualViewport }