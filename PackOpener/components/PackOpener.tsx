import React, { useState, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'framer-motion'
import PackSelector from './PackSelector'
import packs from '../data/packs.json'
import { simulatePack, type Card } from '../lib/simulator'
import { addShowcasePulls } from '../lib/showcase'
import {
  applyPackProgression,
  createDefaultProgressionState,
  getPackOpenCost,
  getCardPullReward,
  loadProgressionState,
  saveProgressionState,
  type PackType,
  type ProgressionState,
} from '../lib/progression'
import CardZoomModal from './CardZoomModal'
import { getSfxEngine } from '../lib/sfx'
import { getCardRankBySet, getSetFamily, getBallTypes, MAINLINE_LADDER_DISPLAY, POCKET_LADDER_DISPLAY } from '../lib/rarityLadder'
import { recordSessionPackOpen } from '../lib/sessionStats'
import { getAchievements } from '../lib/achievements'

type FocusCard = {
  name: string
  image?: string
  subtitle?: string
  isHolo?: boolean
  isReverse?: boolean
  overlayClass?: string | null
  specialBadgeText?: string | null
  specialBadgeClass?: string | null
}

type OpeningView = 'select' | 'sleeve' | 'opening' | 'summary'

type PackEconomySummary = {
  packCost: number
  cardReward: number
  missionReward: number
  totalReward: number
  currencyDelta: number
  currencyAfter: number
  newCardsCount: number
}

type RewardTone = 'low' | 'mid' | 'high'
type AchievementToast = { id: string; label: string; description: string }

function formatCoins(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function getRewardTone(reward: number): RewardTone {
  if (reward >= 100) return 'high'
  if (reward >= 60) return 'mid'
  return 'low'
}

function parseReleaseDate(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const normalized = value.trim().replace(/\//g, '-')
  const timestamp = Date.parse(normalized)
  if (!Number.isNaN(timestamp)) return timestamp

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (match) {
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  return Number.NEGATIVE_INFINITY
}

function specialBadge(special?: string): { text: string; cls: string } | null {
  if (!special) return null
  if (special === 'ReverseMasterBall') return { text: 'Master Ball', cls: 'card-badge-masterball' }
  if (special === 'ReversePokeBall') return { text: 'Poké Ball', cls: 'card-badge-pokeball' }
  if (special === 'ReverseLoveBall') return { text: 'Love Ball', cls: 'card-badge-loveball' }
  if (special === 'ReverseFriendBall') return { text: 'Friend Ball', cls: 'card-badge-friendball' }
  if (special === 'ReverseQuickBall') return { text: 'Quick Ball', cls: 'card-badge-quickball' }
  if (special === 'ReverseDuskBall') return { text: 'Dusk Ball', cls: 'card-badge-duskball' }
  if (special === 'ReverseRocketR') return { text: 'Rocket R', cls: 'card-badge-rocketr' }
  if (special === 'ReverseEnergyType') return { text: 'Energy Reverse', cls: 'card-badge-energytype' }
  return { text: special, cls: 'card-badge-special' }
}

function specialLabel(special?: string): string {
  if (!special) return ''
  if (special === 'ReverseMasterBall') return 'Master Ball'
  if (special === 'ReversePokeBall') return 'Poké Ball'
  if (special === 'ReverseLoveBall') return 'Love Ball'
  if (special === 'ReverseFriendBall') return 'Friend Ball'
  if (special === 'ReverseQuickBall') return 'Quick Ball'
  if (special === 'ReverseDuskBall') return 'Dusk Ball'
  if (special === 'ReverseRocketR') return 'Rocket R'
  if (special === 'ReverseEnergyType') return 'Energy Reverse'
  return special
}

function isPatternBallOverlaySet(setId: string): boolean {
  const id = (setId || '').trim().toLowerCase()
  return id === 'sv10.5b' || id === 'sv10.5w'
}

function normalizeEnergyType(type?: string): string {
  const value = (type || '').trim().toLowerCase()
  if (!value) return 'generic'
  if (value === 'electric') return 'lightning'
  return value
}

function specialOverlayClass(special: string | undefined, setId: string, card?: { types?: string[] } | null): string | null {
  const usePatternOverlay = isPatternBallOverlaySet(setId)
  if (!special) return null
  if (special === 'ReversePokeBall') return usePatternOverlay ? 'pokeball-foil-overlay' : 'pokeball-foil-overlay-single'
  if (special === 'ReverseMasterBall') return usePatternOverlay ? 'masterball-foil-overlay' : 'masterball-foil-overlay-single'
  if (special === 'ReverseLoveBall') return usePatternOverlay ? 'loveball-foil-overlay' : 'loveball-foil-overlay-single'
  if (special === 'ReverseFriendBall') return usePatternOverlay ? 'friendball-foil-overlay' : 'friendball-foil-overlay-single'
  if (special === 'ReverseQuickBall') return usePatternOverlay ? 'quickball-foil-overlay' : 'quickball-foil-overlay-single'
  if (special === 'ReverseDuskBall') return usePatternOverlay ? 'duskball-foil-overlay' : 'duskball-foil-overlay-single'
  if (special === 'ReverseRocketR') return 'rocketr-foil-overlay'
  if (special === 'ReverseEnergyType') return `energytype-foil-overlay-${normalizeEnergyType(card?.types?.[0])}`
  return null
}

type HighlightTone = 'base' | 'holo' | 'ultra' | 'secret'
function getHighlight(card: Card | null | undefined, setId: string): { label: string | null; tone: HighlightTone } {
  const rank = getCardRankBySet(card, setId)
  if (!card || rank < 40) return { label: null, tone: 'base' }
  if (rank >= 95) return { label: 'Secret Hit', tone: 'secret' }
  if (rank >= 82) return { label: 'Major Pull', tone: 'secret' }
  if (rank >= 68) return { label: 'Ultra Rare', tone: 'ultra' }
  if (rank >= 46) return { label: 'Shiny Pull', tone: 'holo' }
  return { label: 'Holo Hit', tone: 'holo' }
}

export default function RipRealmApp() {
  const RIP_SEAM_MIN_Y = 0.14
  const RIP_SEAM_MAX_Y = 0.58
  const RIP_MIDPOINT_X = 0.5
  const RIP_TRACK_START_X = 0.04
  const RIP_TRACK_END_X = 0.98
  const RIP_RELEASE_THRESHOLD = 0.56
  const [setId, setSetId] = useState('sv10')
  const [packType, setPackType] = useState<PackType>('standard')
  const [loading, setLoading] = useState(false)
  const [pool, setPool] = useState<Card[]>([])
  const [setNames, setSetNames] = useState<Record<string, string>>({})
  const [setLogos, setSetLogos] = useState<Record<string, string>>({})
  const [currentPack, setCurrentPack] = useState<Card[]>([])
  const [currentPackNewFlags, setCurrentPackNewFlags] = useState<boolean[]>([])
  const [lastPackEconomy, setLastPackEconomy] = useState<PackEconomySummary | null>(null)
  const [progression, setProgression] = useState<ProgressionState>(() => createDefaultProgressionState())
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
  const [ripProgress, setRipProgress] = useState(0)
  const [ripCursorX, setRipCursorX] = useState(0.5)
  const [ripCursorY, setRipCursorY] = useState(0.32)
  const [ripDirectionUi, setRipDirectionUi] = useState<1 | -1>(1)
  const [isRipGestureActive, setIsRipGestureActive] = useState(false)
  const [isCardFaceUp, setIsCardFaceUp] = useState(false)
  const [isRevealSuspense, setIsRevealSuspense] = useState(false)
  const [isSpotlightMoment, setIsSpotlightMoment] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [showRevealHint, setShowRevealHint] = useState(false)
  const [hintActivityTick, setHintActivityTick] = useState(0)
  const [summaryRewardCount, setSummaryRewardCount] = useState(0)
  const [summaryNetCount, setSummaryNetCount] = useState(0)
  const [achievementToasts, setAchievementToasts] = useState<AchievementToast[]>([])
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const sleeveGestureConsumedRef = useRef(false)
  const ripStartRef = useRef<{ x: number; y: number; nx: number; ny: number } | null>(null)
  const ripDirectionRef = useRef<1 | -1>(1)
  const ripMovedRef = useRef(false)
  const ripProgressRef = useRef(0)
  const lastRipSfxProgressRef = useRef(0)
  const lastRustleSfxProgressRef = useRef(0)
  const lastRipSfxAtRef = useRef(0)
  const lastRustleSfxAtRef = useRef(0)
  const sleeveChargeTimeoutRef = useRef<number | null>(null)
  const sleeveChargeAccentTimeoutRef = useRef<number | null>(null)
  const sleeveRipTimeoutRef = useRef<number | null>(null)
  const sleeveSnapTimeoutRef = useRef<number | null>(null)
  const sleevePopTimeoutRef = useRef<number | null>(null)
  const sleeveOpenTimeoutRef = useRef<number | null>(null)
  const flipTimeoutRef = useRef<number | null>(null)
  const spotlightTimeoutRef = useRef<number | null>(null)
  const revealHintTimeoutRef = useRef<number | null>(null)
  const poolRequestSeqRef = useRef(0)
  const poolAbortRef = useRef<AbortController | null>(null)
  const sfxRef = useRef(getSfxEngine())
  const unlockedAchievementIdsRef = useRef<Set<string>>(new Set())
  const pendingAchievementToastsRef = useRef<AchievementToast[]>([])
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
  const visibleCardReward = visibleCard ? getCardPullReward(visibleCard.rarity, visibleCard.special) : 0
  const visibleRewardTone = getRewardTone(visibleCardReward)
  const remainingCards = hasActiveOpening ? currentPack.length - revealIndex - 1 : 0
  const packTypeLabel = packType === 'premium' ? 'Premium Pack' : 'Standard Pack'
  const packOpenCost = getPackOpenCost(packType)
  const setDisplayName = setNames[setId] || setId.toUpperCase()
  const setLogo = setLogos[setId] || null
  const canAffordPack = progression.currency >= packOpenCost
  const isPocketSet = getSetFamily(setId) === 'pocket'
  const ballTypes = isPocketSet
    ? { pokeball: false, masterball: false, loveball: false, friendball: false, quickball: false, duskball: false, rocketr: false, energytype: false }
    : getBallTypes(setId)
  const hasBallReverse = ballTypes.pokeball
  const hasMasterBall = ballTypes.masterball
  const isAscendedHeroesSet = setId.trim().toLowerCase() === 'me02.5'
  const setTypeLabel = isPocketSet ? 'Pokemon TCG Pocket' : 'Pokemon TCG Mainline'
  const baseMixLabel = isPocketSet ? '1 diamond + 2 diamond base' : '1 Common + 2 Uncommon base'
  const reverseFinishLabel = isPocketSet
    ? 'Standard reverse'
    : isAscendedHeroesSet
    ? 'Energy / Ball / Rocket pattern reverse'
    : hasBallReverse
    ? hasMasterBall
      ? 'Standard + Poke Ball + Master Ball reverse'
      : 'Standard + Poke Ball reverse'
    : 'Standard reverse'
  const currentHighlight = getHighlight(visibleCard, setId)
  const revealSuspenseDelay = currentHighlight.tone === 'secret' ? 460 : currentHighlight.tone === 'ultra' ? 380 : currentHighlight.tone === 'holo' ? 260 : 200
  const revealFlipDuration = currentHighlight.tone === 'secret' ? 0.42 : currentHighlight.tone === 'ultra' ? 0.38 : currentHighlight.tone === 'holo' ? 0.34 : 0.3
  const revealToneWashDuration = currentHighlight.tone === 'secret' ? 0.7 : currentHighlight.tone === 'ultra' ? 0.56 : currentHighlight.tone === 'holo' ? 0.4 : 0.28
  const revealToneWashOpacity = isCardFaceUp ? (currentHighlight.tone === 'base' ? 0.24 : currentHighlight.tone === 'holo' ? 0.42 : currentHighlight.tone === 'ultra' ? 0.56 : 0.68) : 0.16
  const bestPull = useMemo(() => {
    if (currentPack.length === 0) return null
    return [...currentPack].sort((a, b) => getCardRankBySet(b, setId) - getCardRankBySet(a, setId))[0]
  }, [currentPack, setId])
  const bestPullHighlight = getHighlight(bestPull, setId)
  const summaryRarityBreakdown = useMemo(() => {
    const counts: Record<HighlightTone, number> = { base: 0, holo: 0, ultra: 0, secret: 0 }
    for (const card of currentPack) {
      const tone = getHighlight(card, setId).tone
      counts[tone] += 1
    }
    return counts
  }, [currentPack, setId])
  const newCardHighlights = useMemo(() => {
    return currentPack
      .map((card, index) => ({ card, isNew: Boolean(currentPackNewFlags[index]) }))
      .filter((entry) => entry.isNew)
      .slice(0, 3)
      .map((entry) => entry.card.name)
  }, [currentPack, currentPackNewFlags])
  const isBigHitTone = currentHighlight.tone === 'ultra' || currentHighlight.tone === 'secret'
  const shouldCollapseText = isCompactMode && hasInteracted

  function getPackOpeningTone(pack: Card[]): HighlightTone {
    let bestTone: HighlightTone = 'base'
    for (const card of pack) {
      const tone = getHighlight(card, setId).tone
      if (tone === 'secret') return 'secret'
      if (tone === 'ultra') bestTone = 'ultra'
      else if (tone === 'holo' && bestTone === 'base') bestTone = 'holo'
    }
    return bestTone
  }

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
    loadPool(setId)
  }, [setId])

  useEffect(() => {
    return () => {
      poolAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loaded = loadProgressionState(new Date())
    const unlocked = new Set(getAchievements(loaded).filter((item) => item.unlocked).map((item) => item.id))
    unlockedAchievementIdsRef.current = unlocked
    setProgression(loaded)
    saveProgressionState(loaded)
  }, [])

  useEffect(() => {
    if (!achievementToasts.length) return
    const timers = achievementToasts.map((toast) =>
      window.setTimeout(() => {
        setAchievementToasts((prev) => prev.filter((item) => item.id !== toast.id))
      }, 4200),
    )
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [achievementToasts])

  useEffect(() => {
    if (view !== 'summary') return
    if (!pendingAchievementToastsRef.current.length) return

    setAchievementToasts((prev) => {
      const existing = new Set(prev.map((item) => item.id))
      const additions = pendingAchievementToastsRef.current.filter((item) => !existing.has(item.id))
      return additions.length > 0 ? [...prev, ...additions] : prev
    })
    pendingAchievementToastsRef.current = []
    sfxRef.current.rarity('holo')
  }, [view])

  function applyProgressionUpdate(nextState: ProgressionState, options?: { suppressToasts?: boolean }) {
    const unlockedNow = getAchievements(nextState).filter((item) => item.unlocked)
    const unlockedSet = new Set(unlockedNow.map((item) => item.id))

    if (!options?.suppressToasts) {
      const newlyUnlocked = unlockedNow
        .filter((item) => !unlockedAchievementIdsRef.current.has(item.id))
        .map((item) => ({ id: item.id, label: item.label, description: item.description }))

      if (newlyUnlocked.length > 0) {
        if (view === 'summary') {
          setAchievementToasts((prev) => {
            const existing = new Set(prev.map((item) => item.id))
            const additions = newlyUnlocked.filter((item) => !existing.has(item.id))
            return [...prev, ...additions]
          })
          sfxRef.current.rarity('holo')
        } else {
          const existingPending = new Set(pendingAchievementToastsRef.current.map((item) => item.id))
          const additions = newlyUnlocked.filter((item) => !existingPending.has(item.id))
          if (additions.length > 0) {
            pendingAchievementToastsRef.current = [...pendingAchievementToastsRef.current, ...additions]
          }
        }
      }
    }

    unlockedAchievementIdsRef.current = unlockedSet
    setProgression(nextState)
    saveProgressionState(nextState)
  }

  useEffect(() => {
    let mounted = true

    async function resolveDefaultMainlineSet() {
      try {
        const res = await fetch('/api/sets')
        const data = await res.json()
        if (!mounted || !Array.isArray(data?.sets)) return

        const latestMainline = [...data.sets]
          .filter((item: { id?: string }) => typeof item?.id === 'string' && getSetFamily(item.id) === 'mainline')
          .sort((a: { id: string; name?: string; releaseDate?: string }, b: { id: string; name?: string; releaseDate?: string }) => {
            const aTs = parseReleaseDate(a.releaseDate)
            const bTs = parseReleaseDate(b.releaseDate)
            if (aTs !== bTs) return bTs - aTs
            const aName = a.name || ''
            const bName = b.name || ''
            const nameCompare = aName.localeCompare(bName)
            if (nameCompare !== 0) return nameCompare
            return a.id.localeCompare(b.id)
          })[0]

        if (latestMainline?.id) {
          setSetId(latestMainline.id)
        }
      } catch {
        // keep existing fallback default if set list cannot be loaded
      }
    }

    resolveDefaultMainlineSet()
    return () => {
      mounted = false
    }
  }, [])

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
    if (view !== 'summary' || !lastPackEconomy) {
      setSummaryRewardCount(0)
      setSummaryNetCount(0)
      return
    }

    let lastTick = 0
    setSummaryRewardCount(0)
    setSummaryNetCount(0)

    const rewardAnimation = animate(0, lastPackEconomy.totalReward, {
      duration: 0.95,
      ease: 'easeOut',
      onUpdate: (value) => {
        const rounded = Math.round(value)
        setSummaryRewardCount(rounded)
        if (lastPackEconomy.totalReward > 0 && rounded - lastTick >= 30) {
          sfxRef.current.coinTick(0.58)
          lastTick = rounded
        }
      },
      onComplete: () => {
        if (lastPackEconomy.totalReward > 0) {
          sfxRef.current.coinBurst(lastPackEconomy.totalReward, bestPullHighlight.tone)
        }
      },
    })

    const netAnimation = animate(0, lastPackEconomy.currencyDelta, {
      duration: 0.82,
      delay: 0.16,
      ease: 'easeOut',
      onUpdate: (value) => setSummaryNetCount(Math.round(value)),
    })

    return () => {
      rewardAnimation.stop()
      netAnimation.stop()
    }
  }, [view, lastPackEconomy, bestPullHighlight.tone])

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
      if (sleeveChargeAccentTimeoutRef.current) window.clearTimeout(sleeveChargeAccentTimeoutRef.current)
      if (sleeveRipTimeoutRef.current) window.clearTimeout(sleeveRipTimeoutRef.current)
      if (sleeveSnapTimeoutRef.current) window.clearTimeout(sleeveSnapTimeoutRef.current)
      if (sleevePopTimeoutRef.current) window.clearTimeout(sleevePopTimeoutRef.current)
      if (sleeveOpenTimeoutRef.current) window.clearTimeout(sleeveOpenTimeoutRef.current)
      if (flipTimeoutRef.current) window.clearTimeout(flipTimeoutRef.current)
      if (spotlightTimeoutRef.current) window.clearTimeout(spotlightTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('riprealm-sound-muted') ?? window.localStorage.getItem('packopener-sound-muted')
    const muted = saved === '1'
    setIsMuted(muted)
    sfxRef.current.setMuted(muted)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (!isLocalhost) return

    async function clearLocalhostServiceWorkerCaches() {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((registration) => registration.unregister()))
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(cacheKeys.map((key) => caches.delete(key)))
        }
      } catch {
        // ignore cleanup issues in local/dev browsers
      }
    }

    clearLocalhostServiceWorkerCaches()
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

    const highlight = getHighlight(visibleCard, setId)
    setIsCardFaceUp(false)
    setIsSpotlightMoment(false)
    setIsRevealSuspense(highlight.tone === 'secret' || highlight.tone === 'ultra')
    if (highlight.tone === 'secret' || highlight.tone === 'ultra') {
      sfxRef.current.drawSlide(highlight.tone === 'secret' ? 0.98 : 0.88)
    }
    sfxRef.current.revealTier(highlight.tone)
    flipTimeoutRef.current = window.setTimeout(() => {
      setIsRevealSuspense(false)
      setIsCardFaceUp(true)
      sfxRef.current.flip()
      if (highlight.label) sfxRef.current.rarity(highlight.tone)
      if (visibleCardReward > 0) {
        sfxRef.current.coinBurst(visibleCardReward, highlight.tone)
      }
      sfxRef.current.cardLand(highlight.tone === 'secret' ? 0.95 : highlight.tone === 'ultra' ? 0.82 : highlight.tone === 'holo' ? 0.64 : 0.5)

      if (highlight.tone === 'ultra' || highlight.tone === 'secret') {
        setIsSpotlightMoment(true)
        sfxRef.current.whoosh()
        sfxRef.current.hitStinger(highlight.tone)
        sfxRef.current.hitRumble(highlight.tone)
        if (!isMuted && typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(highlight.tone === 'secret' ? [26, 42, 24, 52, 28] : [20, 34, 18])
        }
        spotlightTimeoutRef.current = window.setTimeout(() => {
          setIsSpotlightMoment(false)
          spotlightTimeoutRef.current = null
        }, highlight.tone === 'secret' ? 1360 : 1040)
      }

      flipTimeoutRef.current = null
    }, revealSuspenseDelay)
  }, [hasActiveOpening, visibleCard, isMuted, revealSuspenseDelay, setId, visibleCardReward])

  useEffect(() => {
    dragX.set(0)
  }, [dragX, revealIndex, view])

  useEffect(() => {
    if (revealHintTimeoutRef.current) {
      window.clearTimeout(revealHintTimeoutRef.current)
      revealHintTimeoutRef.current = null
    }

    if (view !== 'opening' || !hasActiveOpening || !isCardFaceUp || isTransitioning || remainingCards <= 0) {
      setShowRevealHint(false)
      return
    }

    revealHintTimeoutRef.current = window.setTimeout(() => {
      setShowRevealHint(true)
      revealHintTimeoutRef.current = null
    }, 3000)

    return () => {
      if (revealHintTimeoutRef.current) {
        window.clearTimeout(revealHintTimeoutRef.current)
        revealHintTimeoutRef.current = null
      }
    }
  }, [view, hasActiveOpening, isCardFaceUp, isTransitioning, remainingCards, revealIndex, hintActivityTick])

  async function loadPool(targetSetId: string) {
    const requestId = ++poolRequestSeqRef.current
    poolAbortRef.current?.abort()
    const controller = new AbortController()
    poolAbortRef.current = controller

    setLoading(true)
    setError('')
    setDataSource('')
    try {
      const res = await fetch(`/api/cards?set=${encodeURIComponent(targetSetId)}`, { signal: controller.signal })
      const data = await res.json()

      if (requestId !== poolRequestSeqRef.current || controller.signal.aborted) return
      
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
      if (controller.signal.aborted) return

      if (requestId !== poolRequestSeqRef.current) return
      setError('Network error: Unable to reach card API')
      setPool([])
      setDataSource('')
    } finally {
      if (requestId === poolRequestSeqRef.current && !controller.signal.aborted) {
        setLoading(false)
      }
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
    if (sleeveChargeAccentTimeoutRef.current) {
      window.clearTimeout(sleeveChargeAccentTimeoutRef.current)
      sleeveChargeAccentTimeoutRef.current = null
    }
    if (sleeveRipTimeoutRef.current) {
      window.clearTimeout(sleeveRipTimeoutRef.current)
      sleeveRipTimeoutRef.current = null
    }
    if (sleeveSnapTimeoutRef.current) {
      window.clearTimeout(sleeveSnapTimeoutRef.current)
      sleeveSnapTimeoutRef.current = null
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
    if (revealHintTimeoutRef.current) {
      window.clearTimeout(revealHintTimeoutRef.current)
      revealHintTimeoutRef.current = null
    }
    setCurrentPack([])
    setCurrentPackNewFlags([])
    setRevealIndex(0)
    setView(nextView)
    setIsSleeveCharging(false)
    setIsSleeveRipping(false)
    setIsSleeveOpening(false)
    setRipProgress(0)
    setIsRipGestureActive(false)
    setIsCardFaceUp(false)
    setIsRevealSuspense(false)
    setIsSpotlightMoment(false)
    setShowRevealHint(false)
    setIsTransitioning(false)
    setSwipeDirection(1)
    if (nextView === 'select') {
      pendingAchievementToastsRef.current = []
    }
  }

  function markRevealInteraction() {
    setShowRevealHint(false)
    setHintActivityTick((prev) => prev + 1)
  }

  function buildPack() {
    if (!pool || pool.length === 0) {
      setError('No cards loaded. Try changing the set.')
      return null
    }

    if (progression.currency < packOpenCost) {
      setError(`Not enough coins. A pack costs ${packOpenCost} and you have ${formatCoins(progression.currency)}.`)
      return null
    }

    const def = (packs as any)[packType]
    if (!def) {
      setError('Invalid pack type')
      return null
    }

    const pack = simulatePack(def, pool, { setId })
    const outcome = applyPackProgression(progression, setId, pack, packType)
    if (outcome.notAffordable) {
      setError(`Not enough coins. A pack costs ${packOpenCost} and you have ${formatCoins(progression.currency)}.`)
      return null
    }

    applyProgressionUpdate(outcome.nextState)
    recordSessionPackOpen(pack, setId, outcome.currencyDelta)
    setCurrentPackNewFlags(outcome.newCardFlags)
    setLastPackEconomy({
      packCost: outcome.packCost,
      cardReward: outcome.cardReward,
      missionReward: outcome.missionReward,
      totalReward: outcome.totalReward,
      currencyDelta: outcome.currencyDelta,
      currencyAfter: outcome.nextState.currency,
      newCardsCount: outcome.newCardsCount,
    })
    addShowcasePulls(setId, pack)
    setError('')
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
    setShowRevealHint(false)
    setView('sleeve')
    setIsSleeveOpening(false)
    setIsTransitioning(false)
    setSwipeDirection(1)
  }

  function revealNext(direction: 1 | -1 = 1) {
    if (view !== 'opening' || currentPack.length === 0 || isTransitioning || isSpotlightMoment) return
    markRevealInteraction()
    if (revealIndex >= currentPack.length - 1) {
      setView('summary')
      return
    }
    setHasInteracted(true)
    const progress = (revealIndex + 1) / Math.max(1, currentPack.length)
    sfxRef.current.drawSlide(0.45 + progress * 0.4)
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
    const openingTone = getPackOpeningTone(currentPack)
    const openingPower = openingTone === 'secret' ? 1 : openingTone === 'ultra' ? 0.86 : openingTone === 'holo' ? 0.72 : 0.58

    setHasInteracted(true)
    sfxRef.current.unlock()
    setRipProgress(1)
    setIsSleeveCharging(true)
    sfxRef.current.ripCharge(openingPower)
    sfxRef.current.packOpenAccent(openingTone)

    sleeveChargeAccentTimeoutRef.current = window.setTimeout(() => {
      sfxRef.current.rustle()
      sleeveChargeAccentTimeoutRef.current = null
    }, 130)

    sleeveChargeTimeoutRef.current = window.setTimeout(() => {
      setIsSleeveCharging(false)
      setIsSleeveRipping(true)
      setIsSleeveOpening(true)
      sfxRef.current.ripSnap(openingPower)
      sfxRef.current.tearOpen(openingPower)
      if (!isMuted && typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([14, 18, 12, 32, 18])
      }
      sleeveChargeTimeoutRef.current = null

      sleeveSnapTimeoutRef.current = window.setTimeout(() => {
        sfxRef.current.whoosh()
        sleeveSnapTimeoutRef.current = null
      }, 64)

      sleeveChargeAccentTimeoutRef.current = window.setTimeout(() => {
        sfxRef.current.rustle()
        sleeveChargeAccentTimeoutRef.current = null
      }, 132)

      sleevePopTimeoutRef.current = window.setTimeout(() => {
        sfxRef.current.packPop(openingPower)
        sleevePopTimeoutRef.current = null
      }, 218)

      sleeveRipTimeoutRef.current = window.setTimeout(() => {
        setIsSleeveRipping(false)
        sleeveRipTimeoutRef.current = null
      }, 500)

      sleeveOpenTimeoutRef.current = window.setTimeout(() => {
        setView('opening')
        setIsSleeveRipping(false)
        setIsSleeveOpening(false)
        setRipProgress(0)
        setIsRipGestureActive(false)
        sleeveOpenTimeoutRef.current = null
      }, 940)
    }, 360)
  }

  function resetRipGesture(shouldResetProgress = true) {
    ripStartRef.current = null
    ripMovedRef.current = false
    setIsRipGestureActive(false)
    setRipCursorX(0.5)
    setRipCursorY(0.32)
    setRipDirectionUi(1)
    if (shouldResetProgress && !isSleeveOpening && !isSleeveRipping) {
      setRipProgress(0)
      ripProgressRef.current = 0
    }
    lastRipSfxAtRef.current = 0
    lastRustleSfxAtRef.current = 0
  }

  function handleSleevePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (isSleeveOpening || isSleeveCharging || isSleeveRipping) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = (event.clientX - rect.left) / rect.width
    const ny = (event.clientY - rect.top) / rect.height

    if (ny < RIP_SEAM_MIN_Y || ny > RIP_SEAM_MAX_Y) {
      setIsRipGestureActive(false)
      setRipProgress(0)
      return
    }

    const ripDirection: 1 | -1 = nx <= RIP_MIDPOINT_X ? 1 : -1

    event.currentTarget.setPointerCapture(event.pointerId)
    setRipCursorX((event.clientX - rect.left) / rect.width)
    setRipCursorY((event.clientY - rect.top) / rect.height)
    ripStartRef.current = { x: event.clientX, y: event.clientY, nx, ny }
    ripDirectionRef.current = ripDirection
    setRipDirectionUi(ripDirection)
    ripMovedRef.current = false
    lastRipSfxProgressRef.current = 0
    lastRustleSfxProgressRef.current = 0
    lastRipSfxAtRef.current = 0
    lastRustleSfxAtRef.current = 0
    setIsRipGestureActive(true)
    const initialTrack = ripDirection === 1
      ? Math.min(1, Math.max(0, (nx - RIP_TRACK_START_X) / (RIP_TRACK_END_X - RIP_TRACK_START_X)))
      : Math.min(1, Math.max(0, (RIP_TRACK_END_X - nx) / (RIP_TRACK_END_X - RIP_TRACK_START_X)))
    setRipProgress(initialTrack)
    ripProgressRef.current = initialTrack
    setHasInteracted(true)
    sfxRef.current.unlock()
    sfxRef.current.tap()
    sfxRef.current.ripCharge()
  }

  function handleSleevePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (isSleeveOpening || isSleeveCharging || isSleeveRipping) return

    const rect = event.currentTarget.getBoundingClientRect()
    sleeveMxRaw.set((event.clientX - rect.left) / rect.width - 0.5)
    sleeveMxRawY.set((event.clientY - rect.top) / rect.height - 0.5)
    setRipCursorX((event.clientX - rect.left) / rect.width)
    setRipCursorY((event.clientY - rect.top) / rect.height)

    if (!isRipGestureActive || !ripStartRef.current) return

    const deltaX = Math.abs(event.clientX - ripStartRef.current.x)
    const nx = (event.clientX - rect.left) / rect.width
    const ny = (event.clientY - rect.top) / rect.height
    const rawTrackProgress = ripDirectionRef.current === 1
      ? Math.min(1, Math.max(0, (nx - RIP_TRACK_START_X) / (RIP_TRACK_END_X - RIP_TRACK_START_X)))
      : Math.min(1, Math.max(0, (RIP_TRACK_END_X - nx) / (RIP_TRACK_END_X - RIP_TRACK_START_X)))
    const seamCenter = 0.36
    const seamAdherence = Math.max(0.64, 1 - Math.abs(ny - seamCenter) / 0.3)
    const isBacktracking = ripDirectionRef.current === 1
      ? event.clientX < ripStartRef.current.x - 22
      : event.clientX > ripStartRef.current.x + 22
    const backtrackPenalty = isBacktracking ? 0.82 : 1
    const progressCandidate = rawTrackProgress * seamAdherence * backtrackPenalty
    const progress = Math.min(1, Math.max(ripProgressRef.current * 0.92, progressCandidate))
    const previousProgress = lastRipSfxProgressRef.current
    setRipProgress(progress)
    ripProgressRef.current = progress
    if (deltaX > 8) ripMovedRef.current = true

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (progress - lastRipSfxProgressRef.current >= 0.06 && nowMs - lastRipSfxAtRef.current >= 52) {
      sfxRef.current.ripDrag(progress)
      lastRipSfxProgressRef.current = progress
      lastRipSfxAtRef.current = nowMs
    }

    if (progress - lastRustleSfxProgressRef.current >= 0.14 && nowMs - lastRustleSfxAtRef.current >= 120) {
      sfxRef.current.rustle()
      lastRustleSfxProgressRef.current = progress
      lastRustleSfxAtRef.current = nowMs
    }

    if (previousProgress < 0.32 && progress >= 0.32) {
      sfxRef.current.ripStretch(0.55)
    }
    if (previousProgress < 0.62 && progress >= 0.62) {
      sfxRef.current.ripStretch(0.92)
    }

    if (progress >= 0.9) {
      sleeveGestureConsumedRef.current = true
      resetRipGesture(false)
      startSleeveOpen()
    }
  }

  function handleSleevePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (!isRipGestureActive) {
      resetRipGesture()
      return
    }

    if (ripProgressRef.current >= RIP_RELEASE_THRESHOLD) {
      sleeveGestureConsumedRef.current = true
      resetRipGesture(false)
      startSleeveOpen()
      return
    }

    resetRipGesture(true)
  }

  function toggleMuted() {
    const next = !isMuted
    setIsMuted(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('riprealm-sound-muted', next ? '1' : '0')
    }
    if (!next) {
      sfxRef.current.unlock()
      sfxRef.current.tap()
    }
  }

  function onCardDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    markRevealInteraction()
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

  function handlePackTypeChange(value: PackType) {
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
            <h2 className="landing-title">Rip. Reveal. Repeat.</h2>
            <p className="landing-text">Load the sleeve, swipe through six pulls, and review your best hit.</p>
            {shouldCollapseText && <p className="landing-text compact-caption">Swipe-ready view enabled</p>}
            <button className="ghost-button sound-toggle" onClick={toggleMuted}>
              {isMuted ? 'Sound: Off' : 'Sound: On'}
            </button>
          </div>

          <div className="landing-grid landing-grid-focus">
            <div className="landing-card landing-card-focus">
              <PackSelector
                setId={setId}
                onSetIdChange={handleSetIdChange}
                packType={packType}
                onPackTypeChange={handlePackTypeChange}
                packTypePanel={
                  <div className="selected-pack-card selected-pack-card-inline selected-pack-card-side">
                    <div className="selected-pack-inline-main">
                      <div className="selected-pack-art selected-pack-art-inline" aria-hidden="true">
                        <div className="selected-pack-glow" />
                        <div className="selected-pack-sleeve selected-pack-sleeve-inline">
                          {setLogo
                            ? <img src={setLogo} alt={setDisplayName} className="selected-pack-logo" draggable={false} />
                            : <span>{setDisplayName}</span>
                          }
                        </div>
                      </div>

                      <div className="selected-pack-copy-block">
                        <div className="selected-pack-topline">Selected pack</div>
                        <div className="selected-pack-title">{packTypeLabel}</div>
                        <div className="selected-pack-subtitle">{setDisplayName}</div>
                        <div className="selected-pack-system">Set Type: {setTypeLabel}</div>
                        <div className="selected-pack-tag-row">
                          <span className="selected-pack-tag">{packOpenCost} coins</span>
                          <span className="selected-pack-tag">6 cards per pack</span>
                        </div>
                      </div>
                    </div>

                    <div className="pack-stat-list selected-pack-stat-grid">
                      <div className="pack-stat"><span>Base cards</span><strong>{baseMixLabel}</strong></div>
                      <div className="pack-stat"><span>Hit ladder</span><strong>{isPocketSet ? POCKET_LADDER_DISPLAY : MAINLINE_LADDER_DISPLAY}</strong></div>
                      <div className="pack-stat"><span>Reverse finish</span><strong>{reverseFinishLabel}</strong></div>
                    </div>
                  </div>
                }
              />

              <button className="button landing-open-button" onClick={preparePack} disabled={loading || pool.length === 0 || !canAffordPack}>
                {loading ? 'Loading Cards...' : 'Load Pack Sleeve'}
              </button>

              <div className="status-panel">
                <div className="status-text">
                  {loading ? 'Loading cards...' : pool.length ? `${pool.length} cards ready` : 'No cards loaded'}
                  {dataSource && <span className="status-badge">({dataSource})</span>}
                </div>
                {error && <div className="error-text">Error: {error}</div>}
              </div>

              <div className="economy-panel">
                <div className="economy-row">
                  <span>Coins</span>
                  <strong>{formatCoins(progression.currency)}</strong>
                </div>
                <div className="economy-row">
                  <span>Pack cost</span>
                  <strong>{packOpenCost}</strong>
                </div>
                {!canAffordPack && <div className="economy-note">Earn more coins from higher-rarity pulls and duplicate exchanges.</div>}
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
              {!shouldCollapseText && <p>Start from the left side and drag across the top seam to the right.</p>}
            </div>

            <motion.button
              type="button"
              className={`sleeve-stage ${isSleeveCharging ? 'is-charging' : ''} ${isSleeveRipping ? 'is-ripping' : ''} ${isSleeveOpening ? 'is-opening' : ''} ${ripProgress > 0 ? 'is-rip-primed' : ''}`}
              disabled={isSleeveOpening || isSleeveCharging || isSleeveRipping}
              whileHover={{ scale: isSleeveOpening ? 1 : 1.012 }}
              whileTap={{ scale: isSleeveOpening ? 1 : 0.99 }}
              animate={
                isSleeveOpening
                  ? { rotateZ: [0, -3.2, 2.6, -1.4, 0.3, 0], scale: [1, 1.06, 1.015, 1.03, 1], y: [0, -2, 1, -1, 0] }
                  : isSleeveCharging
                  ? { rotateZ: [0, -1.2, 1.1, -0.8, 0.5, -0.2, 0], scale: [1, 1.035, 1.015, 1.045, 1.01], y: [0, -1, 0, -1, 0] }
                    : { rotateZ: ripProgress * -1.6, scale: 1 + ripProgress * 0.03, y: ripProgress * -1.5 }
              }
              transition={{ duration: isSleeveCharging ? 0.36 : 0.62, ease: [0.2, 0.9, 0.25, 1] }}
              aria-label="Open pack sleeve"
              onPointerDown={handleSleevePointerDown}
              onPointerMove={handleSleevePointerMove}
              onPointerUp={handleSleevePointerUp}
              onPointerCancel={handleSleevePointerUp}
              onPointerLeave={() => {
                sleeveMxRaw.set(0)
                sleeveMxRawY.set(0)
              }}
              style={{ ['--rip-progress' as any]: ripProgress, ['--rip-cx' as any]: ripCursorX, ['--rip-cy' as any]: ripCursorY }}
            >
              <motion.div
                className="sleeve-charge-aura"
                animate={isSleeveCharging ? { opacity: [0.12, 0.56, 0.22, 0.62, 0.18], scale: [0.9, 1.03, 0.96, 1.08, 1] } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
              <motion.div
                className="sleeve-rip-impact"
                animate={isSleeveRipping ? { opacity: [0, 1, 0.3, 0], scale: [0.56, 1.16, 1.22, 1.34] } : { opacity: 0, scale: 0.56 }}
                transition={{ duration: 0.44, ease: 'easeOut' }}
              />
              <motion.div
                className="sleeve-rip-glow"
                animate={isSleeveRipping ? { opacity: [0, 1, 0.45, 0], scale: [0.76, 1.05, 1.02, 1.08] } : { opacity: 0, scale: 0.76 }}
                transition={{ duration: 0.42, ease: 'easeOut' }}
              />
              <div className="sleeve-rip-shards" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <motion.div
                className="sleeve-shell"
                animate={isSleeveOpening ? { y: [0, 14, 24], rotateZ: [0, -1.5, 0.8, 0], scale: [1, 1.025, 1] } : isSleeveCharging ? { y: [-6, -2, -8, -3], rotateZ: [0, -0.6, 0.45, -0.3] } : { y: 0, rotateZ: 0, scale: 1 }}
                transition={{ duration: 0.58, ease: [0.2, 0.9, 0.25, 1] }}
                style={{ rotateX: sleeveRotX, rotateY: sleeveRotY, transformPerspective: 900 }}
              >
                <div className={`sleeve-trace-ui ${isRipGestureActive || ripProgress > 0 ? 'is-active' : ''} ${ripDirectionUi === -1 ? 'is-rtl' : ''}`} aria-hidden="true">
                  <div className="sleeve-trace-label">Trace seam to rip</div>
                  <div className="sleeve-trace-rail">
                    <div className="sleeve-trace-fill" />
                    <div className="sleeve-trace-cursor" />
                  </div>
                  <span className="sleeve-trace-dot sleeve-trace-dot-start" />
                  <span className="sleeve-trace-dot sleeve-trace-dot-end" />
                </div>
                <div className="sleeve-pocket" aria-hidden="true">
                  <motion.div
                    className="sleeve-deck"
                    animate={isSleeveOpening ? { y: [56, 28, -22, -210], opacity: [0.98, 1, 1, 1], scale: [0.98, 1.04, 1.02, 1], rotateZ: [0, -1, 0.5, 0] } : isSleeveCharging ? { y: [56, 48, 44, 46], opacity: 1, scale: [1, 1.012, 1.016, 1.012] } : { y: 56, opacity: 0.98, scale: 0.98, rotateZ: 0 }}
                    transition={{ duration: 0.72, delay: isSleeveOpening ? 0.08 : 0, ease: [0.18, 0.84, 0.32, 1] }}
                  >
                    <img src="/card-back.png" alt="deck" className="deck-back" />
                  </motion.div>
                </div>
                <motion.div className="sleeve-flap" animate={isSleeveOpening ? { x: [0, 14, 24, 34], y: [0, -1, -2, -2], scaleX: [1, 1.07, 1.1, 1.12], opacity: [1, 0.95, 0.72, 0.45] } : { x: ripProgress * 2.2, y: 0, scaleX: 1 + ripProgress * 0.02, opacity: 0.92 + ripProgress * 0.08 }} transition={{ duration: isSleeveOpening ? 0.42 : 0.1, ease: [0.2, 1, 0.28, 1] }} />
                <motion.div className="sleeve-rip" animate={isSleeveOpening ? { scaleX: [0.12, 1.24, 1.08, 0.94], opacity: [0.24, 1, 0.92, 0.75], y: [0, -3, -1, 0], rotate: [0, -1.5, 1, 0] } : { scaleX: 0.14 + ripProgress * 0.96, opacity: 0.52 + ripProgress * 0.36, y: -ripProgress * 1.1, rotate: 0 }} transition={{ duration: isSleeveOpening ? 0.4 : 0.1, delay: isSleeveOpening ? 0.05 : 0, ease: 'easeOut' }} />
                <motion.div className="sleeve-foil-sheen" animate={isSleeveOpening ? { x: ['-120%', '36%', '160%'], opacity: [0, 0.95, 0] } : { x: '-120%', opacity: 0 }} transition={{ duration: 0.64, delay: isSleeveOpening ? 0.08 : 0, ease: 'easeOut' }} />
                <div className="sleeve-crimp sleeve-crimp-top" aria-hidden="true" />
                <div className="sleeve-crimp sleeve-crimp-bottom" aria-hidden="true" />
                <div className="sleeve-tear-notch" aria-hidden="true" />
                <motion.div
                  className="sleeve-mouth-cover"
                  animate={isSleeveOpening ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: isSleeveOpening ? 0.16 : 0 }}
                />
                <div className="sleeve-body">
                  <div className="sleeve-foil-wrinkle" aria-hidden="true" />
                  <div className="sleeve-foil-crease" aria-hidden="true" />
                  {setLogo
                    ? <img src={setLogo} alt={setDisplayName} className="sleeve-logo" draggable={false} />
                    : <div className="sleeve-brand">{setDisplayName}</div>
                  }
                  <div className="sleeve-packtype">{packTypeLabel}</div>
                  <div className="sleeve-hint">{isSleeveRipping ? 'Ripping...' : isSleeveCharging ? 'Charging...' : ripProgress > 0 ? 'Keep tracing across seam' : 'Drag left ↔ right on seam'}</div>
                </div>
              </motion.div>
            </motion.button>

            <button
              type="button"
              className="ghost-button sleeve-quick-open"
              onClick={startSleeveOpen}
              disabled={isSleeveOpening || isSleeveCharging || isSleeveRipping}
            >
              Quick Open
            </button>
          </div>
        </section>
      )}

      {hasActiveOpening && visibleCard && (
        <section className={`flow-shell opening-view-shell premium-stage premium-stage-opening premium-tone-${currentHighlight.tone} opening-hit-tone-${currentHighlight.tone} ${isSpotlightMoment ? 'opening-spotlight' : ''} ${isSpotlightMoment && isBigHitTone ? 'opening-big-hit' : ''} ${isTransitioning ? 'opening-is-transitioning' : ''}`}>
          <motion.div
            className={`reveal-tone-wash reveal-tone-${currentHighlight.tone}`}
            initial={false}
            animate={{ opacity: revealToneWashOpacity }}
            transition={{ duration: revealToneWashDuration, ease: [0.2, 0.9, 0.25, 1] }}
          />
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
              <div className={`jackpot-aura jackpot-aura-${currentHighlight.tone}`} />
              <div className={`jackpot-flash jackpot-flash-${currentHighlight.tone}`} />
              <div className={`jackpot-rings jackpot-rings-${currentHighlight.tone}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className={`jackpot-sparks jackpot-sparks-${currentHighlight.tone}`} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
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
            <div className="opening-draw-trails" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            {!shouldCollapseText && <div className="opening-hint">Swipe left or right, or tap the card to reveal the next pull</div>}
            {isSpotlightMoment && currentHighlight.label && (
              <motion.div
                className={`spotlight-pill spotlight-pill-${currentHighlight.tone}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.2, 0.9, 0.25, 1] }}
              >
                {currentHighlight.tone === 'secret' ? 'Secret Spotlight' : 'Ultra Spotlight'}
              </motion.div>
            )}
            {currentHighlight.label && isCardFaceUp && (
              <motion.div
                className={`reveal-banner reveal-banner-${currentHighlight.tone}`}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.2, 0.9, 0.25, 1] }}
              >
                {currentHighlight.label}
              </motion.div>
            )}
            <AnimatePresence mode="wait">
              {isCardFaceUp && visibleCardReward > 0 && (
                <motion.div
                  key={`${visibleCard.id}-${revealIndex}-${visibleCardReward}`}
                  className={`pull-reward-float pull-reward-${visibleRewardTone}`}
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 1.04 }}
                  transition={{ duration: 0.32, ease: [0.2, 0.9, 0.25, 1] }}
                >
                  +{visibleCardReward} coins
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className="opening-stack-hitbox"
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }
                markRevealInteraction()
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
                    markRevealInteraction()
                    suppressClickRef.current = true
                  }}
                  onDragEnd={onCardDragEnd}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.24, ease: [0.2, 0.9, 0.25, 1] }}
                  className={`opening-current-card ${isSpotlightMoment && isBigHitTone ? 'dramatic-hit' : ''} ${isRevealSuspense ? 'is-suspense' : ''}`}
                >
                  <motion.div className={`card-burst card-burst-${currentHighlight.tone}`} style={{ opacity: dragGlow }} />
                  <div className="opening-flip-shell">
                    <motion.div
                      className="opening-flip-card"
                      animate={{ rotateY: isCardFaceUp ? 180 : 0 }}
                      transition={{ duration: revealFlipDuration, ease: [0.2, 0.9, 0.25, 1] }}
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
                        {specialOverlayClass(visibleCard.special, setId, visibleCard) && (
                          <div className={specialOverlayClass(visibleCard.special, setId, visibleCard)!} />
                        )}
                        {(visibleCard.isReverse || (visibleCard as any).variants?.reverse) && (
                          <div className="card-badge card-badge-right">Reverse</div>
                        )}
                        {specialBadge(visibleCard.special) && (
                          <div className={`card-badge ${specialBadge(visibleCard.special)!.cls}`}>
                            {specialBadge(visibleCard.special)!.text}
                          </div>
                        )}
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
                {visibleCard.special ? ` • ${specialLabel(visibleCard.special)}` : ''}
              </div>
              {visibleCardReward > 0 && <div className="opening-card-reward">Card Reward: +{visibleCardReward} coins</div>}
              {showRevealHint && remainingCards > 0 && (
                <div className="reveal-helper">Swipe or tap the card to reveal the next one.</div>
              )}
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

            {lastPackEconomy && (
              <motion.div
                className="summary-ceremony"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <div className="summary-ceremony-total">
                  <span>Total Rewards</span>
                  <strong>+{formatCoins(summaryRewardCount)} coins</strong>
                </div>
                <div className="summary-ceremony-grid">
                  <div className="summary-ceremony-chip">
                    <span>New Cards</span>
                    <strong>{lastPackEconomy.newCardsCount}</strong>
                  </div>
                  <div className="summary-ceremony-chip">
                    <span>Highest Rarity</span>
                    <strong>{bestPullHighlight.label || 'Base Pull'}</strong>
                  </div>
                  <div className="summary-ceremony-chip">
                    <span>Mission Progress</span>
                    <strong>+{lastPackEconomy.missionReward}</strong>
                  </div>
                  <div className="summary-ceremony-chip">
                    <span>Pack Net</span>
                    <strong className={summaryNetCount >= 0 ? 'is-positive' : 'is-negative'}>
                      {summaryNetCount >= 0 ? '+' : ''}{formatCoins(summaryNetCount)}
                    </strong>
                  </div>
                </div>
                <div className="summary-rarity-row">
                  <div className="summary-rarity-chip">Base {summaryRarityBreakdown.base}</div>
                  <div className="summary-rarity-chip is-holo">Holo {summaryRarityBreakdown.holo}</div>
                  <div className="summary-rarity-chip is-ultra">Ultra {summaryRarityBreakdown.ultra}</div>
                  <div className="summary-rarity-chip is-secret">Secret {summaryRarityBreakdown.secret}</div>
                </div>
                <div className="summary-new-row">
                  <span>New Spotlight</span>
                  <strong>{newCardHighlights.length ? newCardHighlights.join(' • ') : 'No new cards this pack'}</strong>
                </div>
              </motion.div>
            )}

            {lastPackEconomy && (
              <div className="pack-economy-summary">
                <div className="pack-econ-pill">Cost: -{lastPackEconomy.packCost}</div>
                <div className="pack-econ-pill">Card rewards: +{lastPackEconomy.cardReward}</div>
                <div className="pack-econ-pill">Mission rewards: +{lastPackEconomy.missionReward}</div>
                <div className="pack-econ-pill">New cards: {lastPackEconomy.newCardsCount}</div>
                <div className={`pack-econ-pill pack-econ-total ${lastPackEconomy.currencyDelta >= 0 ? 'is-positive' : 'is-negative'}`}>
                  Net: {summaryNetCount >= 0 ? '+' : ''}{summaryNetCount}
                </div>
                <div className="pack-econ-balance">Balance: {formatCoins(lastPackEconomy.currencyAfter)} coins</div>
              </div>
            )}

            {bestPull && (
              <motion.div
                className={`best-pull-spotlight best-pull-${bestPullHighlight.tone}`}
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.38, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <div
                  className="best-pull-card clickable-card"
                  onClick={() =>
                    setFocusCard({
                      name: bestPull.name,
                      image: bestPull.images?.large || bestPull.images?.small,
                      subtitle: `${bestPull.rarity || 'Common'}${bestPull.isReverse ? ' • Reverse' : ''}${bestPull.isHolo ? ' • Holo' : ''}${bestPull.special ? ` • ${specialLabel(bestPull.special)}` : ''}`,
                      isHolo: Boolean(bestPull.isHolo || (bestPull as any).variants?.holo),
                      isReverse: Boolean(bestPull.isReverse || (bestPull as any).variants?.reverse),
                      overlayClass: specialOverlayClass(bestPull.special, setId, bestPull),
                      specialBadgeText: specialBadge(bestPull.special)?.text || null,
                      specialBadgeClass: specialBadge(bestPull.special)?.cls || null,
                    })
                  }
                >
                  <motion.div
                    className={`best-pull-crown crown-${bestPullHighlight.tone}`}
                    initial={{ opacity: 0, y: -8, scale: 0.84, rotate: -8 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.34, delay: 0.18, ease: [0.2, 0.9, 0.25, 1] }}
                    aria-hidden="true"
                  >
                    Crown Pick
                  </motion.div>
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
                    {bestPull.special ? ` • ${specialLabel(bestPull.special)}` : ''}
                  </p>
                </div>
              </motion.div>
            )}

            <div className="summary-actions">
              <button className="button" onClick={preparePack} disabled={!canAffordPack}>Open Another Pack</button>
              <button className="ghost-button" onClick={() => resetFlow('select')}>Select New Set</button>
            </div>

            <div className="opened-grid summary-grid">
              {currentPack.map((c, i) => {
                const isNewCard = Boolean(currentPackNewFlags[i])
                const cardReward = getCardPullReward(c.rarity, c.special)
                const cardRewardTone = getRewardTone(cardReward)
                return (
                  <motion.div
                  key={`${c.id}-${i}`}
                  custom={i}
                  variants={fanVariants}
                  initial="hidden"
                  animate="visible"
                  className={`card-shell clickable-card ${isNewCard ? 'is-new-card-shell' : ''}`}
                  onClick={() =>
                    setFocusCard({
                      name: c.name,
                      image: c.images?.large || c.images?.small,
                      subtitle: `${c.rarity || 'Common'}${c.isReverse ? ' • Reverse' : ''}${c.isHolo ? ' • Holo' : ''}${c.special ? ` • ${specialLabel(c.special)}` : ''}`,
                      isHolo: Boolean(c.isHolo || (c as any).variants?.holo),
                      isReverse: Boolean(c.isReverse || (c as any).variants?.reverse),
                      overlayClass: specialOverlayClass(c.special, setId, c),
                      specialBadgeText: specialBadge(c.special)?.text || null,
                      specialBadgeClass: specialBadge(c.special)?.cls || null,
                    })
                  }
                >
                  <div className={`summary-card-face ${isNewCard ? 'is-new-card-face' : ''}`}>
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
                    {specialOverlayClass(c.special, setId, c) && <div className={specialOverlayClass(c.special, setId, c)!} />}
                    {(c.isReverse || (c as any).variants?.reverse) && <div className="card-badge card-badge-right">Reverse</div>}
                    {specialBadge(c.special) && (
                      <div className={`card-badge ${specialBadge(c.special)!.cls}`}>
                        {specialBadge(c.special)!.text}
                      </div>
                    )}
                    {isNewCard && <div className="card-badge card-badge-new">New</div>}
                  </div>
                  <div className="card-name">{c.name}</div>
                  <div className="card-meta">{c.rarity || 'Common'}{c.isReverse ? ' • Reverse' : ''}{c.isHolo ? ' • Holo' : ''}{c.special ? ` • ${specialLabel(c.special)}` : ''}</div>
                  {cardReward > 0 && <div className={`card-reward-pill card-reward-${cardRewardTone}`}>+{cardReward} coins</div>}
                </motion.div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <CardZoomModal
        open={Boolean(focusCard)}
        imageSrc={focusCard?.image}
        title={focusCard?.name || 'Card'}
        subtitle={focusCard?.subtitle}
        isHolo={focusCard?.isHolo}
        isReverse={focusCard?.isReverse}
        overlayClass={focusCard?.overlayClass}
        specialBadgeText={focusCard?.specialBadgeText}
        specialBadgeClass={focusCard?.specialBadgeClass}
        onClose={() => setFocusCard(null)}
      />

      <div className="achievement-toast-stack" aria-live="polite" aria-label="Achievement unlocked notifications">
        <AnimatePresence>
          {achievementToasts.map((toast) => (
            <motion.div
              key={toast.id}
              className="achievement-toast"
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <span className="achievement-toast-tag">Achievement Unlocked</span>
              <strong>{toast.label}</strong>
              <p>{toast.description}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

