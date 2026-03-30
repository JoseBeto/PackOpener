import React, { useEffect, useRef, useState } from 'react'
import { getSetFamily } from '../lib/rarityLadder'
import { PREMIUM_PACK_OPEN_COST, STANDARD_PACK_OPEN_COST, type PackType } from '../lib/progression'

type SetItem = { id: string; name: string; releaseDate?: string; logo?: string }

const SETS_CACHE_KEY = 'po_sets_v2'
const LAST_SELECTED_SET_KEY = 'po_lastSelectedSet'
const RECENT_SET_IDS_KEY = 'po_recent_set_ids_v1'
const SET_OPEN_COUNTS_KEY = 'po_set_open_counts_v1'

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

function sortSetsNewestFirst(sets: SetItem[]): SetItem[] {
  return [...sets].sort((a, b) => {
    const aTs = parseReleaseDate(a.releaseDate)
    const bTs = parseReleaseDate(b.releaseDate)
    if (aTs !== bTs) return bTs - aTs
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.id.localeCompare(b.id)
  })
}

type SetFamily = 'mainline' | 'pocket'
type BrowserTab = 'newest' | 'popular' | 'era'
type EraKey = 'all' | 'vintage' | 'bwxy' | 'sm' | 'swsh' | 'sv' | 'pocket'

type Props = {
  setId: string
  onSetIdChange: (v: string) => void
  packType: PackType
  onPackTypeChange: (v: PackType) => void
  packTypePanel?: React.ReactNode
}

