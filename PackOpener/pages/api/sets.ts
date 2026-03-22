import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetsFromCache, setSetsCache } from '../../lib/cacheManager'
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

// Helper to fetch with concurrency limit
async function fetchWithConcurrency<T>(
  items: string[],
  fetchFn: (item: string) => Promise<T>,
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fetchFn))
    results.push(...batchResults)
  }
  return results
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

// Empty fallback - forces fresh fetch from tcgdex on every error
const FALLBACK_SETS: Array<{ id: string; name: string }> = []


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check in-memory cache first
    if (inMemoryCache && Date.now() - inMemoryCache.ts < CACHE_TTL) {
      console.log('[Sets] Returning cached sets from memory')
      return res.status(200).json({ count: inMemoryCache.sets.length, sets: inMemoryCache.sets, source: 'memory-cache' })
    }

    // Check file cache second
    const fileCache = getSetsFromCache()
    if (fileCache && fileCache.length > 0) {
      console.log(`[Sets] Loaded ${fileCache.length} sets from file cache`)
      inMemoryCache = { ts: Date.now(), sets: fileCache }
      return res.status(200).json({ count: fileCache.length, sets: fileCache, source: 'file-cache' })
    }

    console.log('[Sets] No cache found, fetching from tcgdex...')
    
    // Fetch sets from tcgdex (no authentication required)
    const url = `${API_ROOT}/sets`
    console.log('[Sets] URL:', url)
    
    try {
      const url = `${API_ROOT}/sets`
      console.log('[Sets] URL:', url)
      
      const data = await fetchWithCertBypass(url)
      console.log(`[Sets] ✓ Fetched ${data.length || 0} sets from tcgdex.net`)
      
      // Fetch individual set details to get release dates
      console.log('[Sets] Fetching set details for release dates...')
      const setIds = data.map((s: any) => s.id)
      const setDetails = await fetchWithConcurrency(
        setIds,
        (id: string) => fetchWithCertBypass(`${API_ROOT}/sets/${id}`),
        5 // Limit to 5 concurrent requests
      )
      
      const sets = setDetails.map((detail: any) => {
        // TCGDex logo URL: detail.logo is a base URL without extension
        const logo = detail.logo ? `${detail.logo}.png` : undefined
        return {
          id: detail.id,
          name: detail.name,
          releaseDate: detail.releaseDate,
          ...(logo && { logo }),
        }
      })
      
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
    console.log(`[Sets] Returning fallback sets (${FALLBACK_SETS.length} sets)`)
    // on error, return fallback list
    inMemoryCache = { ts: Date.now(), sets: FALLBACK_SETS }
    setSetsCache(FALLBACK_SETS)
    return res.status(200).json({ count: FALLBACK_SETS.length, sets: FALLBACK_SETS, source: 'fallback', error: err.message })
  }
}
