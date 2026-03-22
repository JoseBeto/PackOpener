import fs from 'fs'
import path from 'path'

export interface CardMetadata {
  id: string
  name: string
  rarity: string
  category: string
  hp?: number
  types?: string[]
  variants?: Record<string, boolean>
  image?: string
  localId?: string
  serieId?: string
}

export interface RarityWeight {
  rarity: string
  weight: number
  count: number
}

// Load detailed card database from the generated file
export function loadDetailedCardDatabase(): CardMetadata[] {
  try {
    const dbPath = path.join(__dirname, '../data/detailed-cards/all-cards-detailed.json')
    if (!fs.existsSync(dbPath)) {
      console.warn('[CardDB] Detailed card database not found, using fallback')
      return []
    }

    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    return data.cards || []
  } catch (e) {
    console.error('[CardDB] Error loading detailed card database:', e)
    return []
  }
}

// Calculate rarity weights from the entire database
export function calculateRarityWeights(): RarityWeight[] {
  const cards = loadDetailedCardDatabase()
  const rarityMap: Record<string, number> = {}

  cards.forEach((card) => {
    const rarity = card.rarity || 'Common'
    rarityMap[rarity] = (rarityMap[rarity] || 0) + 1
  })

  // Convert counts to weights (normalized to 0-1)
  const total = Object.values(rarityMap).reduce((a, b) => a + b, 0)

  return Object.entries(rarityMap)
    .map(([rarity, count]) => ({
      rarity,
      count,
      weight: count / total
    }))
    .sort((a, b) => b.weight - a.weight)
}

// Get cards by rarity
export function getCardsByRarity(rarity: string): CardMetadata[] {
  const cards = loadDetailedCardDatabase()
  return cards.filter((c) => (c.rarity || 'Common') === rarity)
}

// Weight-based random selection from card list
export function selectRandomCardByWeight(
  cards: CardMetadata[],
  rarityWeights: Map<string, number>
): CardMetadata | null {
  if (cards.length === 0) return null

  // Group cards by rarity
  const byRarity: Record<string, CardMetadata[]> = {}
  cards.forEach((card) => {
    const rarity = card.rarity || 'Common'
    if (!byRarity[rarity]) byRarity[rarity] = []
    byRarity[rarity].push(card)
  })

  // Select rarity based on weights
  const rarities = Object.keys(byRarity)
  let roll = Math.random()

  for (const rarity of rarities) {
    const weight = rarityWeights.get(rarity) || 0
    if (roll < weight) {
      // Select random card from this rarity
      const rareCards = byRarity[rarity]
      return rareCards[Math.floor(Math.random() * rareCards.length)]
    }
    roll -= weight
  }

  // Fallback: return random card
  return cards[Math.floor(Math.random() * cards.length)]
}

// Get metadata for a specific card
export function getCardMetadata(cardId: string): CardMetadata | null {
  const cards = loadDetailedCardDatabase()
  return cards.find((c) => c.id === cardId) || null
}

// Get all cards for a specific set with rarity distribution
export function getSetCardsByRarity(setId: string): Record<string, CardMetadata[]> {
  const cards = loadDetailedCardDatabase()
  const setCards = cards.filter((c) => c.id.startsWith(setId + '-'))

  const byRarity: Record<string, CardMetadata[]> = {}
  setCards.forEach((card) => {
    const rarity = card.rarity || 'Common'
    if (!byRarity[rarity]) byRarity[rarity] = []
    byRarity[rarity].push(card)
  })

  return byRarity
}

// Calculate pull rate statistics for a set
export function calculatePullRates(setId: string): Record<string, { count: number; percentage: number }> {
  const byRarity = getSetCardsByRarity(setId)
  const results: Record<string, { count: number; percentage: number }> = {}

  let total = 0
  Object.values(byRarity).forEach((cards) => {
    total += cards.length
  })

  Object.entries(byRarity).forEach(([rarity, cards]) => {
    results[rarity] = {
      count: cards.length,
      percentage: (cards.length / total) * 100
    }
  })

  return results
}

// Get rarity weight map for efficient lookups
export function getRarityWeightMap(): Map<string, number> {
  const weights = calculateRarityWeights()
  const map = new Map<string, number>()
  weights.forEach(({ rarity, weight }) => {
    map.set(rarity, weight)
  })
  return map
}
