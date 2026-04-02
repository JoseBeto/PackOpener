import type { NextApiRequest, NextApiResponse } from 'next'
import { getCardsFromCache, setCardsCache } from '../../lib/cacheManager'
import { generateMockCards } from '../../lib/mockCards'
import https from 'https'
import fs from 'fs'
import path from 'path'

const API_ROOT = 'https://api.tcgdex.net/v2/en'

function normalizeKey(value?: string) {
  return String(value || '').trim().toLowerCase()
}

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
  const list = Array.isArray(db)
    ? db
    : Array.isArray(db?.cards)
      ? db.cards
      : (db && typeof db === 'object'
          ? Object.values(db).filter(Array.isArray).flat()
          : [])

  if (!list.length) return new Map()
  const map = new Map()
  list.forEach((card: any) => {
    const id = normalizeKey(card?.id)
    if (!id) return
    map.set(id, card.rarity || '')
  })
  return map
}

function getCardCategoryMap() {
  const db = loadDetailedCardsDB()
  const list = Array.isArray(db)
    ? db
    : Array.isArray(db?.cards)
      ? db.cards
      : (db && typeof db === 'object'
          ? Object.values(db).filter(Array.isArray).flat()
          : [])

  if (!list.length) return new Map()
  const map = new Map()
  list.forEach((card: any) => {
    const id = normalizeKey(card?.id)
    if (!id) return
    map.set(id, card.category || '')
  })
  return map
}

function getCardTypesMap() {
  const db = loadDetailedCardsDB()
  const list = Array.isArray(db)
    ? db
    : Array.isArray(db?.cards)
      ? db.cards
      : (db && typeof db === 'object'
          ? Object.values(db).filter(Array.isArray).flat()
          : [])

  if (!list.length) return new Map()
  const map = new Map()
  list.forEach((card: any) => {
    const id = normalizeKey(card?.id)
    if (!id) return
    map.set(id, Array.isArray(card.types) ? card.types : [])
  })
  return map
}

function getCardVariantsMap() {
  const db = loadDetailedCardsDB()
  const list = Array.isArray(db)
    ? db
    : Array.isArray(db?.cards)
      ? db.cards
      : (db && typeof db === 'object'
          ? Object.values(db).filter(Array.isArray).flat()
          : [])

  if (!list.length) return new Map()
  const map = new Map()
  list.forEach((card: any) => {
    const id = normalizeKey(card?.id)
    if (!id) return
    map.set(id, card.variants || {})
  })
  return map
}

function enrichCardsForRuntime(cards: any[]) {
  const rarityMap = getRarityMap()
  const categoryMap = getCardCategoryMap()
  const typesMap = getCardTypesMap()
  const variantsMap = getCardVariantsMap()

  return (cards || []).map((card: any) => {
    const id = normalizeKey(card?.id)
    const rarity = String(card?.rarity || rarityMap.get(id) || '').trim()
    return {
      ...card,
      rarity: rarity || 'Common',
      category: card?.category || categoryMap.get(id) || '',
      types: Array.isArray(card?.types) ? card.types : (typesMap.get(id) || []),
      variants: (card?.variants && Object.keys(card.variants).length > 0)
        ? card.variants
        : (variantsMap.get(id) || {}),
    }
  })
}

