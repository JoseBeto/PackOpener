import type { Card } from './simulator'

export type ShowcasePull = {
  id: string
  name: string
  rarity: string
  special?: string
  image?: string
  imageLarge?: string
  setId: string
  pulledAt: number
}

const SHOWCASE_STORAGE_KEY = 'po_showcase_v1'

const rarityRanks: Array<[string, number]> = [
  ['godpack', 10],
  ['secret', 9],
  ['hyper', 8],
  ['special illustration', 7],
  ['specialillustration', 7],
  ['ultra', 6],
  ['illustration', 5],
  ['double rare', 4],
  ['doublerare', 4],
  ['rare', 3],
  ['uncommon', 2],
  ['common', 1],
]

function rankFromValue(value?: string): number {
  if (!value) return 0
  const text = value.toLowerCase()
  for (const [key, rank] of rarityRanks) {
    if (text.includes(key)) return rank
  }
  return 0
}

export function getRarityRank(rarity?: string, special?: string): number {
  return Math.max(rankFromValue(rarity), rankFromValue(special))
}

export function isShowcaseEligible(card: Card): boolean {
  return getRarityRank(card.rarity, card.special) > 4
}

export function getShowcasePulls(): ShowcasePull[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SHOWCASE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ShowcasePull => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.rarity === 'string' &&
        typeof item.setId === 'string' &&
        typeof item.pulledAt === 'number'
      )
    })
  } catch {
    return []
  }
}

export function addShowcasePulls(setId: string, cards: Card[]) {
  if (typeof window === 'undefined') return
  const eligible = cards.filter(isShowcaseEligible)
  if (eligible.length === 0) return

  const nextEntries: ShowcasePull[] = eligible.map((card) => ({
    id: card.id,
    name: card.name,
    rarity: card.rarity || 'Unknown',
    special: card.special,
    image: card.images?.small,
    imageLarge: card.images?.large,
    setId,
    pulledAt: Date.now(),
  }))

  const current = getShowcasePulls()
  const updated = [...nextEntries, ...current].slice(0, 2000)
  localStorage.setItem(SHOWCASE_STORAGE_KEY, JSON.stringify(updated))
}

export function sortByRarityDesc(items: ShowcasePull[]) {
  return [...items].sort((a, b) => {
    const rankDiff = getRarityRank(b.rarity, b.special) - getRarityRank(a.rarity, a.special)
    if (rankDiff !== 0) return rankDiff
    const dateDiff = b.pulledAt - a.pulledAt
    if (dateDiff !== 0) return dateDiff
    return a.name.localeCompare(b.name)
  })
}

export function removeOneShowcasePull(setId: string, cardId: string): boolean {
  if (typeof window === 'undefined') return false
  const current = getShowcasePulls()
  const index = current.findIndex((item) => item.setId === setId && item.id === cardId)
  if (index < 0) return false
  const updated = [...current.slice(0, index), ...current.slice(index + 1)]
  localStorage.setItem(SHOWCASE_STORAGE_KEY, JSON.stringify(updated))
  return true
}