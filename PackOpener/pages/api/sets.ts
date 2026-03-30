import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetsFromCacheWithMeta, listCachedSets, setSetsCache } from '../../lib/cacheManager'
import https from 'https'
import fs from 'fs'
import path from 'path'

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

async function fetchWithConcurrency<T>(
  items: string[],
  fetchFn: (item: string) => Promise<T>,
  concurrency: number = 4,
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fetchFn))
    for (const result of batchResults) {
      if (result.status === 'fulfilled') results.push(result.value)
    }
  }
  return results
}

// Create an HTTPS request helper that bypasses certificate verification
function fetchWithCertBypass(url: string, timeoutMs: number = 90000): Promise<any> {
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
    request.setTimeout(timeoutMs, () => {
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

function getDetailedCardsSetNameMap(): Map<string, string> {
  const map = new Map<string, string>()
  const dir = path.join(process.cwd(), 'data', 'detailed-cards')
  try {
    if (!fs.existsSync(dir)) return map
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('-cards.json') && name !== 'all-cards-detailed.json')
    for (const file of files) {
      const filepath = path.join(dir, file)
      const raw = fs.readFileSync(filepath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (typeof parsed?.setId === 'string' && typeof parsed?.setName === 'string' && parsed.setName.trim()) {
        map.set(parsed.setId, parsed.setName)
      }
    }
  } catch (error) {
    console.log(`[Sets] Failed to read detailed set names: ${(error as Error).message}`)
  }
  return map
}

function deriveSetsFromCardCache(): Array<{ id: string; name: string; releaseDate?: string; logo?: string }> {
  const ids = listCachedSets()
  const setNameMap = getDetailedCardsSetNameMap()
  return ids
    .map((id) => ({ id, name: setNameMap.get(id) || id.toUpperCase() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function mapSetPayload(detail: any): { id: string; name: string; releaseDate?: string; logo?: string } | null {
  const id = typeof detail?.id === 'string' ? detail.id : ''
  const name = typeof detail?.name === 'string' && detail.name.trim() ? detail.name : id.toUpperCase()
  if (!id || !name) return null
  const releaseDate = typeof detail?.releaseDate === 'string' ? detail.releaseDate : undefined
  const logo = detail?.logo ? `${detail.logo}.png` : undefined
  return {
    id,
    name,
    releaseDate,
    ...(logo && { logo }),
  }
}

async function enrichSetsWithMetadata(
  sets: Array<{ id: string; name: string; releaseDate?: string; logo?: string }>,
): Promise<Array<{ id: string; name: string; releaseDate?: string; logo?: string }>> {
  if (!sets.length) return sets

  const targetIds = sets
    .filter((set) => !set.releaseDate || !set.logo)
    .map((set) => set.id)

  if (!targetIds.length) return sets

  const details = await fetchWithConcurrency(
    targetIds,
    (id) => fetchWithCertBypass(`${API_ROOT}/sets/${id}`, 20000),
    8,
  )

  const metadataById = new Map<string, { name: string; releaseDate?: string; logo?: string }>()
  for (const detail of details) {
    const mapped = mapSetPayload(detail)
    if (!mapped) continue
    metadataById.set(mapped.id, {
      name: mapped.name,
      releaseDate: mapped.releaseDate,
      logo: mapped.logo,
    })
  }

  if (!metadataById.size) return sets

  return sets.map((set) => {
    const metadata = metadataById.get(set.id)
    if (!metadata) return set
    return {
      ...set,
      name: metadata.name || set.name,
      releaseDate: metadata.releaseDate || set.releaseDate,
      logo: metadata.logo || set.logo,
    }
  })
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
      let sets = (Array.isArray(data) ? data : [])
        .map(mapSetPayload)
        .filter((set): set is NonNullable<typeof set> => Boolean(set))

      console.log(`[Sets] ✓ Fetched ${sets.length} sets from tcgdex.net`)

      if (!sets.length) {
        throw new Error('tcgdex returned no sets')
      }

      // tcgdex /sets payload often omits releaseDate/logo; enrich from per-set metadata.
      sets = await enrichSetsWithMetadata(sets)
      
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

    // Try lightweight per-set metadata fetch for known local set IDs.
    const knownSetIds = [...new Set(listCachedSets())]
    if (knownSetIds.length > 0) {
      try {
        const details = await fetchWithConcurrency(
          knownSetIds,
          (id) => fetchWithCertBypass(`${API_ROOT}/sets/${id}`),
          4,
        )
        const knownSets = details
          .map(mapSetPayload)
          .filter((set): set is NonNullable<typeof set> => Boolean(set))

        if (knownSets.length > 0) {
          sortSetsNewestFirst(knownSets)
          inMemoryCache = { ts: Date.now(), sets: knownSets }
          console.log(`[Sets] Returning ${knownSets.length} known sets from per-set metadata fetch`)
          return res.status(200).json({ count: knownSets.length, sets: knownSets, source: 'known-sets-metadata-fallback', error: err.message })
        }
      } catch (knownSetErr: any) {
        console.log(`[Sets] Known-set metadata fallback failed: ${knownSetErr.message}`)
      }
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
