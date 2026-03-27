import fs from 'fs'
import path from 'path'

const BUNDLED_CACHE_DIR = path.join(process.cwd(), 'data', 'cache')
const RUNTIME_CACHE_DIR = process.env.VERCEL
  ? path.join('/tmp', 'riprealm-cache')
  : BUNDLED_CACHE_DIR

function canWriteRuntimeCache() {
  return process.env.NODE_ENV !== 'production' || Boolean(process.env.VERCEL)
}

function getReadableCachePaths(filename: string) {
  const runtimePath = path.join(RUNTIME_CACHE_DIR, filename)
  const bundledPath = path.join(BUNDLED_CACHE_DIR, filename)
  return runtimePath === bundledPath ? [runtimePath] : [runtimePath, bundledPath]
}

// Ensure cache directory exists
export function ensureCacheDir() {
  if (!canWriteRuntimeCache()) return
  if (!fs.existsSync(RUNTIME_CACHE_DIR)) {
    fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true })
  }
}

export type SetCacheEntry = { id: string; name: string; releaseDate?: string; logo?: string }
export type CardCacheEntry = { id: string; name: string; images: { small?: string; large?: string }; rarity?: string }
export type SetCacheReadResult = { sets: SetCacheEntry[]; cachePath: string; mtimeMs: number }

// Sets cache
export function getSetsFromCache(): SetCacheEntry[] | null {
  try {
    for (const filepath of getReadableCachePaths('sets.json')) {
      if (fs.existsSync(filepath)) {
        const data = fs.readFileSync(filepath, 'utf-8')
        return JSON.parse(data)
      }
    }
  } catch (e) {
    console.error('[Cache] Error reading sets cache:', e)
  }
  return null
}

export function getSetsFromCacheWithMeta(): SetCacheReadResult | null {
  try {
    for (const filepath of getReadableCachePaths('sets.json')) {
      if (fs.existsSync(filepath)) {
        const stat = fs.statSync(filepath)
        const data = fs.readFileSync(filepath, 'utf-8')
        return {
          sets: JSON.parse(data),
          cachePath: filepath,
          mtimeMs: stat.mtimeMs,
        }
      }
    }
  } catch (e) {
    console.error('[Cache] Error reading sets cache metadata:', e)
  }
  return null
}

export function setSetsCache(sets: SetCacheEntry[]) {
  try {
    if (!canWriteRuntimeCache()) return
    ensureCacheDir()
    const filepath = path.join(RUNTIME_CACHE_DIR, 'sets.json')
    fs.writeFileSync(filepath, JSON.stringify(sets, null, 2), 'utf-8')
    console.log(`[Cache] Saved ${sets.length} sets to ${filepath}`)
  } catch (e) {
    console.error('[Cache] Error writing sets cache:', e)
  }
}

// Cards cache per set
export function getCardsFromCache(setId: string): CardCacheEntry[] | null {
  try {
    for (const filepath of getReadableCachePaths(`cards-${setId}.json`)) {
      if (fs.existsSync(filepath)) {
        const data = fs.readFileSync(filepath, 'utf-8')
        return JSON.parse(data)
      }
    }
  } catch (e) {
    console.error(`[Cache] Error reading cards cache for ${setId}:`, e)
  }
  return null
}

export function setCardsCache(setId: string, cards: CardCacheEntry[]) {
  try {
    if (!canWriteRuntimeCache()) return
    ensureCacheDir()
    const filepath = path.join(RUNTIME_CACHE_DIR, `cards-${setId}.json`)
    fs.writeFileSync(filepath, JSON.stringify(cards, null, 2), 'utf-8')
    console.log(`[Cache] Saved ${cards.length} cards for set ${setId} to ${filepath}`)
  } catch (e) {
    console.error(`[Cache] Error writing cards cache for ${setId}:`, e)
  }
}

// List all cached sets
export function listCachedSets(): string[] {
  try {
    const files = new Set<string>()

    for (const dir of [RUNTIME_CACHE_DIR, BUNDLED_CACHE_DIR]) {
      if (!fs.existsSync(dir)) continue
      for (const file of fs.readdirSync(dir)) {
        files.add(file)
      }
    }

    return [...files]
      .filter((f) => f.startsWith('cards-') && f.endsWith('.json'))
      .map((f) => f.replace('cards-', '').replace('.json', ''))
  } catch (e) {
    return []
  }
}
