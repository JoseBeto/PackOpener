import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
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
  const [opened, setOpened] = useState<Card[]>([])
  const [packToOpen, setPackToOpen] = useState<Card[]>([])
  const [autoReveal, setAutoReveal] = useState(false)
  const [error, setError] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const [focusCard, setFocusCard] = useState<FocusCard | null>(null)
  const cardsEndRef = useRef<HTMLDivElement | null>(null)

  // auto-load cards when set changes
  useEffect(() => {
    loadPool()
  }, [setId])

  useEffect(() => {
    if (opened.length === 0) return
    cardsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [opened.length])

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
    // reset deck
    setPackToOpen(pack)
    setOpened([])
    if (autoReveal) {
      setOpened(pack)
      setPackToOpen([])
    }
  }

  function handleDeckClick() {
    if (autoReveal || packToOpen.length === 0) return

    // First click: reveal all cards except the final 3
    if (opened.length === 0 && packToOpen.length > 3) {
      const revealCount = packToOpen.length - 3
      setOpened(packToOpen.slice(0, revealCount))
      setPackToOpen(packToOpen.slice(revealCount))
      return
    }

    // Next clicks: reveal remaining cards one by one
    const next = packToOpen[0]
    setOpened((prev) => [...prev, next])
    setPackToOpen((prev) => prev.slice(1))
  }

  function pullNext() {
    // alias for clicking the deck
    handleDeckClick()
  }

  return (
    <div className="pack-opener-wrap">
      <PackSelector setId={setId} onSetIdChange={setSetId} packType={packType} onPackTypeChange={setPackType} />

      <div className="action-row">
        <div className="action-buttons">
          <button className="button" onClick={openPack} disabled={loading || pool.length === 0}>
            {loading ? 'Loading...' : 'Open Pack'}
          </button>
          <button className="button button-secondary" onClick={pullNext} disabled={autoReveal || packToOpen.length === 0}>
            Pull Next
          </button>
        </div>

        <label className="toggle-row">
          <input type="checkbox" checked={autoReveal} onChange={(e) => setAutoReveal(e.target.checked)} />
          <span>Auto Reveal</span>
        </label>

        <div className="status-panel">
          <div className="status-text">
            {loading ? 'Loading cards...' : pool.length ? `${pool.length} cards ready` : 'No cards loaded'}
            {dataSource && <span className="status-badge">({dataSource})</span>}
          </div>
          {error && <div className="error-text">Error: {error}</div>}
        </div>
      </div>

      {/* deck display when not autoReveal */}
      {packToOpen.length > 0 && !autoReveal && (
        <div className="deck-stage">
          <button
            type="button"
            className="deck"
            onClick={handleDeckClick}
            aria-label={`Reveal next card. ${packToOpen.length} card${packToOpen.length === 1 ? '' : 's'} left in pack.`}
          >
            {/* stack of backs under the moving card */}
            {Array.from({ length: Math.min(6, packToOpen.length) }).map((_, idx) => (
              <img
                key={idx}
                src="/card-back.png"
                alt="deck back"
                className="deck-back"
                style={{
                  position: 'absolute',
                  top: idx * 2,
                  left: idx * 2,
                }}
              />
            ))}
          </button>
        </div>
      )}

      <div className="opened-cards-wrap">
        <div className="opened-grid">
          {opened.map((c, i) => (
            <motion.div
              key={`${c.id}-${i}`}
              initial={{ scale: 0.8, opacity: 0, y: -100 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card-shell clickable-card"
              onClick={() =>
                setFocusCard({
                  name: c.name,
                  image: c.images?.large || c.images?.small,
                  subtitle: `${c.rarity || 'Common'}${c.isReverse ? ' • Reverse' : ''}${c.isHolo ? ' • Holo' : ''}${c.special ? ` • ${c.special}` : ''}`,
                })
              }
            >
              <div className="card-flip-shell">
                <motion.div
                  animate={{ rotateY: 180 }}
                  transition={{ duration: 0.6 }}
                  className="card-flip"
                >
                  {/* Back face */}
                  <div className="card-face card-face-back">
                    <img
                      src="/card-back.png"
                      alt="card back"
                      className="card-art"
                      onError={(e) => {
                        const t = e.target as HTMLImageElement
                        if (t && t.src && !t.src.endsWith('.svg')) t.src = '/card-back.svg'
                      }}
                    />
                  </div>

                  {/* Front face */}
                  <div className="card-face card-face-front">
                    {c.images?.small ? (
                      <>
                        {!loadedImages[c.id] && (
                          <div className="card-status">Loading...</div>
                        )}
                        <img
                          src={c.images.small}
                          alt={c.name}
                          className="card-art"
                          onLoad={() => setLoadedImages(prev => ({ ...prev, [c.id]: true }))}
                          style={{ opacity: loadedImages[c.id] ? 1 : 0, transition: 'opacity 0.3s ease' }}
                          loading="lazy"
                        />
                      </>
                    ) : (
                      <div className="card-status">No Image</div>
                    )}
                    {/* Holo foil overlay */}
                    {(c.isHolo || (c as any).variants?.holo) && (
                      <>
                        <div className="holo-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                        <div className="holo-sparkle" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                      </>
                    )}
                    {(c.isReverse || (c as any).variants?.reverse) && (
                      <div className="reverse-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                    )}
                    {/* Reverse / special badges */}
                    {(c.isReverse || (c as any).variants?.reverse) && (
                      <div className="card-badge card-badge-right">Reverse</div>
                    )}
                    {c.special && (
                      <div className="card-badge card-badge-special">{c.special}</div>
                    )}
                  </div>
                </motion.div>
              </div>
              <div className="card-name">{c.name}</div>
              <div className="card-meta">{c.rarity || 'Common'}{c.isReverse ? ' • Reverse' : ''}{c.isHolo ? ' • Holo' : ''}{c.special ? ` • ${c.special}` : ''}</div>
            </motion.div>
          ))}
        </div>
        <div ref={cardsEndRef} />
      </div>

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

