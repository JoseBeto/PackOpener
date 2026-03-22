import React, { useState, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'framer-motion'
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

type OpeningView = 'select' | 'sleeve' | 'opening' | 'summary'

type HighlightTone = 'base' | 'holo' | 'ultra' | 'secret'

function getCardRank(card?: Card | null) {
  if (!card) return 0
  const rarity = (card.rarity || '').toLowerCase()
  const special = (card.special || '').toLowerCase()

  if (special.includes('godpack')) return 100
  if (special.includes('secret') || rarity.includes('hyper') || rarity.includes('secret')) return 95
  if (special.includes('specialillustration') || rarity.includes('special illustration')) return 90
  if (special.includes('illustration') || rarity.includes('illustration')) return 82
  if (special.includes('doublerare') || rarity.includes('double rare')) return 74
  if (rarity.includes('ultra')) return 68
  if (card.isReverse) return 46
  if (card.isHolo || rarity.includes('holo')) return 40
  if (rarity.includes('rare')) return 30
  if (rarity.includes('uncommon')) return 18
  return 10
}

function getHighlight(card?: Card | null): { label: string | null; tone: HighlightTone } {
  const rank = getCardRank(card)
  if (!card || rank < 40) return { label: null, tone: 'base' }
  if (rank >= 95) return { label: 'Secret Hit', tone: 'secret' }
  if (rank >= 82) return { label: 'Major Pull', tone: 'secret' }
  if (rank >= 68) return { label: 'Ultra Rare', tone: 'ultra' }
  if (rank >= 46) return { label: 'Shiny Pull', tone: 'holo' }
  return { label: 'Holo Hit', tone: 'holo' }
}

export default function PackOpener() {
  const [setId, setSetId] = useState('sv10')
  const [packType, setPackType] = useState('standard')
  const [loading, setLoading] = useState(false)
  const [pool, setPool] = useState<Card[]>([])
  const [setNames, setSetNames] = useState<Record<string, string>>({})
  const [currentPack, setCurrentPack] = useState<Card[]>([])
  const [revealIndex, setRevealIndex] = useState(0)
  const [view, setView] = useState<OpeningView>('select')
  const [error, setError] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const [focusCard, setFocusCard] = useState<FocusCard | null>(null)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isSleeveOpening, setIsSleeveOpening] = useState(false)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const sleeveTimeoutRef = useRef<number | null>(null)
  const dragX = useMotionValue(0)
  const dragRotate = useTransform(dragX, [-180, 0, 180], [-10, 0, 10])
  const dragGlow = useTransform(dragX, [-180, 0, 180], [0.35, 1, 0.35])

  // Sleeve parallax tilt
  const sleeveMxRaw = useMotionValue(0)
  const sleeveMxRawY = useMotionValue(0)
  const sleeveMx = useSpring(sleeveMxRaw, { stiffness: 160, damping: 22 })
  const sleeveMy = useSpring(sleeveMxRawY, { stiffness: 160, damping: 22 })
  const sleeveRotX = useTransform(sleeveMy, [-0.5, 0.5], [16, -16])
  const sleeveRotY = useTransform(sleeveMx, [-0.5, 0.5], [-12, 12])

  const hasActiveOpening = view === 'opening' && currentPack.length > 0
  const visibleCard = hasActiveOpening ? currentPack[revealIndex] : null
  const remainingCards = hasActiveOpening ? currentPack.length - revealIndex - 1 : 0
  const packTypeLabel = packType === 'premium' ? 'Premium Pack' : 'Standard Pack'
  const setDisplayName = setNames[setId] || setId.toUpperCase()
  const currentHighlight = getHighlight(visibleCard)
  const bestPull = useMemo(() => {
    if (currentPack.length === 0) return null
    return [...currentPack].sort((a, b) => getCardRank(b) - getCardRank(a))[0]
  }, [currentPack])
  const bestPullHighlight = getHighlight(bestPull)

  // Fan-spread variants for summary grid cards
  const fanVariants = {
    hidden: (i: number) => ({
      opacity: 0,
      scale: 0.72,
      rotate: (i - 2.5) * 14,
      x: (i - 2.5) * 18,
      y: 56,
    }),
    visible: (i: number) => ({
      opacity: 1,
      scale: 1,
      rotate: 0,
      x: 0,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 24,
        delay: 0.12 + i * 0.07,
      },
    }),
  }

  // auto-load cards when set changes
  useEffect(() => {
    loadPool()
  }, [setId])

  useEffect(() => {
    let mounted = true

    async function loadSetNames() {
      try {
        const res = await fetch('/api/sets')
        const data = await res.json()
        if (!mounted || !Array.isArray(data.sets)) return

        const mapped = data.sets.reduce((acc: Record<string, string>, item: { id: string; name: string }) => {
          acc[item.id] = item.name
          return acc
        }, {})

        setSetNames(mapped)
      } catch {
        if (mounted) setSetNames({})
      }
    }

    loadSetNames()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (view !== 'summary') return
    summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [view])

  useEffect(() => {
    if (!hasActiveOpening) return

    const previousOverflowY = document.body.style.overflowY
    const previousOverscroll = document.body.style.overscrollBehaviorY
    document.body.style.overflowY = 'hidden'
    document.body.style.overscrollBehaviorY = 'contain'

    return () => {
      document.body.style.overflowY = previousOverflowY
      document.body.style.overscrollBehaviorY = previousOverscroll
    }
  }, [hasActiveOpening])

  useEffect(() => {
    return () => {
      if (sleeveTimeoutRef.current) {
        window.clearTimeout(sleeveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    dragX.set(0)
  }, [dragX, revealIndex, view])

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

  function resetFlow(nextView: OpeningView = 'select') {
    if (sleeveTimeoutRef.current) {
      window.clearTimeout(sleeveTimeoutRef.current)
      sleeveTimeoutRef.current = null
    }
    setCurrentPack([])
    setRevealIndex(0)
    setView(nextView)
    setIsSleeveOpening(false)
    setIsTransitioning(false)
    setSwipeDirection(1)
  }

  function buildPack() {
    if (!pool || pool.length === 0) {
      setError('No cards loaded. Try changing the set.')
      return null
    }
    const def = (packs as any)[packType]
    if (!def) {
      setError('Invalid pack type')
      return null
    }

    const pack = simulatePack(def, pool, { setId })
    addShowcasePulls(setId, pack)
    return pack
  }

  function preparePack() {
    const pack = buildPack()
    if (!pack) return

    setCurrentPack(pack)
    setRevealIndex(0)
    setView('sleeve')
    setIsSleeveOpening(false)
    setIsTransitioning(false)
    setSwipeDirection(1)
  }

  function revealNext(direction: 1 | -1 = 1) {
    if (view !== 'opening' || currentPack.length === 0 || isTransitioning) return
    if (revealIndex >= currentPack.length - 1) {
      setView('summary')
      return
    }
    setSwipeDirection(direction)
    setIsTransitioning(true)
    setRevealIndex((prev) => prev + 1)
  }

  function startSleeveOpen() {
    if (currentPack.length === 0 || isSleeveOpening) return

    setIsSleeveOpening(true)
    sleeveTimeoutRef.current = window.setTimeout(() => {
      setView('opening')
      setIsSleeveOpening(false)
      sleeveTimeoutRef.current = null
    }, 820)
  }

  function onCardDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const absOffsetX = Math.abs(info.offset.x)
    const absVelocityX = Math.abs(info.velocity.x)
    const shouldReveal = absOffsetX > 70 || absVelocityX > 480

    if (shouldReveal) {
      revealNext(info.offset.x < 0 ? 1 : -1)
    } else {
      // Soft spring snap-back when card is released near center
      animate(dragX, 0, { type: 'spring', stiffness: 280, damping: 22, mass: 0.8 })
    }

    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  function handleSetIdChange(value: string) {
    setSetId(value)
    if (view !== 'select') {
      resetFlow('select')
    }
  }

  function handlePackTypeChange(value: string) {
    setPackType(value)
    if (view !== 'select') {
      resetFlow('select')
    }
  }

  return (
    <div className="pack-opener-wrap">
      {view === 'select' && (
        <section className="flow-shell landing-shell premium-stage premium-stage-select">
          <div className="stage-spotlight stage-spotlight-left" />
          <div className="stage-spotlight stage-spotlight-right" />
          <div className="stage-particles" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="landing-copy">
            <span className="landing-eyebrow">Choose your next pack</span>
            <h2 className="landing-title">Pick a set, load the sleeve, and crack it open.</h2>
            <p className="landing-text">
              Start on a clean selection screen, then move into a dedicated opening view with a sleeve animation, card-by-card reveals, and a final summary.
            </p>
          </div>

          <div className="landing-grid">
            <div className="landing-card">
              <PackSelector
                setId={setId}
                onSetIdChange={handleSetIdChange}
                packType={packType}
                onPackTypeChange={handlePackTypeChange}
              />

              <button className="button landing-open-button" onClick={preparePack} disabled={loading || pool.length === 0}>
                {loading ? 'Loading Cards...' : 'Load Pack Sleeve'}
              </button>

              <div className="status-panel">
                <div className="status-text">
                  {loading ? 'Loading cards...' : pool.length ? `${pool.length} cards ready` : 'No cards loaded'}
                  {dataSource && <span className="status-badge">({dataSource})</span>}
                </div>
                {error && <div className="error-text">Error: {error}</div>}
              </div>
            </div>

            <div className="selected-pack-card">
              <div className="selected-pack-topline">Selected pack</div>
              <div className="selected-pack-title">{packTypeLabel}</div>
              <div className="selected-pack-subtitle">{setDisplayName}</div>

              <div className="pack-stat-list">
                <div className="pack-stat"><span>Normals</span><strong>1 Common + 2 Uncommon</strong></div>
                <div className="pack-stat"><span>Hits</span><strong>Reverse + Rare + Bonus</strong></div>
                <div className="pack-stat"><span>Total cards</span><strong>6 per pack</strong></div>
              </div>

              <div className="selected-pack-art" aria-hidden="true">
                <div className="selected-pack-glow" />
                <div className="selected-pack-sleeve">
                  <span>{setDisplayName}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === 'sleeve' && currentPack.length > 0 && (
        <section className="flow-shell sleeve-view-shell premium-stage premium-stage-sleeve">
          <div className="stage-spotlight stage-spotlight-center" />
          <div className="stage-particles" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="flow-header">
            <button className="ghost-button" onClick={() => resetFlow('select')}>
              Choose Another Set
            </button>
            <div className="flow-meta">{packTypeLabel} • {setDisplayName}</div>
          </div>

          <div className="sleeve-stage-wrap">
            <div className="sleeve-copy">
              <span className="landing-eyebrow">Sleeve loaded</span>
              <h3>Open the sleeve to reveal your deck</h3>
              <p>Tap the sleeve and it will peel open before the first card appears.</p>
            </div>

            <motion.button
              type="button"
              className={`sleeve-stage ${isSleeveOpening ? 'is-opening' : ''}`}
              onClick={startSleeveOpen}
              disabled={isSleeveOpening}
              whileHover={{ scale: isSleeveOpening ? 1 : 1.01 }}
              whileTap={{ scale: isSleeveOpening ? 1 : 0.99 }}
              animate={isSleeveOpening ? { rotateZ: [0, -1.2, 1.2, -0.8, 0] } : { rotateZ: 0 }}
              transition={{ duration: 0.52, ease: 'easeInOut' }}
              aria-label="Open pack sleeve"
              onPointerMove={(e) => {
                if (isSleeveOpening) return
                const rect = e.currentTarget.getBoundingClientRect()
                sleeveMxRaw.set(((e.clientX - rect.left) / rect.width - 0.5))
                sleeveMxRawY.set(((e.clientY - rect.top) / rect.height - 0.5))
              }}
              onPointerLeave={() => {
                sleeveMxRaw.set(0)
                sleeveMxRawY.set(0)
              }}
            >
              <motion.div
                className="sleeve-shell"
                animate={isSleeveOpening ? { y: 18 } : { y: 0 }}
                transition={{ duration: 0.48 }}
                style={{ rotateX: sleeveRotX, rotateY: sleeveRotY, transformPerspective: 900 }}
              >
                <div className="sleeve-pocket" aria-hidden="true">
                  <motion.div
                    className="sleeve-deck"
                    animate={isSleeveOpening ? { y: -150, opacity: 1, scale: 1 } : { y: 56, opacity: 0.98, scale: 0.98 }}
                    transition={{ duration: 0.62, delay: isSleeveOpening ? 0.16 : 0, ease: 'easeOut' }}
                  >
                    <img src="/card-back.png" alt="deck" className="deck-back" />
                  </motion.div>
                </div>
                <motion.div className="sleeve-flap" animate={isSleeveOpening ? { rotateX: -135, y: -12 } : { rotateX: 0, y: 0 }} transition={{ duration: 0.45 }} />
                <motion.div className="sleeve-rip" animate={isSleeveOpening ? { scaleX: 1, opacity: 1 } : { scaleX: 0.2, opacity: 0.55 }} transition={{ duration: 0.28, delay: isSleeveOpening ? 0.12 : 0 }} />
                <motion.div className="sleeve-foil-sheen" animate={isSleeveOpening ? { x: ['-120%', '130%'], opacity: [0, 0.85, 0] } : { x: '-120%', opacity: 0 }} transition={{ duration: 0.58, delay: isSleeveOpening ? 0.08 : 0, ease: 'easeOut' }} />
                <motion.div
                  className="sleeve-mouth-cover"
                  animate={isSleeveOpening ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: isSleeveOpening ? 0.14 : 0 }}
                />
                <div className="sleeve-body">
                  <div className="sleeve-brand">{setDisplayName}</div>
                  <div className="sleeve-packtype">{packTypeLabel}</div>
                  <div className="sleeve-hint">Tap to open</div>
                </div>
              </motion.div>
            </motion.button>
          </div>
        </section>
      )}

      {hasActiveOpening && visibleCard && (
        <section className={`flow-shell opening-view-shell premium-stage premium-stage-opening premium-tone-${currentHighlight.tone}`}>
          <div className="stage-spotlight stage-spotlight-center" />
          <div className="stage-particles" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="flow-header">
            <button className="ghost-button" onClick={() => resetFlow('select')}>
              Choose Another Set
            </button>
            <div className="flow-meta">Card {revealIndex + 1} of {currentPack.length} • {remainingCards} left</div>
          </div>

          <div className="opening-stage">
            <div className="opening-hint">Swipe left or right, or tap the card to reveal the next pull</div>
            {currentHighlight.label && (
              <motion.div
                className={`reveal-banner reveal-banner-${currentHighlight.tone}`}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
              >
                {currentHighlight.label}
              </motion.div>
            )}

            <div
              className="opening-stack-hitbox"
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }
                revealNext(1)
              }}
              aria-label={`Reveal next card. ${remainingCards} card${remainingCards === 1 ? '' : 's'} left after this.`}
            >
              {Array.from({ length: Math.min(4, remainingCards) }).map((_, idx) => (
                <img
                  key={`behind-${idx}`}
                  src="/card-back.png"
                  alt="hidden card"
                  className="opening-back"
                  style={{ transform: `translate(${idx * 4}px, ${idx * 3}px)` }}
                />
              ))}

              <AnimatePresence
                initial={false}
                custom={swipeDirection}
                mode="wait"
                onExitComplete={() => {
                  dragX.set(0)
                  setIsTransitioning(false)
                }}
              >
                <motion.div
                  key={`${visibleCard.id}-${revealIndex}`}
                  custom={swipeDirection}
                  variants={{
                    enter: (direction: 1 | -1) => ({ x: direction === 1 ? 180 : -180, opacity: 0.72, scale: 0.98 }),
                    center: { x: 0, opacity: 1, scale: 1 },
                    exit: (direction: 1 | -1) => ({ x: direction === 1 ? -260 : 260, opacity: 0, scale: 0.94, rotate: direction === 1 ? -6 : 6 }),
                  }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.22}
                  dragMomentum={false}
                  dragTransition={{ bounceStiffness: 260, bounceDamping: 20 }}
                  style={{ x: dragX, rotate: dragRotate }}
                  onDragStart={() => {
                    suppressClickRef.current = true
                  }}
                  onDragEnd={onCardDragEnd}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.26, ease: 'easeOut' }}
                  className="opening-current-card"
                >
                  <motion.div className={`card-burst card-burst-${currentHighlight.tone}`} style={{ opacity: dragGlow }} />
                  {visibleCard.images?.small ? (
                    <>
                      {!loadedImages[visibleCard.id] && <div className="card-status">Loading...</div>}
                      <img
                        src={visibleCard.images.small}
                        alt={visibleCard.name}
                        className="card-art"
                        draggable={false}
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
        </section>
      )}

      {view === 'summary' && currentPack.length > 0 && (
        <section className="flow-shell summary-view-shell premium-stage premium-stage-summary" ref={summaryRef}>
          <div className="stage-spotlight stage-spotlight-center" />
          <div className="flow-header">
            <div className="flow-meta">Pack complete • {currentPack.length} cards pulled</div>
          </div>

          <div className="opened-cards-wrap">
            <div className="summary-heading">
              <h3>Pack Summary</h3>
              <p>Review every card from this pack, zoom in on hits, then open another or pick a new set.</p>
            </div>

            {bestPull && (
              <motion.div
                className={`best-pull-spotlight best-pull-${bestPullHighlight.tone}`}
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35 }}
              >
                <div className="best-pull-copy">
                  <span className="landing-eyebrow">Best pull</span>
                  <h4>{bestPull.name}</h4>
                  <p>
                    {bestPull.rarity || 'Common'}
                    {bestPull.isReverse ? ' • Reverse' : ''}
                    {bestPull.isHolo ? ' • Holo' : ''}
                    {bestPull.special ? ` • ${bestPull.special}` : ''}
                  </p>
                </div>
                <div
                  className="best-pull-card clickable-card"
                  onClick={() =>
                    setFocusCard({
                      name: bestPull.name,
                      image: bestPull.images?.large || bestPull.images?.small,
                      subtitle: `${bestPull.rarity || 'Common'}${bestPull.isReverse ? ' • Reverse' : ''}${bestPull.isHolo ? ' • Holo' : ''}${bestPull.special ? ` • ${bestPull.special}` : ''}`,
                    })
                  }
                >
                  <div className="summary-card-face">
                    {bestPull.images?.small ? <img src={bestPull.images.small} alt={bestPull.name} className="card-art" draggable={false} /> : <div className="card-status">No Image</div>}
                  </div>
                </div>
              </motion.div>
            )}

            <div className="summary-actions">
              <button className="button" onClick={preparePack}>Open Another Pack</button>
              <button className="ghost-button" onClick={() => resetFlow('select')}>Select New Set</button>
            </div>

            <div className="opened-grid summary-grid">
              {currentPack.map((c, i) => (
                <motion.div
                  key={`${c.id}-${i}`}
                  custom={i}
                  variants={fanVariants}
                  initial="hidden"
                  animate="visible"
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
                          draggable={false}
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
        </section>
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

