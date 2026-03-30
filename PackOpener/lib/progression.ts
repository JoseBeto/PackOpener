import type { Card } from './simulator'
import { getRarityRank } from './showcase'

export const PROGRESSION_STORAGE_KEY = 'po_progression_v1'
export const PROGRESSION_EVENT = 'po-progression-changed'
export const STANDARD_PACK_OPEN_COST = 100
export const PREMIUM_PACK_OPEN_COST = 200
export const PACK_OPEN_COST = STANDARD_PACK_OPEN_COST
export const DAILY_CHECKIN_REWARD = 1000
export type PackType = 'standard' | 'premium'

export function getPackOpenCost(packType: PackType): number {
  return packType === 'premium' ? PREMIUM_PACK_OPEN_COST : STANDARD_PACK_OPEN_COST
}

export function getMsUntilNextDailyReset(now = new Date()): number {
  const nextUtcHalfDay = new Date(now.getTime())
  nextUtcHalfDay.setUTCMinutes(0, 0, 0)
  const currentHour = nextUtcHalfDay.getUTCHours()
  if (currentHour < 12) {
    nextUtcHalfDay.setUTCHours(12)
  } else {
    nextUtcHalfDay.setUTCHours(24)
  }
  return Math.max(0, nextUtcHalfDay.getTime() - now.getTime())
}

export type MissionKind = 'daily' | 'weekly'

export type MissionDefinition = {
  id: string
  kind: MissionKind
  label: string
  target: number
  reward: number
  metric: 'packsOpened' | 'goodPulls' | 'elitePulls' | 'distinctSetsOpened'
}

export type MissionProgress = {
  progress: number
  completed: boolean
  claimed: boolean
}

export type ProgressionState = {
  currency: number
  collection: Record<string, number>
  stats: {
    lifetimePacksOpened: number
    lifetimeGoodPulls: number
    lifetimeElitePulls: number
    totalCoinsEarned: number
    godPacksOpened: number
    checkInStreak: number
    lastCheckInKey: string
  }
  daily: {
    key: string
    checkInClaimed: boolean
    missions: Record<string, MissionProgress>
  }
  weekly: {
    key: string
    missions: Record<string, MissionProgress>
    distinctSetsOpened: string[]
  }
}

export type MissionStatus = MissionDefinition & {
  progress: number
  completed: boolean
  claimed: boolean
}

export type PackProgressionOutcome = {
  nextState: ProgressionState
  currencyDelta: number
  packCost: number
  cardReward: number
  missionReward: number
  totalReward: number
  newCardFlags: boolean[]
  newCardsCount: number
  notAffordable: boolean
}

export type DailyCheckInOutcome = {
  nextState: ProgressionState
  claimed: boolean
  reward: number
}

export type ExchangeCardOutcome = {
  nextState: ProgressionState
  success: boolean
  reward: number
}

const DAILY_MISSIONS: MissionDefinition[] = [
  { id: 'daily-open-3', kind: 'daily', label: 'Open 3 packs', target: 3, reward: 150, metric: 'packsOpened' },
  { id: 'daily-good-2', kind: 'daily', label: 'Pull 2 good cards', target: 2, reward: 120, metric: 'goodPulls' },
  { id: 'daily-elite-1', kind: 'daily', label: 'Pull 1 elite hit', target: 1, reward: 180, metric: 'elitePulls' },
]

const WEEKLY_MISSIONS: MissionDefinition[] = [
  { id: 'weekly-open-20', kind: 'weekly', label: 'Open 20 packs', target: 20, reward: 900, metric: 'packsOpened' },
  { id: 'weekly-good-10', kind: 'weekly', label: 'Pull 10 good cards', target: 10, reward: 700, metric: 'goodPulls' },
  { id: 'weekly-elite-4', kind: 'weekly', label: 'Pull 4 elite hits', target: 4, reward: 800, metric: 'elitePulls' },
  { id: 'weekly-sets-5', kind: 'weekly', label: 'Open packs from 5 sets', target: 5, reward: 600, metric: 'distinctSetsOpened' },
]

function toDailyPeriodKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const period = date.getUTCHours() < 12 ? 'A' : 'B'
  return `${y}-${m}-${d}-${period}`
}

function toWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function fromDateKey(key?: string): Date | null {
  if (!key) return null
  const periodMatch = key.match(/^(\d{4})-(\d{2})-(\d{2})-([AB])$/)
  if (periodMatch) {
    const hour = periodMatch[4] === 'B' ? 12 : 0
    return new Date(Date.UTC(Number(periodMatch[1]), Number(periodMatch[2]) - 1, Number(periodMatch[3]), hour))
  }

  // Legacy key support from older daily-at-midnight format.
  const legacyMatch = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!legacyMatch) return null
  return new Date(Date.UTC(Number(legacyMatch[1]), Number(legacyMatch[2]) - 1, Number(legacyMatch[3]), 0))
}