export default function PackSelector({ setId, onSetIdChange, packType, onPackTypeChange, packTypePanel }: Props) {
  const [sets, setSets] = useState<SetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [setFamily, setSetFamily] = useState<SetFamily>(getSetFamily(setId) === 'pocket' ? 'pocket' : 'mainline')
  const [setQuery, setSetQuery] = useState('')
  const [recentSetIds, setRecentSetIds] = useState<string[]>([])
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({})
  const [isSetBrowserOpen, setIsSetBrowserOpen] = useState(false)
  const [browserTab, setBrowserTab] = useState<BrowserTab>('newest')
  const [eraFilter, setEraFilter] = useState<EraKey>('all')
  const [isMobilePackDetailsOpen, setIsMobilePackDetailsOpen] = useState(false)
  const setTileGridRef = useRef<HTMLDivElement>(null)

  const familySets = sets.filter((set) => (setFamily === 'pocket' ? getSetFamily(set.id) === 'pocket' : getSetFamily(set.id) === 'mainline'))
  const filteredSets = familySets.filter((set) => {
    const query = setQuery.trim().toLowerCase()
    if (!query) return true
    return set.name.toLowerCase().includes(query) || set.id.toLowerCase().includes(query)
  })
  const tileSets = filteredSets
  const recentSets = recentSetIds
    .map((id) => familySets.find((item) => item.id === id))
    .filter((item): item is SetItem => Boolean(item))
    .slice(0, 10)

  function getSetYear(set: SetItem): number | null {
    const ts = parseReleaseDate(set.releaseDate)
    if (!Number.isFinite(ts) || ts === Number.NEGATIVE_INFINITY) return null
    return new Date(ts).getUTCFullYear()
  }

  function getEraForSet(set: SetItem): EraKey {
    if (getSetFamily(set.id) === 'pocket') return 'pocket'
    const year = getSetYear(set)
    if (!year) return 'all'
    if (year <= 2010) return 'vintage'
    if (year <= 2016) return 'bwxy'
    if (year <= 2019) return 'sm'
    if (year <= 2022) return 'swsh'
    return 'sv'
  }

  const modalSets = (() => {
    const query = setQuery.trim().toLowerCase()
    const base = familySets.filter((set) => {
      if (!query) return true
      return set.name.toLowerCase().includes(query) || set.id.toLowerCase().includes(query)
    })

    if (browserTab === 'popular') {
      return [...base].sort((a, b) => {
        const diff = (openCounts[b.id] || 0) - (openCounts[a.id] || 0)
        if (diff !== 0) return diff
        return parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate)
      })
    }

    if (browserTab === 'era') {
      return base
        .filter((set) => (eraFilter === 'all' ? true : getEraForSet(set) === eraFilter))
        .sort((a, b) => parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate))
    }

    return [...base].sort((a, b) => parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate))
  })()

  const availableEraFilters: EraKey[] = (() => {
    const keys = new Set<EraKey>(['all'])
    for (const set of familySets) {
      keys.add(getEraForSet(set))
    }
    return ['all', 'sv', 'swsh', 'sm', 'bwxy', 'vintage', 'pocket'].filter((item): item is EraKey => keys.has(item as EraKey))
  })()

  useEffect(() => {
    const nextFamily: SetFamily = getSetFamily(setId) === 'pocket' ? 'pocket' : 'mainline'
    setSetFamily(nextFamily)
  }, [setId])

  useEffect(() => {
    if (!isSetBrowserOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSetBrowserOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSetBrowserOpen])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!isSetBrowserOpen) return

    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehaviorY
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehaviorY = 'contain'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehaviorY = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isSetBrowserOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawRecent = localStorage.getItem(RECENT_SET_IDS_KEY)
      if (rawRecent) {
        const parsed = JSON.parse(rawRecent)
        if (Array.isArray(parsed)) {
          setRecentSetIds(parsed.filter((item): item is string => typeof item === 'string').slice(0, 16))
        }
      }
      const rawOpenCounts = localStorage.getItem(SET_OPEN_COUNTS_KEY)
      if (rawOpenCounts) {
        const parsed = JSON.parse(rawOpenCounts)
        if (parsed && typeof parsed === 'object') {
          const normalized = Object.entries(parsed).reduce<Record<string, number>>((acc, [id, value]) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
              acc[id] = Math.max(0, Math.floor(value))
            }
            return acc
          }, {})
          setOpenCounts(normalized)
        }
      }
    } catch {
      // ignore cache parse issues
    }
  }, [])

  function persistRecentSelection(nextSetId: string) {
    const nextRecent = [nextSetId, ...recentSetIds.filter((id) => id !== nextSetId)].slice(0, 16)
    const nextCounts = { ...openCounts, [nextSetId]: (openCounts[nextSetId] || 0) + 1 }
    setRecentSetIds(nextRecent)
    setOpenCounts(nextCounts)
    try {
      localStorage.setItem(RECENT_SET_IDS_KEY, JSON.stringify(nextRecent))
      localStorage.setItem(SET_OPEN_COUNTS_KEY, JSON.stringify(nextCounts))
      localStorage.setItem(LAST_SELECTED_SET_KEY, nextSetId)
    } catch {
      // ignore storage limitations
    }
  }

  function selectSet(nextSetId: string) {
    onSetIdChange(nextSetId)
    persistRecentSelection(nextSetId)
  }

  function handleFamilyChange(nextFamily: SetFamily) {
    setSetFamily(nextFamily)
    setSetQuery('')
    if (!sets.length) return
    const nextSets = sets.filter((set) => (nextFamily === 'pocket' ? getSetFamily(set.id) === 'pocket' : getSetFamily(set.id) === 'mainline'))
    if (!nextSets.length) return
    if (!nextSets.some((set) => set.id === setId)) {
      onSetIdChange(nextSets[0].id)
    }
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        let usedLocalCache = false
        // try localStorage cache first
        const raw = typeof window !== 'undefined' ? localStorage.getItem(SETS_CACHE_KEY) : null
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed.ts && Date.now() - parsed.ts < 1000 * 60 * 60 && parsed.sets) {
              if (mounted) {
                setSets(sortSetsNewestFirst(parsed.sets))
                usedLocalCache = true
              }
            }
          } catch (e) {
            // ignore
          }
        }

        const refreshParam = usedLocalCache ? '?refresh=1' : ''
        const res = await fetch(`/api/sets${refreshParam}`)
        const data = await res.json()
        if (mounted && data.sets) {
          const mapped = data.sets.map((s: any) => ({ id: s.id, name: s.name, releaseDate: s.releaseDate, logo: s.logo }))
          const sorted = sortSetsNewestFirst(mapped)
          setSets(sorted)
          try {
            localStorage.setItem(SETS_CACHE_KEY, JSON.stringify({ ts: Date.now(), sets: sorted }))
          } catch (e) {}
        }
      } catch (e) {
        console.error('Failed to fetch sets', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // Keep selected set visible on compact/mobile tile rails without shifting desktop viewport.
  useEffect(() => {
    if (typeof window === 'undefined' || !setTileGridRef.current) return

    const isCompactViewport = window.matchMedia('(max-width: 640px)').matches
    if (!isCompactViewport) return
    
    // Find the active set tile button
    const activeButton = setTileGridRef.current.querySelector(
      `.set-tile-card.is-active`
    ) as HTMLElement | null
    
    if (activeButton) {
      // Use scrollIntoView with block: 'nearest' to smooth scroll
      activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [setId])

  return (
    <>
      <div className="set-family-switch" role="tablist" aria-label="Set family">
        <button
          type="button"
          role="tab"
          aria-selected={setFamily === 'mainline'}
          className={`set-family-btn ${setFamily === 'mainline' ? 'is-active' : ''}`}
          onClick={() => handleFamilyChange('mainline')}
        >
          Regular Sets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={setFamily === 'pocket'}
          className={`set-family-btn ${setFamily === 'pocket' ? 'is-active' : ''}`}
          onClick={() => handleFamilyChange('pocket')}
        >
          Pocket Sets
        </button>
      </div>

      <div className="control-row">
        <label className="field-label">
          <span className="field-title">Set Browser</span>
          {loading ? (
            <div className="field-loading">Loading sets…</div>
          ) : familySets.length > 0 ? (
            <div className="set-browser-shell">
              <input
                value={setQuery}
                onChange={(event) => {
                  setSetQuery(event.target.value)
                }}
                placeholder="Search set by name or id"
                className="field-input set-search-input"
              />

              <section className="set-tile-focus-section">
                <div className="set-carousel-head set-tile-head">
                  <strong>Pick Your Pack Set</strong>
                  <span>Scroll the set wall and tap a tile to lock your pick.</span>
                </div>

                <div className="set-tile-grid" role="list" aria-label="Pack set tile grid" ref={setTileGridRef}>
                  {tileSets.map((set) => (
                    <button
                      key={`tile-${set.id}`}
                      type="button"
                      role="listitem"
                      className={`set-card-btn set-tile-card ${set.id === setId ? 'is-active' : ''}`}
                      onClick={() => selectSet(set.id)}
                    >
                      {set.logo ? (
                        <div className="set-card-logo-wrap">
                          <img src={set.logo} alt={set.name} className="set-card-logo" draggable={false} />
                        </div>
                      ) : null}
                      <div className="set-card-topline">{set.releaseDate || 'Unknown Date'}</div>
                      <div className="set-card-name">{set.name}</div>
                      <div className="set-card-id">{set.id.toUpperCase()}</div>
                    </button>
                  ))}
                </div>
              </section>

              <div className="set-browser-actions">
                <button type="button" className="ghost-button set-browser-open-btn" onClick={() => setIsSetBrowserOpen(true)}>
                  Browse All Sets
                </button>
                {recentSets.length > 0 ? (
                  <button type="button" className="ghost-button set-browser-open-btn" onClick={() => selectSet(recentSets[0].id)}>
                    Jump To Last Opened
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <input value={setId} onChange={(e) => onSetIdChange(e.target.value)} placeholder="ex: sv1" className="field-input" />
          )}
        </label>

        <label className="field-label field-label-packtype">
          <span className="field-title">Pack Type</span>
          <div className="pack-type-stack">
            <div className={`pack-type-toggle ${packType === 'premium' ? 'is-premium' : 'is-standard'}`} role="tablist" aria-label="Pack type">
              <span className="pack-type-indicator" aria-hidden="true" />
              <button
                type="button"
                role="tab"
                aria-selected={packType === 'standard'}
                className={`pack-type-btn ${packType === 'standard' ? 'is-active' : ''}`}
                onClick={() => onPackTypeChange('standard')}
              >
                <strong>Standard</strong>
                <span>{STANDARD_PACK_OPEN_COST} coins</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={packType === 'premium'}
                className={`pack-type-btn ${packType === 'premium' ? 'is-active' : ''}`}
                onClick={() => onPackTypeChange('premium')}
              >
                <strong>Premium</strong>
                <span>{PREMIUM_PACK_OPEN_COST} coins</span>
              </button>
            </div>
            {packTypePanel ? (
              <>
                <button
                  type="button"
                  className="pack-details-toggle"
                  aria-expanded={isMobilePackDetailsOpen}
                  onClick={() => setIsMobilePackDetailsOpen((prev) => !prev)}
                >
                  {isMobilePackDetailsOpen ? 'Hide Pack Details' : 'Show Pack Details'}
                </button>
                <div className={`pack-type-side-panel ${isMobilePackDetailsOpen ? 'is-open' : ''}`}>{packTypePanel}</div>
              </>
            ) : null}
          </div>
        </label>
      </div>

      {isSetBrowserOpen && (
        <div className="set-browser-modal-overlay" role="dialog" aria-modal="true" aria-label="Set browser" onClick={() => setIsSetBrowserOpen(false)}>
          <div className="set-browser-modal-shell" onClick={(event) => event.stopPropagation()}>
            <div className="set-browser-modal-head">
              <div>
                <strong>Set Browser</strong>
                <span>Find and pick your next pack set quickly.</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => setIsSetBrowserOpen(false)}>Close</button>
            </div>

            <div className="set-browser-modal-toolbar">
              <input
                value={setQuery}
                onChange={(event) => setSetQuery(event.target.value)}
                placeholder="Search sets by name or id"
                className="field-input set-search-input"
              />
              <div className="set-browser-tab-row" role="tablist" aria-label="Set categories">
                <button type="button" role="tab" aria-selected={browserTab === 'newest'} className={`set-browser-tab ${browserTab === 'newest' ? 'is-active' : ''}`} onClick={() => setBrowserTab('newest')}>Newest</button>
                <button type="button" role="tab" aria-selected={browserTab === 'popular'} className={`set-browser-tab ${browserTab === 'popular' ? 'is-active' : ''}`} onClick={() => setBrowserTab('popular')}>Popular</button>
                <button type="button" role="tab" aria-selected={browserTab === 'era'} className={`set-browser-tab ${browserTab === 'era' ? 'is-active' : ''}`} onClick={() => setBrowserTab('era')}>By Era</button>
              </div>
              {browserTab === 'era' ? (
                <div className="set-era-row" role="tablist" aria-label="Era filters">
                  {availableEraFilters.map((era) => (
                    <button
                      key={era}
                      type="button"
                      role="tab"
                      aria-selected={eraFilter === era}
                      className={`set-era-chip ${eraFilter === era ? 'is-active' : ''}`}
                      onClick={() => setEraFilter(era)}
                    >
                      {era === 'all' ? 'All Eras' : era.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="set-browser-modal-grid" role="list" aria-label="All selectable sets">
              {modalSets.map((set) => (
                <button
                  key={`modal-${set.id}`}
                  type="button"
                  role="listitem"
                  className={`set-card-btn set-modal-card ${set.id === setId ? 'is-active' : ''}`}
                  onClick={() => {
                    selectSet(set.id)
                    setIsSetBrowserOpen(false)
                  }}
                >
                  {set.logo ? (
                    <div className="set-card-logo-wrap">
                      <img src={set.logo} alt={set.name} className="set-card-logo" draggable={false} />
                    </div>
                  ) : null}
                  <div className="set-card-topline">{set.releaseDate || 'Unknown Date'}</div>
                  <div className="set-card-name">{set.name}</div>
                  <div className="set-card-id">{set.id.toUpperCase()} {browserTab === 'popular' ? `• Opened ${openCounts[set.id] || 0}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