async function fetchCardDetailsBatched(ids: string[], concurrency = 8) {
  const detailsMap = new Map<string, any>()
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      batch.map((id) => fetchWithCertBypass(`${API_ROOT}/cards/${encodeURIComponent(id)}`))
    )
    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result.status !== 'fulfilled') continue
      const detail: any = result.value
      const id = normalizeKey(detail?.id || batch[j])
      if (!id) continue
      detailsMap.set(id, detail)
    }
  }
  return detailsMap
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

  // Prevent stale API responses from being reused by browser/proxy caches.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  
  const set = Array.isArray(req.query.set) ? req.query.set[0] : req.query.set
  if (!set) return res.status(400).json({ error: 'Missing `set` query param' })
  const normalizedSet = normalizeKey(set)

  // Check in-memory cache first
  if (cardMemCache[normalizedSet] && Date.now() - cardMemCache[normalizedSet].ts < CACHE_TTL) {
    console.log(`[Cards] Returning cached cards for set ${set} from memory`)
    const enrichedCards = enrichCardsForRuntime(cardMemCache[normalizedSet].cards)
    cardMemCache[normalizedSet] = { ts: cardMemCache[normalizedSet].ts, cards: enrichedCards }
    return res.status(200).json({ count: enrichedCards.length, cards: enrichedCards, cached: true, source: 'memory-cache' })
  }

  // Check file cache second
  const fileCache = getCardsFromCache(normalizedSet)
  if (fileCache && fileCache.length > 0) {
    console.log(`[Cards] Loaded ${fileCache.length} cards for ${set} from file cache`)
    const enrichedCards = enrichCardsForRuntime(fileCache)
    cardMemCache[normalizedSet] = { ts: Date.now(), cards: enrichedCards }
    return res.status(200).json({ count: enrichedCards.length, cards: enrichedCards, cached: true, source: 'file-cache' })
  }

  try {
    console.log(`[Cards] Fetching cards for set ${set} from tcgdex...`)
    
    // Fetch cards for the specific set from tcgdex
    // TCGDex endpoint: /v2/en/sets/{setId}
    const url = `${API_ROOT}/sets/${normalizedSet}`
    console.log(`[Cards] Request URL: ${url}`)

    const data = await fetchWithCertBypass(url)
    console.log(`[Cards] ✓ Retrieved ${data.cards?.length || 0} cards for set ${set}`)

    // Map tcgdex format to our format, enriched with rarity from detailed database
    const rarityMap = getRarityMap()
    const categoryMap = getCardCategoryMap()
    const typesMap = getCardTypesMap()
    const variantsMap = getCardVariantsMap()
    const cards = (data.cards || []).map((c: any) => {
      const id = normalizeKey(c?.id)
      // tcgdex image URLs need format appended: {baseUrl}/low.png or /high.png
      let smallImage = PLACEHOLDER_CARD
      let largeImage = PLACEHOLDER_CARD
      
      if (c.image) {
        // tcgdex provides base URL like https://assets.tcgdex.net/en/swsh/swsh3/1
        // We need to append /low.png for small and /high.png for large
        smallImage = `${c.image}/low.png`
        largeImage = `${c.image}/high.png`
      }

      // Use detailed DB / API value now; missing values are backfilled below via /cards/{id}.
      const rarity = String(rarityMap.get(id) || c.rarity || '').trim()

      return {
        id: c.id,
        name: c.name,
        images: {
          small: smallImage,
          large: largeImage
        },
        rarity,
        category: c.category || categoryMap.get(id) || '',
        types: Array.isArray(c.types) ? c.types : (typesMap.get(id) || []),
        variants: (c.variants && Object.keys(c.variants).length > 0)
          ? c.variants
          : (variantsMap.get(id) || {}),
        setId: normalizedSet,
        number: c.localId
      }
    })

    const missingRarityCards = cards.filter((card: any) => !String(card?.rarity || '').trim() && normalizeKey(card?.id))
    if (missingRarityCards.length > 0) {
      console.log(`[Cards] Missing rarity for ${missingRarityCards.length} cards in ${normalizedSet}, fetching card details...`)
      const detailMap = await fetchCardDetailsBatched(missingRarityCards.map((card: any) => String(card.id)))
      for (const card of cards) {
        const id = normalizeKey(card?.id)
        if (!id) continue
        const detail = detailMap.get(id)
        if (!detail) continue
        if (!String(card.rarity || '').trim()) card.rarity = detail.rarity || card.rarity
        if (!String(card.category || '').trim()) card.category = detail.category || card.category
        if ((!Array.isArray(card.types) || card.types.length === 0) && Array.isArray(detail.types)) card.types = detail.types
        if ((!card.variants || Object.keys(card.variants).length === 0) && detail.variants) card.variants = detail.variants
      }
    }

    const finalizedCards = cards.map((card: any) => ({
      ...card,
      rarity: String(card?.rarity || '').trim() || 'Common',
      category: card?.category || '',
      types: Array.isArray(card?.types) ? card.types : [],
      variants: card?.variants || {},
    }))

    cardMemCache[normalizedSet] = { ts: Date.now(), cards: finalizedCards }
    setCardsCache(normalizedSet, finalizedCards)
    return res.status(200).json({ count: finalizedCards.length, cards: finalizedCards, source: 'tcgdex' })
  } catch (tcgdexError: any) {
    console.log(`[Cards] tcgdex fetch failed (${tcgdexError.message}), generating mock cards`)
    // Generate mock cards for development/fallback
    const mockCards = generateMockCards(150)
    cardMemCache[normalizedSet] = { ts: Date.now(), cards: mockCards }
    return res.status(200).json({
      count: mockCards.length,
      cards: mockCards,
      source: 'mock',
      note: 'TCGDex API unavailable; using generated mock cards.'
    })
  }
}
