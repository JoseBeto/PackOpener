import React, { useState, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'framer-motion'
import PackSelector from './PackSelector'
import packs from '../data/packs.json'
import { simulatePack, type Card } from '../lib/simulator'
import { addShowcasePulls } from '../lib/showcase'
import CardZoomModal from './CardZoomModal'
import { getSfxEngine } from '../lib/sfx'

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
  const [setLogos, setSetLogos] = useState<Record<string, string>>({})
  const [currentPack, setCurrentPack] = useState<Card[]>([])
  const [revealIndex, setRevealIndex] = useState(0)
  const [view, setView] = useState<OpeningView>('select')
  const [error, setError] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const [focusCard, setFocusCard] = useState<FocusCard | null>(null)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isSleeveCharging, setIsSleeveCharging] = useState(false)
  const [isSleeveRipping, setIsSleeveRipping] = useState(false)
  const [isSleeveOpening, setIsSleeveOpening] = useState(false)
  const [isCardFaceUp, setIsCardFaceUp] = useState(false)
  const [isSpotlightMoment, setIsSpotlightMoment] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const sleeveChargeTimeoutRef = useRef<number | null>(null)
  const sleeveRipTimeoutRef = useRef<number | null>(null)
  const sleevePopTimeoutRef = useRef<number | null>(null)
  const sleeveOpenTimeoutRef = useRef<number | null>(null)
  const flipTimeoutRef = useRef<number | null>(null)
  const spotlightTimeoutRef = useRef<number | null>(null)
  const sfxRef = useRef(getSfxEngine())
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
  const setLogo = setLogos[setId] || null
  const currentHighlight = getHighlight(visibleCard)
  const bestPull = useMemo(() => {
    if (currentPack.length === 0) return null
    return [...currentPack].sort((a, b) => getCardRank(b) - getCardRank(a))[0]
  }, [currentPack])
  const bestPullHighlight = getHighlight(bestPull)
  const isBigHitTone = currentHighlight.tone === 'ultra' || currentHighlight.tone === 'secret'
  const shouldCollapseText = isCompactMode && hasInteracted

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

        const logos = data.sets.reduce((acc: Record<string, string>, item: { id: string; logo?: string }) => {
          if (item.logo) acc[item.id] = item.logo
          return acc
        }, {})

        setSetNames(mapped)
        setSetLogos(logos)
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
    sfxRef.current.summary()
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
      if (sleeveChargeTimeoutRef.current) window.clearTimeout(sleeveChargeTimeoutRef.current)
      if (sleeveRipTimeoutRef.current) window.clearTimeout(sleeveRipTimeoutRef.current)
      if (sleevePopTimeoutRef.current) window.clearTimeout(sleevePopTimeoutRef.current)
      if (sleeveOpenTimeoutRef.current) window.clearTimeout(sleeveOpenTimeoutRef.current)
      if (flipTimeoutRef.current) window.clearTimeout(flipTimeoutRef.current)
      if (spotlightTimeoutRef.current) window.clearTimeout(spotlightTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('packopener-sound-muted')
    const muted = saved === '1'
    setIsMuted(muted)
    sfxRef.current.setMuted(muted)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(max-width: 640px), (max-height: 760px)')
    const updateCompactMode = () => setIsCompactMode(mediaQuery.matches)
    updateCompactMode()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateCompactMode)
      return () => mediaQuery.removeEventListener('change', updateCompactMode)
    }

    mediaQuery.addListener(updateCompactMode)
    return () => mediaQuery.removeListener(updateCompactMode)
  }, [])

  useEffect(() => {
    sfxRef.current.setMuted(isMuted)
  }, [isMuted])

  useEffect(() => {
    if (!hasActiveOpening || !visibleCard) return
    if (flipTimeoutRef.current) {
      window.clearTimeout(flipTimeoutRef.current)
      flipTimeoutRef.current = null
    }
    if (spotlightTimeoutRef.current) {
      window.clearTimeout(spotlightTimeoutRef.current)
      spotlightTimeoutRef.current = null
    }

    setIsCardFaceUp(false)
    setIsSpotlightMoment(false)
    flipTimeoutRef.current = window.setTimeout(() => {
      setIsCardFaceUp(true)
      sfxRef.current.flip()
      const highlight = getHighlight(visibleCard)
      if (highlight.label) sfxRef.current.rarity(highlight.tone)

      if (highlight.tone === 'ultra' || highlight.tone === 'secret') {
        setIsSpotlightMoment(true)
        sfxRef.current.whoosh()
        if (!isMuted && typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(highlight.tone === 'secret' ? [22, 46, 22] : [18])
        }
        spotlightTimeoutRef.current = window.setTimeout(() => {
          setIsSpotlightMoment(false)
          spotlightTimeoutRef.current = null
        }, highlight.tone === 'secret' ? 760 : 620)
      }

      flipTimeoutRef.current = null
    }, 210)
  }, [hasActiveOpening, visibleCard, isMuted])

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

  function preloadImage(url?: string) {
    if (!url || typeof window === 'undefined') return Promise.resolve()
    return new Promise<void>((resolve) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      if (image.complete) {
        resolve()
        return
      }
      image.onload = () => resolve()
      image.onerror = () => resolve()
    })
  }

  function preloadCardImage(card?: Card | null) {
    if (!card) return
    const high = card.images?.large
    const fallback = card.images?.small
    const target = high || fallback
    if (!target) return

    preloadImage(target).then(() => {
      setLoadedImages((prev) => (prev[card.id] ? prev : { ...prev, [card.id]: true }))
    })
  }

  function preloadPackImages(pack: Card[]) {
    pack.forEach((card) => preloadCardImage(card))
  }

  function resetFlow(nextView: OpeningView = 'select') {
    if (sleeveChargeTimeoutRef.current) {
      window.clearTimeout(sleeveChargeTimeoutRef.current)
      sleeveChargeTimeoutRef.current = null
    }
    if (sleeveRipTimeoutRef.current) {
      window.clearTimeout(sleeveRipTimeoutRef.current)
      sleeveRipTimeoutRef.current = null
    }
    if (sleevePopTimeoutRef.current) {
      window.clearTimeout(sleevePopTimeoutRef.current)
      sleevePopTimeoutRef.current = null
    }
    if (sleeveOpenTimeoutRef.current) {
      window.clearTimeout(sleeveOpenTimeoutRef.current)
      sleeveOpenTimeoutRef.current = null
    }
    if (flipTimeoutRef.current) {
      window.clearTimeout(flipTimeoutRef.current)
      flipTimeoutRef.current = null
    }
    if (spotlightTimeoutRef.current) {
      window.clearTimeout(spotlightTimeoutRef.current)
      spotlightTimeoutRef.current = null
    }
    setCurrentPack([])
    setRevealIndex(0)
    setView(nextView)
    setIsSleeveCharging(false)
    setIsSleeveRipping(false)
    setIsSleeveOpening(false)
    setIsCardFaceUp(false)
    setIsSpotlightMoment(false)
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

    setHasInteracted(true)
    sfxRef.current.unlock()
    sfxRef.current.tap()
    preloadPackImages(pack)

    setCurrentPack(pack)
    setRevealIndex(0)
    setView('sleeve')
    setIsSleeveOpening(false)
    setIsTransitioning(false)
    setSwipeDirection(1)
  }

  function revealNext(direction: 1 | -1 = 1) {
    if (view !== 'opening' || currentPack.length === 0 || isTransitioning || isSpotlightMoment) return
    if (revealIndex >= currentPack.length - 1) {
      setView('summary')
      return
    }
    setHasInteracted(true)
    sfxRef.current.whoosh()
    setSwipeDirection(direction)
    setIsTransitioning(true)
    setRevealIndex((prev) => prev + 1)
  }

  useEffect(() => {
    if (view !== 'opening' || currentPack.length === 0) return
    preloadCardImage(currentPack[revealIndex])
    preloadCardImage(currentPack[revealIndex + 1])
    preloadCardImage(currentPack[revealIndex + 2])
  }, [view, currentPack, revealIndex])

  function startSleeveOpen() {
    if (currentPack.length === 0 || isSleeveOpening || isSleeveCharging || isSleeveRipping) return

    setHasInteracted(true)
    sfxRef.current.unlock()
    sfxRef.current.tap()
    setIsSleeveCharging(true)
    sfxRef.current.rustle()

    sleeveChargeTimeoutRef.current = window.setTimeout(() => {
      setIsSleeveCharging(false)
      setIsSleeveRipping(true)
      setIsSleeveOpening(true)
      sfxRef.current.tearOpen()
      if (!isMuted && typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([12, 26, 10])
      }
      sleeveChargeTimeoutRef.current = null

      sleevePopTimeoutRef.current = window.setTimeout(() => {
        sfxRef.current.packPop()
        sleevePopTimeoutRef.current = null
      }, 180)

      sleeveRipTimeoutRef.current = window.setTimeout(() => {
        setIsSleeveRipping(false)
        sleeveRipTimeoutRef.current = null
      }, 360)

      sleeveOpenTimeoutRef.current = window.setTimeout(() => {
        setView('opening')
        setIsSleeveRipping(false)
        setIsSleeveOpening(false)
        sleeveOpenTimeoutRef.current = null
      }, 900)
    }, 260)
  }

  function toggleMuted() {
    const next = !isMuted
    setIsMuted(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('packopener-sound-muted', next ? '1' : '0')
    }
    if (!next) {
      sfxRef.current.unlock()
      sfxRef.current.tap()
    }
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
    <div className={`pack-opener-wrap ${shouldCollapseText ? 'compact-ui' : ''}`}>
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
            <h2 className="landing-title">Pick a set. Crack a pack.</h2>
            <p className="landing-text">Load the sleeve, swipe through six pulls, and review your best hit.</p>
            {shouldCollapseText && <p className="landing-text compact-caption">Swipe-ready view enabled</p>}
            <button className="ghost-button sound-toggle" onClick={toggleMuted}>
              {isMuted ? 'Sound: Off' : 'Sound: On'}
            </button>
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
                  {setLogo
                    ? <img src={setLogo} alt={setDisplayName} className="selected-pack-logo" draggable={false} />
                    : <span>{setDisplayName}</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === 'sleeve' && currentPack.length > 0 && (
        <section className={`flow-shell sleeve-view-shell premium-stage premium-stage-sleeve ${isSleeveCharging ? 'sleeve-is-charging' : ''} ${isSleeveRipping ? 'sleeve-is-ripping' : ''}`}>
          <div className="stage-spotlight stage-spotlight-center" />
          <div className="stage-particles" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="flow-header">
            <div className="flow-actions">
              <button className="ghost-button" onClick={() => resetFlow('select')}>
                Choose Another Set
              </button>
              <button className="ghost-button sound-toggle" onClick={toggleMuted}>
                {isMuted ? 'Sound: Off' : 'Sound: On'}
              </button>
            </div>
            <div className="flow-meta">{packTypeLabel} • {setDisplayName}</div>
          </div>

          <div className="sleeve-stage-wrap">
            <div className="sleeve-copy">
              <span className="landing-eyebrow">Sleeve loaded</span>
              <h3>Open the sleeve to reveal your deck</h3>
              {!shouldCollapseText && <p>Tap the sleeve and it will peel open before the first card appears.</p>}
            </div>

            <motion.button
              type="button"
              className={`sleeve-stage ${isSleeveCharging ? 'is-charging' : ''} ${isSleeveRipping ? 'is-ripping' : ''} ${isSleeveOpening ? 'is-opening' : ''}`}
              onClick={startSleeveOpen}
              disabled={isSleeveOpening || isSleeveCharging || isSleeveRipping}
              whileHover={{ scale: isSleeveOpening ? 1 : 1.01 }}
              whileTap={{ scale: isSleeveOpening ? 1 : 0.99 }}
              animate={
                isSleeveOpening
                  ? { rotateZ: [0, -1.8, 1.7, -0.9, 0], scale: [1, 1.03, 1.005, 1] }
                  : isSleeveCharging
                  ? { rotateZ: [0, -0.5, 0.5, -0.2, 0], scale: [1, 1.03, 1.015] }
                  : { rotateZ: 0, scale: 1 }
              }
              transition={{ duration: isSleeveCharging ? 0.26 : 0.58, ease: 'easeInOut' }}
              aria-label="Open pack sleeve"
              onPointerMove={(e) => {
                if (isSleeveOpening || isSleeveCharging || isSleeveRipping) return
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
                className="sleeve-charge-aura"
                animate={isSleeveCharging ? { opacity: [0.15, 0.6, 0.2], scale: [0.92, 1.05, 1] } : { opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              />
              <motion.div
                className="sleeve-rip-impact"
                animate={isSleeveRipping ? { opacity: [0, 0.95, 0], scale: [0.6, 1.08, 1.2] } : { opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.34, ease: 'easeOut' }}
              />
              <motion.div
                className="sleeve-rip-glow"
                animate={isSleeveRipping ? { opacity: [0, 1, 0], scale: [0.8, 1, 0.95] } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              />
              <div className="sleeve-rip-shards" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <motion.div
                className="sleeve-shell"
                animate={isSleeveOpening ? { y: [0, 8, 18], scale: [1, 1.015, 1] } : isSleeveCharging ? { y: -4 } : { y: 0, scale: 1 }}
                transition={{ duration: 0.54, ease: 'easeOut' }}
                style={{ rotateX: sleeveRotX, rotateY: sleeveRotY, transformPerspective: 900 }}
              >
                <div className="sleeve-pocket" aria-hidden="true">
                  <motion.div
                    className="sleeve-deck"
                    animate={isSleeveOpening ? { y: [56, 34, -170], opacity: [0.98, 1, 1], scale: [0.98, 1.03, 1] } : isSleeveCharging ? { y: 46, opacity: 1, scale: 1.015 } : { y: 56, opacity: 0.98, scale: 0.98 }}
                    transition={{ duration: 0.66, delay: isSleeveOpening ? 0.08 : 0, ease: [0.18, 0.84, 0.32, 1] }}
                  >
                    <img src="/card-back.png" alt="deck" className="deck-back" />
                  </motion.div>
                </div>
                <motion.div className="sleeve-flap" animate={isSleeveOpening ? { rotateX: [0, -164, -188], rotateZ: [0, 8, 16], y: [0, -18, -64], scale: [1, 1.04, 1.06], opacity: [1, 1, 0.3] } : { rotateX: 0, rotateZ: 0, y: 0, scale: 1, opacity: 1 }} transition={{ duration: 0.56, ease: [0.34, 1.56, 0.64, 1] }} />
                <motion.div className="sleeve-rip" animate={isSleeveOpening ? { scaleX: [0.15, 1.16, 1], opacity: [0.4, 1, 0.96], y: [0, -2, 0] } : { scaleX: 0.2, opacity: 0.55, y: 0 }} transition={{ duration: 0.34, delay: isSleeveOpening ? 0.06 : 0, ease: 'easeOut' }} />
                <motion.div className="sleeve-foil-sheen" animate={isSleeveOpening ? { x: ['-120%', '130%'], opacity: [0, 0.85, 0] } : { x: '-120%', opacity: 0 }} transition={{ duration: 0.58, delay: isSleeveOpening ? 0.08 : 0, ease: 'easeOut' }} />
                <motion.div
                  className="sleeve-mouth-cover"
                  animate={isSleeveOpening ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: isSleeveOpening ? 0.14 : 0 }}
                />
                <div className="sleeve-body">
                  {setLogo
                    ? <img src={setLogo} alt={setDisplayName} className="sleeve-logo" draggable={false} />
                    : <div className="sleeve-brand">{setDisplayName}</div>
                  }
                  <div className="sleeve-packtype">{packTypeLabel}</div>
                  <div className="sleeve-hint">{isSleeveRipping ? 'Ripping...' : isSleeveCharging ? 'Charging...' : 'Tap to rip open'}</div>
                </div>
              </motion.div>
            </motion.button>
          </div>
        </section>
      )}

      {hasActiveOpening && visibleCard && (
        <section className={`flow-shell opening-view-shell premium-stage premium-stage-opening premium-tone-${currentHighlight.tone} ${isSpotlightMoment ? 'opening-spotlight' : ''} ${isSpotlightMoment && isBigHitTone ? 'opening-big-hit' : ''}`}>
          <div className="stage-spotlight stage-spotlight-center" />
          <div className="stage-particles" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          {isSpotlightMoment && isBigHitTone && (
            <>
              <div className="cinema-bar cinema-bar-top" />
              <div className="cinema-bar cinema-bar-bottom" />
              <div className={`jackpot-flash jackpot-flash-${currentHighlight.tone}`} />
            </>
          )}
          <div className="flow-header">
            <div className="flow-actions">
              <button className="ghost-button" onClick={() => resetFlow('select')}>
                Choose Another Set
              </button>
              <button className="ghost-button sound-toggle" onClick={toggleMuted}>
                {isMuted ? 'Sound: Off' : 'Sound: On'}
              </button>
            </div>
            <div className="flow-meta">Card {revealIndex + 1} of {currentPack.length} • {remainingCards} left</div>
          </div>

          <div className="opening-stage">
            {!shouldCollapseText && <div className="opening-hint">Swipe left or right, or tap the card to reveal the next pull</div>}
            {isSpotlightMoment && currentHighlight.label && (
              <motion.div
                className={`spotlight-pill spotlight-pill-${currentHighlight.tone}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                {currentHighlight.tone === 'secret' ? 'Secret Spotlight' : 'Ultra Spotlight'}
              </motion.div>
            )}
            {currentHighlight.label && isCardFaceUp && (
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
              {isSpotlightMoment && isBigHitTone && <div className={`hit-wave hit-wave-${currentHighlight.tone}`} />}
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
                    setHasInteracted(true)
                    suppressClickRef.current = true
                  }}
                  onDragEnd={onCardDragEnd}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.26, ease: 'easeOut' }}
                  className={`opening-current-card ${isSpotlightMoment && isBigHitTone ? 'dramatic-hit' : ''}`}
                >
                  <motion.div className={`card-burst card-burst-${currentHighlight.tone}`} style={{ opacity: dragGlow }} />
                  <div className="opening-flip-shell">
                    <motion.div
                      className="opening-flip-card"
                      animate={{ rotateY: isCardFaceUp ? 180 : 0 }}
                      transition={{ duration: 0.38, ease: [0.18, 0.84, 0.32, 1] }}
                    >
                      <div className="opening-card-face opening-card-face-back">
                        <img src="/card-back.png" alt="card back" className="opening-back-art" draggable={false} />
                      </div>
                      <div className="opening-card-face opening-card-face-front">
                        {(visibleCard.images?.large || visibleCard.images?.small) ? (
                          <>
                            {!loadedImages[visibleCard.id] && <div className="card-loading-veil" />}
                            <img
                              src={visibleCard.images.large || visibleCard.images.small}
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
                      </div>
                    </motion.div>
                  </div>
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
          <div className="flow-header" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div className="flow-meta">Pack complete • {currentPack.length} cards pulled</div>
          </div>

          <div className="opened-cards-wrap">
            <div className="summary-heading">
              <h3>Pack Summary</h3>
              {!shouldCollapseText && <p>Review every card from this pack, zoom in on hits, then open another or pick a new set.</p>}
            </div>

            {bestPull && (
              <motion.div
                className={`best-pull-spotlight best-pull-${bestPullHighlight.tone}`}
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35 }}
              >
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
                  {bestPull.images?.small
                    ? <img src={bestPull.images.small} alt={bestPull.name} className="card-art" draggable={false} />
                    : <div className="card-status">No Image</div>}
                </div>
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
                        {!loadedImages[c.id] && <div className="card-loading-veil" />}
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

