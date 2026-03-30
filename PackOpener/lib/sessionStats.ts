import type { Card } from './simulator'
import { getCardRankBySet } from './rarityLadder'

export const SESSION_STATS_KEY = 'po_session_stats_v1'
export const SESSION_STATS_EVENT = 'po-session-stats-changed'

export type SessionStats = {
  startedAt: number
  packsOpened: number
  netCoins: number
  bestPullRank: number
  bestPullName: string
  bestPullSetId: string
}

function createDefaultSessionStats(): SessionStats {
  return {
    startedAt: Date.now(),
    packsOpened: 0,
    netCoins: 0,
    bestPullRank: 0,
    bestPullName: '',
    bestPullSetId: '',
  }
}

function normalizeSessionStats(input: unknown): SessionStats {
  const fallback = createDefaultSessionStats()
  if (!input || typeof input !== 'object') return fallback

  const raw = input as Partial<SessionStats>
  return {
    startedAt: typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : fallback.startedAt,
    packsOpened: typeof raw.packsOpened === 'number' && Number.isFinite(raw.packsOpened) ? Math.max(0, Math.floor(raw.packsOpened)) : 0,
    netCoins: typeof raw.netCoins === 'number' && Number.isFinite(raw.netCoins) ? Math.round(raw.netCoins) : 0,
    bestPullRank: typeof raw.bestPullRank === 'number' && Number.isFinite(raw.bestPullRank) ? Math.max(0, Math.floor(raw.bestPullRank)) : 0,
    bestPullName: typeof raw.bestPullName === 'string' ? raw.bestPullName : '',
    bestPullSetId: typeof raw.bestPullSetId === 'string' ? raw.bestPullSetId : '',
  }
}

export function loadSessionStats(): SessionStats {
  if (typeof window === 'undefined') return createDefaultSessionStats()
  try {
    const raw = window.sessionStorage.getItem(SESSION_STATS_KEY)
    if (!raw) return createDefaultSessionStats()
    return normalizeSessionStats(JSON.parse(raw))
  } catch {
    return createDefaultSessionStats()
  }
}

export function saveSessionStats(stats: SessionStats) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SESSION_STATS_KEY, JSON.stringify(stats))
    window.dispatchEvent(new CustomEvent(SESSION_STATS_EVENT))
  } catch {
    // ignore storage failures
  }
}

export function recordSessionPackOpen(pack: Card[], setId: string, currencyDelta: number): SessionStats {
  const current = loadSessionStats()

  let bestRank = current.bestPullRank
  let bestName = current.bestPullName
  let bestSetId = current.bestPullSetId

  for (const card of pack) {
    const rank = getCardRankBySet(card, setId)
    if (rank > bestRank) {
      bestRank = rank
      bestName = card.name || ''
      bestSetId = setId
    }
  }

  const next: SessionStats = {
    ...current,
    packsOpened: current.packsOpened + 1,
    netCoins: current.netCoins + Math.round(currencyDelta),
    bestPullRank: bestRank,
    bestPullName: bestName,
    bestPullSetId: bestSetId,
  }

  saveSessionStats(next)
  return next
}
