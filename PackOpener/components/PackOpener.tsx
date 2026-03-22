import React, { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PackSelector from './PackSelector'
import packs from '../data/packs.json'
import { simulatePack, type Card } from '../lib/simulator'
import { addShowcasePulls } from '../lib/showcase'
import CardZoomModal from './CardZoomModal'

type FocusCard = {
  name: string
  image?: string
  subtitle?: string
}

export default function PackOpener() {
  const [setId, setSetId] = useState('sv10')
  const [packType, setPackType] = useState('standard')
  const [loading, setLoading] = useState(false)
  const [pool, setPool] = useState<Card[]>([])
  const [currentPack, setCurrentPack] = useState<Card[]>([])
  const [revealIndex, setRevealIndex] = useState(0)
  const [openingComplete, setOpeningComplete] = useState(false)
  const [error, setError] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const [focusCard, setFocusCard] = useState<FocusCard | null>(null)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  // auto-load cards when set changes
  useEffect(() => {
    loadPool()
  }, [setId])

  useEffect(() => {
    if (!openingComplete) return
    summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openingComplete])

  async function loadPool() {
    setLoading(true)
    setError('')
    setDataSource('')
    try {
      const res = await fetch(`/api/cards?set=${encodeURIComponent(setId)}`)
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.message || 'Failed to load cards')
        setPool([])
        setDataSource('')
        return
      }
      
      setPool(data.cards || [])
      setDataSource(data.source || '')
      if (data.note) console.log(data.note)
    } catch (e: any) {
      setError('Network error: Unable to reach card API')
      setPool([])
      setDataSource('')
    } finally {
      setLoading(false)
    }
  }

  function openPack() {
    if (!pool || pool.length === 0) {
      setError('No cards loaded. Try changing the set.')
      return
    }
    const def = (packs as any)[packType]
    if (!def) {
      setError('Invalid pack type')
      return
    }
    const pack = simulatePack(def, pool, { setId })
    addShowcasePulls(setId, pack)
    setCurrentPack(pack)
    setRevealIndex(0)
    setOpeningComplete(false)
  }

  function revealNext(direction: 1 | -1 = 1) {
    if (currentPack.length === 0 || openingComplete || isTransitioning) return
    if (revealIndex >= currentPack.length - 1) {
      setOpeningComplete(true)
      return
    }
    setSwipeDirection(direction)
    setIsTransitioning(true)
    setRevealIndex((prev) => prev + 1)
  }

  function onOpeningPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  function onOpeningPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      suppressClickRef.current = true
      revealNext(deltaX < 0 ? 1 : -1)
    }
  }

  const hasActiveOpening = currentPack.length > 0 && !openingComplete
  const visibleCard = hasActiveOpening ? currentPack[revealIndex] : null
  const remainingCards = hasActiveOpening ? currentPack.length - revealIndex - 1 : 0

  return (
    <div className="pack-opener-wrap">
      <PackSelector setId={setId} onSetIdChange={setSetId} packType={packType} onPackTypeChange={setPackType} />

      <div className="action-row">
        <div className="action-buttons">
          <button className="button" onClick={openPack} disabled={loading || pool.length === 0}>
            {loading ? 'Loading...' : 'Open Pack'}
          </button>
          <button className="button button-secondary" onClick={() => revealNext(1)} disabled={!hasActiveOpening || isTransitioning}>
            {hasActiveOpening && revealIndex === currentPack.length - 1 ? 'Finish Pack' : 'Next Card'}
          </button>
        </div>

        <div className="status-panel">
          <div className="status-text">
            {loading
              ? 'Loading cards...'
              : hasActiveOpening
                ? `Card ${revealIndex + 1} of ${currentPack.length} • ${remainingCards} left`
                : openingComplete
                  ? `Pack complete • ${currentPack.length} cards pulled`
                  : pool.length
                    ? `${pool.length} cards ready`
                    : 'No cards loaded'}
            {dataSource && <span className="status-badge">({dataSource})</span>}
          </div>
          {error && <div className="error-text">Error: {error}</div>}
        </div>
      </div>

      {hasActiveOpening && visibleCard && (
        <div className="opening-stage">
          <div className="opening-hint">Swipe left/right or tap card to reveal next</div>

          <div
            className="opening-stack-hitbox"
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              revealNext(1)
            }}
            onPointerDown={onOpeningPointerDown}
            onPointerUp={onOpeningPointerUp}
            onPointerCancel={() => {
              pointerStartRef.current = null
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                revealNext(1)
              }
            }}
            aria-label={`Reveal next card. ${remainingCards} card${remainingCards === 1 ? '' : 's'} left after this.`}
          >
            {Array.from({ length: Math.min(5, remainingCards) }).map((_, idx) => (
              <img
                key={`behind-${idx}`}
                src="/card-back.png"
                alt="hidden card"
                className="opening-back"
                style={{ transform: `translate(${idx * 3}px, ${idx * 2}px)` }}
              />
            ))}

            <AnimatePresence
              initial={false}
              custom={swipeDirection}
              mode="wait"
              onExitComplete={() => setIsTransitioning(false)}
            >
              <motion.div
                key={`${visibleCard.id}-${revealIndex}`}
                custom={swipeDirection}
                variants={{
                  enter: (direction: 1 | -1) => ({ x: direction === 1 ? 150 : -150, opacity: 0.7, scale: 0.98 }),
                  center: { x: 0, opacity: 1, scale: 1 },
                  exit: (direction: 1 | -1) => ({ x: direction === 1 ? -150 : 150, opacity: 0, scale: 0.96 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.26, ease: 'easeOut' }}
                className="opening-current-card"
              >
                {visibleCard.images?.small ? (
                  <>
                    {!loadedImages[visibleCard.id] && <div className="card-status">Loading...</div>}
                    <img
                      src={visibleCard.images.small}
                      alt={visibleCard.name}
                      className="card-art"
                      onLoad={() => setLoadedImages((prev) => ({ ...prev, [visibleCard.id]: true }))}
                      style={{ opacity: loadedImages[visibleCard.id] ? 1 : 0, transition: 'opacity 0.3s ease' }}
                      loading="eager"
                    />
                  </>
                ) : (
                  <div className="card-status">No Image</div>
                )}

                {(visibleCard.isHolo || (visibleCard as any).variants?.holo) && (
                  <>
                    <div className="holo-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                    <div className="holo-sparkle" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                  </>
                )}
                {(visibleCard.isReverse || (visibleCard as any).variants?.reverse) && (
                  <div className="reverse-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                )}
                {(visibleCard.isReverse || (visibleCard as any).variants?.reverse) && (
                  <div className="card-badge card-badge-right">Reverse</div>
                )}
                {visibleCard.special && <div className="card-badge card-badge-special">{visibleCard.special}</div>}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="opening-card-info">
            <div className="card-name">{visibleCard.name}</div>
            <div className="card-meta">
              {visibleCard.rarity || 'Common'}
              {visibleCard.isReverse ? ' • Reverse' : ''}
              {visibleCard.isHolo ? ' • Holo' : ''}
              {visibleCard.special ? ` • ${visibleCard.special}` : ''}
            </div>
          </div>
        </div>
      )}

      {openingComplete && currentPack.length > 0 && (
        <div className="opened-cards-wrap" ref={summaryRef}>
          <div className="summary-heading">
            <h3>Pack Summary</h3>
            <p>{currentPack.length} cards pulled. Tap any card to zoom.</p>
          </div>

          <div className="opened-grid">
            {currentPack.map((c, i) => (
              <motion.div
                key={`${c.id}-${i}`}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card-shell clickable-card"
                onClick={() =>
                  setFocusCard({
                    name: c.name,
                    image: c.images?.large || c.images?.small,
                    subtitle: `${c.rarity || 'Common'}${c.isReverse ? ' • Reverse' : ''}${c.isHolo ? ' • Holo' : ''}${c.special ? ` • ${c.special}` : ''}`,
                  })
                }
              >
                <div className="summary-card-face">
                  {c.images?.small ? (
                    <>
                      {!loadedImages[c.id] && <div className="card-status">Loading...</div>}
                      <img
                        src={c.images.small}
                        alt={c.name}
                        className="card-art"
                        onLoad={() => setLoadedImages((prev) => ({ ...prev, [c.id]: true }))}
                        style={{ opacity: loadedImages[c.id] ? 1 : 0, transition: 'opacity 0.3s ease' }}
                        loading="lazy"
                      />
                    </>
                  ) : (
                    <div className="card-status">No Image</div>
                  )}

                  {(c.isHolo || (c as any).variants?.holo) && (
                    <>
                      <div className="holo-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                      <div className="holo-sparkle" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                    </>
                  )}
                  {(c.isReverse || (c as any).variants?.reverse) && (
                    <div className="reverse-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                  )}
                  {(c.isReverse || (c as any).variants?.reverse) && <div className="card-badge card-badge-right">Reverse</div>}
                  {c.special && <div className="card-badge card-badge-special">{c.special}</div>}
                </div>
                <div className="card-name">{c.name}</div>
                <div className="card-meta">{c.rarity || 'Common'}{c.isReverse ? ' • Reverse' : ''}{c.isHolo ? ' • Holo' : ''}{c.special ? ` • ${c.special}` : ''}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <CardZoomModal
        open={Boolean(focusCard)}
        imageSrc={focusCard?.image}
        title={focusCard?.name || 'Card'}
        subtitle={focusCard?.subtitle}
        onClose={() => setFocusCard(null)}
      />
    </div>
  )
}