function diffDaysFromKeys(previousKey: string, nextKey: string): number | null {
  const prev = fromDateKey(previousKey)
  const next = fromDateKey(nextKey)
  if (!prev || !next) return null
  const diff = Math.floor((next.getTime() - prev.getTime()) / (12 * 60 * 60 * 1000))
  return Number.isFinite(diff) ? diff : null
}

function isGodPackLike(pack: Card[]): boolean {
  if (!pack.length) return false
  return pack.every((card) => getRarityRank(card.rarity, card.special) >= 5)
}

function makeMissionMap(defs: MissionDefinition[]): Record<string, MissionProgress> {
  return defs.reduce<Record<string, MissionProgress>>((acc, mission) => {
    acc[mission.id] = { progress: 0, completed: false, claimed: false }
    return acc
  }, {})
}

function cloneMissionMap(map: Record<string, MissionProgress>): Record<string, MissionProgress> {
  return Object.entries(map).reduce<Record<string, MissionProgress>>((acc, [id, m]) => {
    acc[id] = { progress: m.progress, completed: m.completed, claimed: m.claimed }
    return acc
  }, {})
}

export function createDefaultProgressionState(date = new Date()): ProgressionState {
  const dayKey = toDailyPeriodKey(date)
  return {
    currency: 1000,
    collection: {},
    stats: {
      lifetimePacksOpened: 0,
      lifetimeGoodPulls: 0,
      lifetimeElitePulls: 0,
      totalCoinsEarned: 0,
      godPacksOpened: 0,
      checkInStreak: 0,
      lastCheckInKey: dayKey,
    },
    daily: {
      key: toDailyPeriodKey(date),
      checkInClaimed: false,
      missions: makeMissionMap(DAILY_MISSIONS),
    },
    weekly: {
      key: toWeekKey(date),
      missions: makeMissionMap(WEEKLY_MISSIONS),
      distinctSetsOpened: [],
    },
  }
}

export function normalizeProgressionState(input: unknown, now = new Date()): ProgressionState {
  const fallback = createDefaultProgressionState(now)
  if (!input || typeof input !== 'object') return fallback

  const raw = input as Partial<ProgressionState>
  const next: ProgressionState = {
    currency: typeof raw.currency === 'number' && Number.isFinite(raw.currency) ? Math.max(0, Math.floor(raw.currency)) : fallback.currency,
    collection: raw.collection && typeof raw.collection === 'object' ? { ...raw.collection } : {},
    stats: {
      lifetimePacksOpened: Math.max(0, Math.floor(raw.stats?.lifetimePacksOpened || 0)),
      lifetimeGoodPulls: Math.max(0, Math.floor(raw.stats?.lifetimeGoodPulls || 0)),
      lifetimeElitePulls: Math.max(0, Math.floor(raw.stats?.lifetimeElitePulls || 0)),
      totalCoinsEarned: Math.max(0, Math.floor(raw.stats?.totalCoinsEarned || 0)),
      godPacksOpened: Math.max(0, Math.floor(raw.stats?.godPacksOpened || 0)),
      checkInStreak: Math.max(0, Math.floor(raw.stats?.checkInStreak || 0)),
      lastCheckInKey: typeof raw.stats?.lastCheckInKey === 'string' ? raw.stats.lastCheckInKey : fallback.stats.lastCheckInKey,
    },
    daily: {
      key: typeof raw.daily?.key === 'string' ? raw.daily.key : fallback.daily.key,
      checkInClaimed: Boolean(raw.daily?.checkInClaimed),
      missions: makeMissionMap(DAILY_MISSIONS),
    },
    weekly: {
      key: typeof raw.weekly?.key === 'string' ? raw.weekly.key : fallback.weekly.key,
      missions: makeMissionMap(WEEKLY_MISSIONS),
      distinctSetsOpened: Array.isArray(raw.weekly?.distinctSetsOpened)
        ? raw.weekly!.distinctSetsOpened.filter((v): v is string => typeof v === 'string').slice(0, 64)
        : [],
    },
  }

  for (const mission of DAILY_MISSIONS) {
    const src = raw.daily?.missions?.[mission.id]
    if (src) {
      next.daily.missions[mission.id] = {
        progress: Math.max(0, Math.floor(src.progress || 0)),
        completed: Boolean(src.completed),
        claimed: Boolean(src.claimed),
      }
    }
  }

  for (const mission of WEEKLY_MISSIONS) {
    const src = raw.weekly?.missions?.[mission.id]
    if (src) {
      next.weekly.missions[mission.id] = {
        progress: Math.max(0, Math.floor(src.progress || 0)),
        completed: Boolean(src.completed),
        claimed: Boolean(src.claimed),
      }
    }
  }

  return applyPeriodResets(next, now)
}

