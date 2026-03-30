import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetsFromCacheWithMeta, listCachedSets, setSetsCache } from '../../lib/cacheManager'
import https from 'https'

// Disable SSL certificate verification for development
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const API_ROOT = 'https://api.tcgdex.net/v2/en'

function parseReleaseDate(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const normalized = value.trim().replace(/\//g, '-')
  const timestamp = Date.parse(normalized)
  if (!Number.isNaN(timestamp)) return timestamp

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    return Date.UTC(year, month - 1, day)
  }

  return Number.NEGATIVE_INFINITY
}

function sortSetsNewestFirst<T extends { id: string; name: string; releaseDate?: string }>(sets: T[]): T[] {
  return sets.sort((a, b) => {
    const aTs = parseReleaseDate(a.releaseDate)
    const bTs = parseReleaseDate(b.releaseDate)
    if (aTs !== bTs) return bTs - aTs

    // deterministic fallback when releaseDate is missing/equal
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.id.localeCompare(b.id)
  })
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

// In-memory cache for quick access
let inMemoryCache: { ts: number; sets: Array<{ id: string; name: string; releaseDate?: string; logo?: string }> } | null = null
const CACHE_TTL = 1000 * 60 * 60 // 1 hour
const FILE_CACHE_TTL = 1000 * 60 * 30 // 30 minutes

// Empty fallback - forces fresh fetch from tcgdex on every error
const FALLBACK_SETS: Array<{ id: string; name: string }> = []

function deriveSetsFromCardCache(): Array<{ id: string; name: string; releaseDate?: string; logo?: string }> {
  const ids = listCachedSets()
  return ids
    .map((id) => ({ id, name: id.toUpperCase() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const refreshQuery = Array.isArray(req.query.refresh) ? req.query.refresh[0] : req.query.refresh
  const forceRefresh = refreshQuery === '1' || refreshQuery === 'true'
  let staleCacheSets: Array<{ id: string; name: string; releaseDate?: string; logo?: string }> | null = null

  try {
    // Check in-memory cache first
    if (!forceRefresh && inMemoryCache && inMemoryCache.sets.length > 0 && Date.now() - inMemoryCache.ts < CACHE_TTL) {
      console.log('[Sets] Returning cached sets from memory')
      return res.status(200).json({ count: inMemoryCache.sets.length, sets: inMemoryCache.sets, source: 'memory-cache' })
    }
    if (inMemoryCache && inMemoryCache.sets.length === 0) {
      inMemoryCache = null
    }

    // Check file cache second
    const fileCache = getSetsFromCacheWithMeta()
    if (!forceRefresh && fileCache && fileCache.sets.length > 0) {
      const ageMs = Date.now() - fileCache.mtimeMs
      const isFresh = ageMs < FILE_CACHE_TTL

      if (isFresh) {
        console.log(`[Sets] Loaded ${fileCache.sets.length} sets from file cache`)
        inMemoryCache = { ts: Date.now(), sets: fileCache.sets }
        return res.status(200).json({ count: fileCache.sets.length, sets: fileCache.sets, source: 'file-cache' })
      }

      staleCacheSets = fileCache.sets
      console.log(`[Sets] File cache stale (${Math.round(ageMs / 1000)}s old), refreshing from tcgdex...`)
    }

    console.log('[Sets] No cache found, fetching from tcgdex...')
    
    // Fetch sets from tcgdex (no authentication required)
    const url = `${API_ROOT}/sets`
    console.log('[Sets] URL:', url)
    
    try {
      const data = await fetchWithCertBypass(url)
      const sets = (Array.isArray(data) ? data : [])
        .map((detail: any) => {
          const id = typeof detail?.id === 'string' ? detail.id : ''
          const name = typeof detail?.name === 'string' && detail.name.trim() ? detail.name : id.toUpperCase()
          const releaseDate = typeof detail?.releaseDate === 'string' ? detail.releaseDate : undefined
          const logo = detail?.logo ? `${detail.logo}.png` : undefined
          return {
            id,
            name,
            releaseDate,
            ...(logo && { logo }),
          }
        })
        .filter((set) => Boolean(set.id) && Boolean(set.name))

      console.log(`[Sets] ✓ Fetched ${sets.length} sets from tcgdex.net`)

      if (!sets.length) {
        throw new Error('tcgdex returned no sets')
      }
      
      // Sort by release date, newest first
      sortSetsNewestFirst(sets)
      
      console.log(`[Sets] ✓ Processed ${sets.length} sets with release dates, saving to cache`)
      
      // Save to file cache
      setSetsCache(sets)
      inMemoryCache = { ts: Date.now(), sets }
      return res.status(200).json({ count: sets.length, sets, source: 'tcgdex' })
    } catch (fetchErr: any) {
      console.error(`[Sets] tcgdex fetch failed: ${fetchErr.message}`)
      throw fetchErr
    }
  } catch (err: any) {
    console.log(`[Sets] Error fetching from API: ${err.message}`)
    if (staleCacheSets && staleCacheSets.length > 0) {
      console.log(`[Sets] Returning stale cache (${staleCacheSets.length} sets) after fetch failure`)
      inMemoryCache = { ts: Date.now(), sets: staleCacheSets }
      return res.status(200).json({ count: staleCacheSets.length, sets: staleCacheSets, source: 'stale-file-cache', error: err.message })
    }

    const derivedFallbackSets = deriveSetsFromCardCache()
    if (derivedFallbackSets.length > 0) {
      console.log(`[Sets] Returning derived fallback (${derivedFallbackSets.length} sets) from cached card files`)
      inMemoryCache = { ts: Date.now(), sets: derivedFallbackSets }
      return res.status(200).json({ count: derivedFallbackSets.length, sets: derivedFallbackSets, source: 'derived-cache-fallback', error: err.message })
    }

    console.log(`[Sets] Returning fallback sets (${FALLBACK_SETS.length} sets)`)
    // Return fallback list but do not persist empty fallback to cache.
    return res.status(200).json({ count: FALLBACK_SETS.length, sets: FALLBACK_SETS, source: 'fallback', error: err.message })
  }
}
