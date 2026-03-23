import type { NextApiRequest, NextApiResponse } from 'next'

const API_ROOT = 'https://api.tcgdex.net/v1/en'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[Health] Starting connectivity check...')
  
  try {
    // Test 1: Can we reach tcgdex.net?
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const headers: Record<string, string> = { 'User-Agent': 'RipRealm/1.0' }
    
    console.log('[Health] Attempting to reach tcgdex.net...')
    const startTime = Date.now()
    const r = await fetch(`${API_ROOT}/sets`, { headers, signal: controller.signal })
    const elapsed = Date.now() - startTime
    clearTimeout(timeoutId)
    
    console.log(`[Health] Response status: ${r.status}, elapsed: ${elapsed}ms`)
    
    if (!r.ok) {
      return res.status(200).json({
        tcgdex: {
          reachable: false,
          status: r.status,
          elapsed,
          message: `API returned ${r.status}`
        }
      })
    }
    
    return res.status(200).json({
      tcgdex: {
        reachable: true,
        status: r.status,
        elapsed,
        message: 'Connection successful'
      }
    })
  } catch (err: any) {
    console.error(`[Health] Error: ${err.message}`)
    return res.status(200).json({
      tcgdex: {
        reachable: false,
        error: err.message,
        timeout: err.name === 'AbortError'
      }
    })
  }
}