export function loadProgressionState(now = new Date()): ProgressionState {
  if (typeof window === 'undefined') return createDefaultProgressionState(now)
  try {
    const raw = window.localStorage.getItem(PROGRESSION_STORAGE_KEY)
    if (!raw) return createDefaultProgressionState(now)
    return normalizeProgressionState(JSON.parse(raw), now)
  } catch {
    return createDefaultProgressionState(now)
  }
}

export function saveProgressionState(state: ProgressionState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent(PROGRESSION_EVENT))
  } catch {
    // ignore storage errors for private mode or quota issues
  }
}

export function applyPeriodResets(state: ProgressionState, now = new Date()): ProgressionState {
  const dayKey = toDailyPeriodKey(now)
  const weekKey = toWeekKey(now)

  let next = state

  if (next.daily.key !== dayKey) {
    next = {
      ...next,
      daily: {
        key: dayKey,
        checkInClaimed: false,
        missions: makeMissionMap(DAILY_MISSIONS),
      },
    }
  }

  if (next.weekly.key !== weekKey) {
    next = {
      ...next,
      weekly: {
        key: weekKey,
        missions: makeMissionMap(WEEKLY_MISSIONS),
        distinctSetsOpened: [],
      },
    }
  }

  return next
}

export function getCardPullReward(rarity?: string, special?: string): number {
  const rank = getRarityRank(rarity, special)
  if (rank >= 10) return 320
  if (rank >= 9) return 260
  if (rank >= 8) return 210
  if (rank >= 7) return 160
  if (rank >= 6) return 125
  if (rank >= 5) return 100
  return 0
}

function getCardCoinReward(card: Card): number {
  return getCardPullReward(card.rarity, card.special)
}

export function getCardExchangeValue(rarity?: string, special?: string): number {
  const rank = getRarityRank(rarity, special)
  if (rank >= 9) return 200
  if (rank >= 8) return 150
  if (rank >= 7) return 120
  if (rank >= 6) return 90
  if (rank >= 5) return 70
  return 30
}

function isGoodPull(card: Card): boolean {
  return getRarityRank(card.rarity, card.special) >= 5
}

function isElitePull(card: Card): boolean {
  return getRarityRank(card.rarity, card.special) >= 7
}

function applyMissionProgress(
  defs: MissionDefinition[],
  missions: Record<string, MissionProgress>,
  metrics: Record<MissionDefinition['metric'], number>,
): { missions: Record<string, MissionProgress>; earned: number } {
  const nextMissions = cloneMissionMap(missions)
  let earned = 0

  for (const mission of defs) {
    const current = nextMissions[mission.id] || { progress: 0, completed: false, claimed: false }
    const nextProgress = Math.min(mission.target, current.progress + (metrics[mission.metric] || 0))
    const completed = current.completed || nextProgress >= mission.target
    let claimed = current.claimed

    if (completed && !claimed) {
      claimed = true
      earned += mission.reward
    }

    nextMissions[mission.id] = {
      progress: nextProgress,
      completed,
      claimed,
    }
  }

  return { missions: nextMissions, earned }
}

