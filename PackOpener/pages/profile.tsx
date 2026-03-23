import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { getRarityRank, getShowcasePulls, sortByRarityDesc, type ShowcasePull } from '../lib/showcase'
import CardZoomModal from '../components/CardZoomModal'

type SetMeta = { id: string; name: string }
type ShowcaseCardEntry = ShowcasePull & { count: number; latestPulledAt: number }

export default function ProfilePage() {
  const [pulls, setPulls] = useState<ShowcasePull[]>([])
  const [setsMap, setSetsMap] = useState<Record<string, string>>({})
  const [focusCard, setFocusCard] = useState<ShowcaseCardEntry | null>(null)

  useEffect(() => {
    setPulls(sortByRarityDesc(getShowcasePulls()))
  }, [])

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

  return (
    <Layout title="Rip Realm | Profile" description="Rip Realm profile — view your showcase pulls by set, ordered by rarity.">
      <section className="profile-wrap">
        <h1 className="profile-title">Profile</h1>
        <p className="profile-subtitle">Showcase includes only pulls above Double Rare, grouped by set and ordered by rarity.</p>

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
                      {card.count > 1 ? <div className="showcase-count">x{card.count}</div> : null}
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
    </Layout>
  )
}