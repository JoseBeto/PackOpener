import type { NextApiRequest, NextApiResponse } from 'next'
import { getCardsFromCache, setCardsCache } from '../../lib/cacheManager'
import { generateMockCards } from '../../lib/mockCards'
import https from 'https'
import fs from 'fs'
import path from 'path'

const API_ROOT = 'https://api.tcgdex.net/v2/en'

// Load detailed card database (with rarity info) once
let detailedCardsCache: any = null
function loadDetailedCardsDB() {
  if (detailedCardsCache) return detailedCardsCache
  try {
    const dbPath = path.join(process.cwd(), 'data/detailed-cards/all-cards-detailed.json')
    if (fs.existsSync(dbPath)) {
      detailedCardsCache = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
      console.log(`[Cards] Loaded detailed card database: ${detailedCardsCache.cards?.length || 0} cards`)
    }
  } catch (e) {
    console.error('[Cards] Failed to load detailed cards DB:', e)
  }
  return detailedCardsCache
}

// Build a map of card ID to rarity
function getRarityMap() {
  const db = loadDetailedCardsDB()
  if (!db?.cards) return new Map()
  const map = new Map()
  db.cards.forEach((card: any) => {
    map.set(card.id, card.rarity || 'Common')
  })
  return map
}

// Create an HTTPS request helper that bypasses certificate verification
function fetchWithCertBypass(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      })
    })
    request.on('error', reject)
    request.setTimeout(30000, () => {
      request.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

// In-memory cache for quick access during development
let cardMemCache: Record<string, { ts: number; cards: any[] }> = {}
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

// Placeholder card image when card has no image
const PLACEHOLDER_CARD = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%230b1220"/%3E%3Ctext x="122.5" y="171" text-anchor="middle" dominant-baseline="middle" fill="%2394a3b8" font-size="14"%3ENo Image Available%3C/text%3E%3C/svg%3E'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Guard against build-time or non-http invocations
  if (!res || typeof res.status !== 'function' || typeof res.json !== 'function') {
    console.log('[Cards] Build-time invocation ignored')
    return
  }
  
  const set = Array.isArray(req.query.set) ? req.query.set[0] : req.query.set
  if (!set) return res.status(400).json({ error: 'Missing `set` query param' })

  // Check in-memory cache first
  if (cardMemCache[set] && Date.now() - cardMemCache[set].ts < CACHE_TTL) {
    console.log(`[Cards] Returning cached cards for set ${set} from memory`)
    return res.status(200).json({ count: cardMemCache[set].cards.length, cards: cardMemCache[set].cards, cached: true, source: 'memory-cache' })
  }

  // Check file cache second
  const fileCache = getCardsFromCache(set)
  if (fileCache && fileCache.length > 0) {
    console.log(`[Cards] Loaded ${fileCache.length} cards for ${set} from file cache`)
    cardMemCache[set] = { ts: Date.now(), cards: fileCache }
    return res.status(200).json({ count: fileCache.length, cards: fileCache, cached: true, source: 'file-cache' })
  }

  try {
    console.log(`[Cards] Fetching cards for set ${set} from tcgdex...`)
    
    // Fetch cards for the specific set from tcgdex
    // TCGDex endpoint: /v2/en/sets/{setId}
    const url = `${API_ROOT}/sets/${set}`
    console.log(`[Cards] Request URL: ${url}`)

    const data = await fetchWithCertBypass(url)
    console.log(`[Cards] ✓ Retrieved ${data.cards?.length || 0} cards for set ${set}`)

    // Map tcgdex format to our format, enriched with rarity from detailed database
    const rarityMap = getRarityMap()
    const cards = (data.cards || []).map((c: any) => {
      // tcgdex image URLs need format appended: {baseUrl}/low.png or /high.png
      let smallImage = PLACEHOLDER_CARD
      let largeImage = PLACEHOLDER_CARD
      
      if (c.image) {
        // tcgdex provides base URL like https://assets.tcgdex.net/en/swsh/swsh3/1
        // We need to append /low.png for small and /high.png for large
        smallImage = `${c.image}/low.png`
        largeImage = `${c.image}/high.png`
      }

      // Use rarity from detailed database, fall back to API response, then 'Common'
      const rarity = rarityMap.get(c.id) || c.rarity || 'Common'

      return {
        id: c.id,
        name: c.name,
        images: {
          small: smallImage,
          large: largeImage
        },
        rarity,
        variants: c.variants || {},
        setId: set,
        number: c.localId
      }
    })

    cardMemCache[set] = { ts: Date.now(), cards }
    setCardsCache(set, cards)
    return res.status(200).json({ count: cards.length, cards, source: 'tcgdex' })
  } catch (tcgdexError: any) {
    console.log(`[Cards] tcgdex fetch failed (${tcgdexError.message}), generating mock cards`)
    // Generate mock cards for development/fallback
    const mockCards = generateMockCards(150)
    cardMemCache[set] = { ts: Date.now(), cards: mockCards }
    return res.status(200).json({
      count: mockCards.length,
      cards: mockCards,
      source: 'mock',
      note: 'TCGDex API unavailable; using generated mock cards.'
    })
  }
}
