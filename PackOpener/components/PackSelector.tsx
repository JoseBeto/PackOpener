import React, { useEffect, useState } from 'react'

type SetItem = { id: string; name: string; releaseDate?: string }

const SETS_CACHE_KEY = 'po_sets_v2'

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

type Props = {
  setId: string
  onSetIdChange: (v: string) => void
  packType: string
  onPackTypeChange: (v: string) => void
}

export default function PackSelector({ setId, onSetIdChange, packType, onPackTypeChange }: Props) {
  const [sets, setSets] = useState<SetItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        // try localStorage cache first
        const raw = typeof window !== 'undefined' ? localStorage.getItem(SETS_CACHE_KEY) : null
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed.ts && Date.now() - parsed.ts < 1000 * 60 * 60 && parsed.sets) {
              if (mounted) {
                setSets(sortSetsNewestFirst(parsed.sets))
                setLoading(false)
                return
              }
            }
          } catch (e) {
            // ignore
          }
        }

        const res = await fetch('/api/sets')
        const data = await res.json()
        if (mounted && data.sets) {
          const mapped = data.sets.map((s: any) => ({ id: s.id, name: s.name, releaseDate: s.releaseDate }))
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

  return (
    <div className="control-row">
      <label className="field-label">
        <span className="field-title">Set</span>
        {loading ? (
          <div className="field-loading">Loading sets…</div>
        ) : sets.length > 0 ? (
          <select value={setId} onChange={(e) => onSetIdChange(e.target.value)} className="field-input">
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.id}</option>
            ))}
          </select>
        ) : (
          <input value={setId} onChange={(e) => onSetIdChange(e.target.value)} placeholder="ex: sv1" className="field-input" />
        )}
      </label>

      <label className="field-label">
        <span className="field-title">Pack</span>
        <select value={packType} onChange={(e) => onPackTypeChange(e.target.value)} className="field-input">
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
      </label>
    </div>
  )
}