export function applyPackProgression(state: ProgressionState, setId: string, pack: Card[], packType: PackType = 'standard', now = new Date()): PackProgressionOutcome {
  const base = applyPeriodResets(state, now)
  const packCost = getPackOpenCost(packType)

  if (base.currency < packCost) {
    return {
      nextState: base,
      currencyDelta: 0,
      packCost,
      cardReward: 0,
      missionReward: 0,
      totalReward: 0,
      newCardFlags: pack.map(() => false),
      newCardsCount: 0,
      notAffordable: true,
    }
  }

  const collection = { ...base.collection }
  const newCardFlags: boolean[] = []
  const seenThisPack: Record<string, number> = {}

  for (const card of pack) {
    const key = `${setId}:${card.id}`
    const ownedBefore = collection[key] || 0
    const seenCount = seenThisPack[key] || 0
    const isNew = ownedBefore + seenCount === 0
    newCardFlags.push(isNew)
    seenThisPack[key] = seenCount + 1
  }

  for (const [key, count] of Object.entries(seenThisPack)) {
    collection[key] = (collection[key] || 0) + count
  }

  const cardReward = pack.reduce((sum, card) => sum + getCardCoinReward(card), 0)
  const packsOpened = 1
  const goodPulls = pack.filter(isGoodPull).length
  const elitePulls = pack.filter(isElitePull).length

  const weeklySetList = base.weekly.distinctSetsOpened.includes(setId)
    ? base.weekly.distinctSetsOpened
    : [...base.weekly.distinctSetsOpened, setId].slice(0, 64)

  const dailyMetrics = {
    packsOpened,
    goodPulls,
    elitePulls,
    distinctSetsOpened: 0,
  }

  const weeklyMetrics = {
    packsOpened,
    goodPulls,
    elitePulls,
    distinctSetsOpened: base.weekly.distinctSetsOpened.includes(setId) ? 0 : 1,
  }

  const dailyUpdate = applyMissionProgress(DAILY_MISSIONS, base.daily.missions, dailyMetrics)
  const weeklyUpdate = applyMissionProgress(WEEKLY_MISSIONS, base.weekly.missions, weeklyMetrics)

  const missionReward = dailyUpdate.earned + weeklyUpdate.earned
  const totalReward = cardReward + missionReward
  const currencyDelta = totalReward - packCost

  const nextState: ProgressionState = {
    ...base,
    currency: Math.max(0, base.currency + currencyDelta),
    collection,
    stats: {
      lifetimePacksOpened: base.stats.lifetimePacksOpened + 1,
      lifetimeGoodPulls: base.stats.lifetimeGoodPulls + goodPulls,
      lifetimeElitePulls: base.stats.lifetimeElitePulls + elitePulls,
      totalCoinsEarned: base.stats.totalCoinsEarned + totalReward,
      godPacksOpened: base.stats.godPacksOpened + (isGodPackLike(pack) ? 1 : 0),
      checkInStreak: base.stats.checkInStreak,
      lastCheckInKey: base.stats.lastCheckInKey,
    },
    daily: {
      ...base.daily,
      missions: dailyUpdate.missions,
    },
    weekly: {
      ...base.weekly,
      missions: weeklyUpdate.missions,
      distinctSetsOpened: weeklySetList,
    },
  }

  return {
    nextState,
    currencyDelta,
    packCost,
    cardReward,
    missionReward,
    totalReward,
    newCardFlags,
    newCardsCount: newCardFlags.filter(Boolean).length,
    notAffordable: false,
  }
}

export function getMissionStatuses(state: ProgressionState): { daily: MissionStatus[]; weekly: MissionStatus[] } {
  const daily = DAILY_MISSIONS.map((mission) => {
    const progress = state.daily.missions[mission.id] || { progress: 0, completed: false, claimed: false }
    return {
      ...mission,
      progress: Math.min(mission.target, progress.progress),
      completed: progress.completed,
      claimed: progress.claimed,
    }
  })

  const weekly = WEEKLY_MISSIONS.map((mission) => {
    const progress = state.weekly.missions[mission.id] || { progress: 0, completed: false, claimed: false }
    return {
      ...mission,
      progress: Math.min(mission.target, progress.progress),
      completed: progress.completed,
      claimed: progress.claimed,
    }
  })

  return { daily, weekly }
}

export function claimDailyCheckIn(state: ProgressionState, now = new Date()): DailyCheckInOutcome {
  const base = applyPeriodResets(state, now)
  if (base.daily.checkInClaimed) {
    return {
      nextState: base,
      claimed: false,
      reward: 0,
    }
  }

  const nextState: ProgressionState = {
    ...base,
    currency: base.currency + DAILY_CHECKIN_REWARD,
    stats: {
      ...base.stats,
      totalCoinsEarned: base.stats.totalCoinsEarned + DAILY_CHECKIN_REWARD,
      checkInStreak: (() => {
        const delta = diffDaysFromKeys(base.stats.lastCheckInKey, base.daily.key)
        if (delta === 1) return base.stats.checkInStreak + 1
        if (delta === 0) return base.stats.checkInStreak
        return 1
      })(),
      lastCheckInKey: base.daily.key,
    },
    daily: {
      ...base.daily,
      checkInClaimed: true,
    },
  }

  return {
    nextState,
    claimed: true,
    reward: DAILY_CHECKIN_REWARD,
  }
}

export function exchangeCardForCurrency(
  state: ProgressionState,
  setId: string,
  cardId: string,
  rarity?: string,
  special?: string,
  options?: { allowMissingCollection?: boolean },
  now = new Date(),
): ExchangeCardOutcome {
  const base = applyPeriodResets(state, now)
  const key = `${setId}:${cardId}`
  const owned = base.collection[key] || 0
  const allowMissingCollection = Boolean(options?.allowMissingCollection)
  if (owned <= 0 && !allowMissingCollection) {
    return {
      nextState: base,
      success: false,
      reward: 0,
    }
  }

  const reward = getCardExchangeValue(rarity, special)
  const nextCollection = { ...base.collection }
  if (owned > 1) nextCollection[key] = owned - 1
  else if (owned === 1) delete nextCollection[key]

  const nextState: ProgressionState = {
    ...base,
    currency: base.currency + reward,
    collection: nextCollection,
    stats: {
      ...base.stats,
      totalCoinsEarned: base.stats.totalCoinsEarned + reward,
    },
  }

  return {
    nextState,
    success: true,
    reward,
  }
}
