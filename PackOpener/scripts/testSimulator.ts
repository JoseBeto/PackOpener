import { simulatePack } from '../lib/simulator'
import packs from '../data/packs.json'

// This is a very small pool; in real usage the set loader fetches all cards.
const pool = [
  { id: 'c1', name: 'Common1', rarity: 'Common' },
  { id: 'c2', name: 'Common2', rarity: 'Common' },
  { id: 'u1', name: 'Uncommon1', rarity: 'Uncommon' },
  { id: 'r1', name: 'Rare1', rarity: 'Rare' },
  { id: 'u2', name: 'Ultra1', rarity: 'Ultra' },
  { id: 'e1', name: 'Basic Energy', rarity: 'Common' }
]

const def = (packs as any).standard

const tally: Record<string, number> = {}
for (let i = 0; i < 5000; i++) {
  const pack = simulatePack(def, pool, { setId: 'sv10', packType: 'standard' })
  pack.forEach((c) => {
    const key = c.isReverse ? 'reverse' : c.isHolo ? 'holo' : rarityToKey(c.rarity)
    tally[key] = (tally[key] || 0) + 1
  })
}
console.log('tally', tally)

function rarityToKey(r: string | undefined) {
  if (!r) return 'Common'
  const val = r.toLowerCase()
  if (val.includes('ultra')) return 'Ultra'
  if (val.includes('rare')) return 'Rare'
  if (val.includes('uncommon')) return 'Uncommon'
  return 'Common'
}
