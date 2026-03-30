import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { getRarityRank, getShowcasePulls, removeOneShowcasePull, sortByRarityDesc, type ShowcasePull } from '../lib/showcase'
import {
  exchangeCardForCurrency,
  getCardExchangeValue,
  loadProgressionState,
  saveProgressionState,
  type ProgressionState,
} from '../lib/progression'
import CardZoomModal from '../components/CardZoomModal'
import { loadSessionStats, type SessionStats } from '../lib/sessionStats'
import { getAchievements } from '../lib/achievements'

type SetMeta = { id: string; name: string }
type ShowcaseCardEntry = ShowcasePull & { count: number; latestPulledAt: number }
type ExchangeConfirmState =
  | { mode: 'single'; card: ShowcaseCardEntry; reward: number }
  | { mode: 'bulk'; copies: number; reward: number }
  | null

export default function ProfilePage() {
  const [pulls, setPulls] = useState<ShowcasePull[]>([])
  const [setsMap, setSetsMap] = useState<Record<string, string>>({})
  const [progression, setProgression] = useState<ProgressionState | null>(null)
  const [exchangeMessage, setExchangeMessage] = useState('')
  const [focusCard, setFocusCard] = useState<ShowcaseCardEntry | null>(null)
  const [confirmExchange, setConfirmExchange] = useState<ExchangeConfirmState>(null)
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)
  const [setTotals, setSetTotals] = useState<Record<string, number>>({})

  useEffect(() => {
    setPulls(sortByRarityDesc(getShowcasePulls()))
    setProgression(loadProgressionState())
    setSessionStats(loadSessionStats())
  }, [])

  function formatCoins(value: number): string {
    return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value)))
  }

  function handleExchangeCard(card: ShowcaseCardEntry) {
    const rewardValue = getCardExchangeValue(card.rarity, card.special)
    setConfirmExchange({ mode: 'single', card, reward: rewardValue })
  }

  function executeSingleExchange(card: ShowcaseCardEntry) {
    if (!progression) return

    const outcome = exchangeCardForCurrency(
      progression,
      card.setId,
      card.id,
      card.rarity,
      card.special,
      { allowMissingCollection: true },
    )
    if (!outcome.success) {
      setExchangeMessage('Could not exchange this card. Try refreshing your profile.')
      return
    }

    const removed = removeOneShowcasePull(card.setId, card.id)
    if (!removed) {
      setExchangeMessage('No showcase copy available to exchange for this card.')
      return
    }

    saveProgressionState(outcome.nextState)
    setProgression(outcome.nextState)
    const nextPulls = sortByRarityDesc(getShowcasePulls())
    setPulls(nextPulls)
    setExchangeMessage(`Exchanged ${card.name} for +${formatCoins(outcome.reward)} coins.`)

    setFocusCard((prev) => {
      if (!prev || prev.id !== card.id || prev.setId !== card.setId) return prev
      if (prev.count <= 1) return null
      return { ...prev, count: prev.count - 1 }
    })
  }

  useEffect(() => {
    let mounted = true

    async function loadSetNames() {
      try {
        const res = await fetch('/api/sets')
        const data = await res.json()
        const mapped: SetMeta[] = Array.isArray(data.sets)
          ? data.sets.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name }))
          : []

        if (!mounted) return

        const byId = mapped.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.name
          return acc
        }, {})
        setSetsMap(byId)
      } catch {
        if (mounted) setSetsMap({})
      }
    }

    loadSetNames()
    return () => {
      mounted = false
    }
  }, [])

  const groupedBySet = useMemo(() => {
    const grouped = pulls.reduce<Record<string, Record<string, ShowcaseCardEntry>>>((acc, pull) => {
      if (!acc[pull.setId]) acc[pull.setId] = {}

      const setBucket = acc[pull.setId]
      const existing = setBucket[pull.id]
      if (!existing) {
        setBucket[pull.id] = {
          ...pull,
          count: 1,
          latestPulledAt: pull.pulledAt,
        }
      } else {
        existing.count += 1
        if (pull.pulledAt > existing.latestPulledAt) {
          existing.latestPulledAt = pull.pulledAt
          existing.image = pull.image || existing.image
          existing.imageLarge = pull.imageLarge || existing.imageLarge
          existing.rarity = pull.rarity || existing.rarity
          existing.special = pull.special || existing.special
        }
      }

      return acc
    }, {})

    const orderedSetIds = Object.keys(grouped).sort((a, b) => {
      const aCards = Object.values(grouped[a])
      const bCards = Object.values(grouped[b])
      const aTop = aCards.sort((x, y) => getRarityRank(y.rarity, y.special) - getRarityRank(x.rarity, x.special))[0]
      const bTop = bCards.sort((x, y) => getRarityRank(y.rarity, y.special) - getRarityRank(x.rarity, x.special))[0]
      const topRankDiff = getRarityRank(bTop?.rarity, bTop?.special) - getRarityRank(aTop?.rarity, aTop?.special)
      if (topRankDiff !== 0) return topRankDiff
      return (bTop?.latestPulledAt || 0) - (aTop?.latestPulledAt || 0)
    })

    return orderedSetIds.map((setId) => ({
      setId,
      setName: setsMap[setId] || setId.toUpperCase(),
      cards: Object.values(grouped[setId]).sort((a, b) => {
        const rarityDiff = getRarityRank(b.rarity, b.special) - getRarityRank(a.rarity, a.special)
        if (rarityDiff !== 0) return rarityDiff
        const countDiff = b.count - a.count
        if (countDiff !== 0) return countDiff
        const recentDiff = b.latestPulledAt - a.latestPulledAt
        if (recentDiff !== 0) return recentDiff
        return a.name.localeCompare(b.name)
      }),
    }))
  }, [pulls, setsMap])

  const trainerTitle = useMemo(() => {
    const packs = progression?.stats.lifetimePacksOpened || 0
    if (packs >= 300) return 'Master Collector'
    if (packs >= 150) return 'Elite Opener'
    if (packs >= 60) return 'Seasoned Collector'
    if (packs >= 20) return 'Rising Trainer'
    return 'Rookie Collector'
  }, [progression?.stats.lifetimePacksOpened])

  const achievements = useMemo(() => {
    if (!progression) return []
    return getAchievements(progression)
  }, [progression])

  const topSetOwnership = useMemo(() => {
    if (!progression) return [] as Array<{ setId: string; owned: number }>
    const bySet: Record<string, Set<string>> = {}
    // Count unique card IDs per set (not total copies)
    for (const key of Object.keys(progression.collection)) {
      const sep = key.indexOf(':')
      if (sep <= 0) continue
      const setId = key.slice(0, sep)
      const cardId = key.slice(sep + 1)
      if (!bySet[setId]) bySet[setId] = new Set()
      bySet[setId].add(cardId)
    }
    return Object.entries(bySet)
      .map(([setId, cardIds]) => ({ setId, owned: cardIds.size }))
      .sort((a, b) => b.owned - a.owned)
      .slice(0, 6)
  }, [progression])

  useEffect(() => {
    if (topSetOwnership.length === 0) return
    let cancelled = false

    async function ensureTotals() {
      const missing = topSetOwnership.filter((item) => !setTotals[item.setId]).map((item) => item.setId)
      if (!missing.length) return

      const updates: Record<string, number> = {}
      await Promise.all(
        missing.map(async (setId) => {
          try {
            const res = await fetch(`/api/cards?set=${encodeURIComponent(setId)}`)
            const data = await res.json()
            updates[setId] = Array.isArray(data?.cards) ? data.cards.length : 0
          } catch {
            updates[setId] = 0
          }
        }),
      )

      if (cancelled) return
      setSetTotals((prev) => ({ ...prev, ...updates }))
    }

    ensureTotals()
    return () => {
      cancelled = true
    }
  }, [topSetOwnership, setTotals])

  const setCompletion = useMemo(() => {
    return topSetOwnership.map((entry) => {
      const total = setTotals[entry.setId] || 0
      const ratio = total > 0 ? Math.min(1, entry.owned / total) : 0
      return {
        setId: entry.setId,
        setName: setsMap[entry.setId] || entry.setId.toUpperCase(),
        owned: entry.owned,
        total,
        ratio,
      }
    })
  }, [topSetOwnership, setTotals, setsMap])

  const duplicateSummary = useMemo(() => {
    let duplicateCopies = 0
    let duplicateReward = 0
    for (const group of groupedBySet) {
      for (const card of group.cards) {
        const dupes = Math.max(0, card.count - 1)
        if (dupes <= 0) continue
        duplicateCopies += dupes
        duplicateReward += dupes * getCardExchangeValue(card.rarity, card.special)
      }
    }
    return { duplicateCopies, duplicateReward }
  }, [groupedBySet])

  function handleExchangeAllDuplicates() {
    if (!progression) return
    if (duplicateSummary.duplicateCopies <= 0) {
      setExchangeMessage('No duplicate cards available to exchange.')
      return
    }

    setConfirmExchange({
      mode: 'bulk',
      copies: duplicateSummary.duplicateCopies,
      reward: duplicateSummary.duplicateReward,
    })
  }

  function executeExchangeAllDuplicates() {
    if (!progression) return
    if (duplicateSummary.duplicateCopies <= 0) {
      setExchangeMessage('No duplicate cards available to exchange.')
      return
    }

    let nextProgression = progression
    let exchangedCount = 0
    let totalReward = 0

    for (const group of groupedBySet) {
      for (const card of group.cards) {
        const copiesToExchange = Math.max(0, card.count - 1)
        for (let i = 0; i < copiesToExchange; i++) {
          const outcome = exchangeCardForCurrency(
            nextProgression,
            card.setId,
            card.id,
            card.rarity,
            card.special,
            { allowMissingCollection: true },
          )
          if (!outcome.success) break
          const removed = removeOneShowcasePull(card.setId, card.id)
          if (!removed) break
          nextProgression = outcome.nextState
          exchangedCount += 1
          totalReward += outcome.reward
        }
      }
    }

    if (exchangedCount <= 0) {
      setExchangeMessage('No duplicates were exchanged.')
      return
    }

    saveProgressionState(nextProgression)
    setProgression(nextProgression)
    setPulls(sortByRarityDesc(getShowcasePulls()))
    setFocusCard(null)
    setExchangeMessage(`Exchanged ${exchangedCount} duplicate card${exchangedCount === 1 ? '' : 's'} for +${formatCoins(totalReward)} coins.`)
  }

  function confirmExchangeAction() {
    if (!confirmExchange) return
    if (confirmExchange.mode === 'single') {
      executeSingleExchange(confirmExchange.card)
    } else {
      executeExchangeAllDuplicates()
    }
    setConfirmExchange(null)
  }

  return (
    <Layout title="Rip Realm | Profile" description="Rip Realm profile — view your showcase pulls by set, ordered by rarity.">
      <section className="profile-wrap">
        <h1 className="profile-title">Profile</h1>
        <p className="profile-subtitle">Showcase includes only pulls above Double Rare, grouped by set and ordered by rarity.</p>

        <section className="trainer-card">
          <div className="trainer-card-head">
            <span className="trainer-title">{trainerTitle}</span>
            <strong>Trainer Profile</strong>
          </div>
          <div className="trainer-stats-grid">
            <div className="trainer-stat"><span>Lifetime Packs</span><strong>{formatCoins(progression?.stats.lifetimePacksOpened || 0)}</strong></div>
            <div className="trainer-stat"><span>Good Pulls</span><strong>{formatCoins(progression?.stats.lifetimeGoodPulls || 0)}</strong></div>
            <div className="trainer-stat"><span>Elite Pulls</span><strong>{formatCoins(progression?.stats.lifetimeElitePulls || 0)}</strong></div>
            <div className="trainer-stat"><span>Check-in Streak</span><strong>{formatCoins(progression?.stats.checkInStreak || 0)} days</strong></div>
            <div className="trainer-stat"><span>Session Packs</span><strong>{formatCoins(sessionStats?.packsOpened || 0)}</strong></div>
            <div className="trainer-stat"><span>Session Net</span><strong>{(sessionStats?.netCoins || 0) >= 0 ? '+' : ''}{formatCoins(sessionStats?.netCoins || 0)}</strong></div>
          </div>
        </section>

        <section className="completion-panel">
          <div className="panel-head">
            <h2>Set Completion</h2>
            <span>Top sets by ownership</span>
          </div>
          <div className="completion-grid">
            {setCompletion.length === 0 ? (
              <div className="empty-state">Open packs to start set completion tracking.</div>
            ) : (
              setCompletion.map((item) => (
                <article key={item.setId} className="completion-card">
                  <div className="completion-ring" style={{ ['--completion' as any]: `${Math.round(item.ratio * 100)}%` }}>
                    <span>{Math.round(item.ratio * 100)}%</span>
                  </div>
                  <div className="completion-copy">
                    <strong>{item.setName}</strong>
                    <span>{formatCoins(item.owned)} / {formatCoins(item.total || 0)} cards</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="achievement-panel">
          <div className="panel-head">
            <h2>Achievement Wall</h2>
            <span>{achievements.filter((item) => item.unlocked).length}/{achievements.length} unlocked</span>
          </div>
          <div className="achievement-grid">
            {achievements.map((achievement) => (
              <article key={achievement.id} className={`achievement-item ${achievement.unlocked ? 'is-unlocked' : 'is-locked'}`}>
                <strong>{achievement.label}</strong>
                <p>{achievement.description}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="profile-economy-row">
          <div className="profile-economy-card">
            <span>Currency</span>
            <strong>{formatCoins(progression?.currency || 0)} coins</strong>
          </div>
          <div className="profile-economy-card">
            <span>Exchange Rule</span>
            <strong>Trade showcase cards for coins</strong>
          </div>
        </div>
        <div className="profile-action-row">
          <button
            type="button"
            className="showcase-exchange-btn bulk-exchange-btn"
            onClick={handleExchangeAllDuplicates}
            disabled={duplicateSummary.duplicateCopies <= 0}
          >
            Exchange All Duplicates (+{formatCoins(duplicateSummary.duplicateReward)})
          </button>
          <span className="profile-action-meta">Duplicate copies: {duplicateSummary.duplicateCopies}</span>
        </div>
        {exchangeMessage ? <div className="profile-exchange-note">{exchangeMessage}</div> : null}

        {groupedBySet.length === 0 ? (
          <div className="empty-state">No showcase pulls yet. Open packs to start building your collection.</div>
        ) : (
          <div className="set-groups">
            {groupedBySet.map((group) => (
              <section key={group.setId} className="set-card">
                <div className="set-card-head">
                  <h2>{group.setName}</h2>
                  <span>{group.cards.length} pulls</span>
                </div>
                <div className="showcase-grid">
                  {group.cards.map((card, index) => (
                    <article key={`${card.id}-${card.latestPulledAt}-${index}`} className="showcase-item showcase-item-button" onClick={() => setFocusCard(card)}>
                      <div className="showcase-image-wrap">
                        {card.image ? <img src={card.image} alt={card.name} className="showcase-image" /> : <div className="showcase-no-image">No Image</div>}
                      </div>
                      <div className="showcase-content">
                        <div className="showcase-name">{card.name}</div>
                        <div className="showcase-meta">
                          {card.rarity}
                          {card.special ? ` • ${card.special}` : ''}
                        </div>
                      </div>
                      <div className="showcase-actions">
                        {card.count > 1 ? <div className="showcase-count">x{card.count}</div> : null}
                        <button
                          type="button"
                          className="showcase-exchange-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleExchangeCard(card)
                          }}
                        >
                          Exchange +{getCardExchangeValue(card.rarity, card.special)}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <CardZoomModal
        open={Boolean(focusCard)}
        imageSrc={focusCard?.imageLarge || focusCard?.image}
        title={focusCard?.name || 'Card'}
        subtitle={focusCard ? `${focusCard.rarity}${focusCard.special ? ` • ${focusCard.special}` : ''}${focusCard.count > 1 ? ` • Pulled x${focusCard.count}` : ''}` : ''}
        onClose={() => setFocusCard(null)}
      />

      {confirmExchange && (
        <div className="exchange-confirm-overlay" onClick={() => setConfirmExchange(null)} role="dialog" aria-modal="true" aria-label="Confirm exchange">
          <div className="exchange-confirm-shell" onClick={(event) => event.stopPropagation()}>
            <h3>Confirm Exchange</h3>
            {confirmExchange.mode === 'single' ? (
              <p>
                Exchange 1 copy of <strong>{confirmExchange.card.name}</strong> for <strong>+{formatCoins(confirmExchange.reward)} coins</strong>?
              </p>
            ) : (
              <p>
                Exchange <strong>{confirmExchange.copies}</strong> duplicate cards for <strong>+{formatCoins(confirmExchange.reward)} coins</strong>? One copy of each card will be kept.
              </p>
            )}
            <div className="exchange-confirm-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmExchange(null)}>Cancel</button>
              <button type="button" className="button" onClick={confirmExchangeAction}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}