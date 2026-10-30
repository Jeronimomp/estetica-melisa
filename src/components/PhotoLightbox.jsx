import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

function PhotoLightbox({ photos, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex)
  const touchStartX = useRef(null)
  const photo = photos[index]

  function showPrevious() {
    setIndex((current) => Math.max(0, current - 1))
  }

  function showNext() {
    setIndex((current) => Math.min(photos.length - 1, current + 1))
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1))
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(photos.length - 1, current + 1))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, photos.length])

  if (!photo) return null

  const photoType = String(photo.type ?? '').toLocaleUpperCase('es-MX')

  function handleTouchStart(event) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(event) {
    if (touchStartX.current === null) return
    const distance = event.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (distance < -45) showNext()
    if (distance > 45) showPrevious()
  }

  return (
    <div className="photo-lightbox-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`${photoType} ${photo.service || 'foto'}`}>
        <button className="photo-lightbox__close" type="button" aria-label="Cerrar fotos" onClick={onClose}><X size={21} aria-hidden="true" /></button>
        <img
          className="photo-lightbox__image"
          src={photo.url}
          alt={photo.alt || `Foto ${photoType.toLowerCase()} del servicio ${photo.service || ''}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />
        {photos.length > 1 && (
          <>
            <button className="photo-lightbox__navigation photo-lightbox__navigation--previous" type="button" aria-label="Ver foto anterior" title="Foto anterior" onClick={showPrevious} disabled={index === 0}>
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <button className="photo-lightbox__navigation photo-lightbox__navigation--next" type="button" aria-label="Ver foto siguiente" title="Foto siguiente" onClick={showNext} disabled={index === photos.length - 1}>
              <ChevronRight size={24} aria-hidden="true" />
            </button>
          </>
        )}
        <div className="photo-lightbox__caption" aria-live="polite">
          <strong>{photoType}</strong>
          {photo.service && <span>{photo.service}</span>}
          {photo.date && <span>{photo.date}</span>}
          {photos.length > 1 && <span className="photo-lightbox__count">{index + 1} / {photos.length}</span>}
        </div>
      </section>
    </div>
  )
}

export default PhotoLightbox