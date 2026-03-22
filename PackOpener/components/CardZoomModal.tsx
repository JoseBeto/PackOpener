import { useEffect, useState, type WheelEvent } from 'react'

type Props = {
  open: boolean
  imageSrc?: string
  title: string
  subtitle?: string
  onClose: () => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const STEP = 0.2

export default function CardZoomModal({ open, imageSrc, title, subtitle, onClose }: Props) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) setZoom(1)
  }, [open])

  if (!open) return null

  function zoomIn() {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + STEP).toFixed(2))))
  }

  function zoomOut() {
    setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - STEP).toFixed(2))))
  }

  function resetZoom() {
    setZoom(1)
  }

  function onWheelZoom(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    if (event.deltaY < 0) zoomIn()
    else zoomOut()
  }

  return (
    <div className="zoom-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${title} zoomed view`}>
      <div className="zoom-shell" onClick={(event) => event.stopPropagation()}>
        <div className="zoom-head">
          <div>
            <div className="zoom-title">{title}</div>
            {subtitle ? <div className="zoom-subtitle">{subtitle}</div> : null}
          </div>
          <button className="zoom-btn" onClick={onClose} type="button" aria-label="Close zoom view">Close</button>
        </div>

        <div className="zoom-controls">
          <button className="zoom-btn" onClick={zoomOut} type="button" disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
          <button className="zoom-btn" onClick={resetZoom} type="button" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button className="zoom-btn" onClick={zoomIn} type="button" disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
        </div>

        <div className="zoom-view" onWheel={onWheelZoom}>
          {imageSrc ? (
            <img src={imageSrc} alt={title} className="zoom-image" style={{ transform: `scale(${zoom})` }} />
          ) : (
            <div className="zoom-no-image">No image available</div>
          )}
        </div>
      </div>
    </div>
  )
}