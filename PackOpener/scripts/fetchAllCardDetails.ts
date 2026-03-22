import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_ROOT = 'https://api.tcgdex.net/v2/en'

// Helper to fetch with certificate bypass
function fetchWithCertBypass(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
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

// Helper for concurrency control
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

async function main() {
  const dataDir = path.join(__dirname, '../data/detailed-cards')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  try {
    // Step 1: Fetch all sets
    console.log('[1/4] Fetching all sets...')
    const sets = await fetchWithCertBypass(`${API_ROOT}/sets`)
    console.log(`✓ Fetched ${sets.length} sets`)

    // Step 2: For each set, fetch all cards in that set
    console.log('\n[2/4] Fetching all cards for each set...')
    const allCardIds: string[] = []

    for (let i = 0; i < sets.length; i++) {
      const set = sets[i]
      process.stdout.write(`\r  Fetching set ${i + 1}/${sets.length} (${set.id})...`)

      try {
        const setData = await fetchWithCertBypass(`${API_ROOT}/sets/${set.id}`)
        const cardIds = setData.cards?.map((c: any) => c.id) || []
        allCardIds.push(...cardIds)

        // Save set card list for reference
        const setFile = path.join(dataDir, `${set.id}-cards.json`)
        fs.writeFileSync(
          setFile,
          JSON.stringify({
            setId: set.id,
            setName: set.name,
            cardCount: cardIds.length,
            cardIds: cardIds
          }, null, 2)
        )
      } catch (e: any) {
        console.log(`\n  ✗ Error fetching set ${set.id}: ${e.message}`)
      }
    }

    console.log(`\n✓ Found ${allCardIds.length} total cards across all sets`)

    // Step 3: Fetch individual card details in batches
    console.log(`\n[3/4] Fetching individual card details (${allCardIds.length} cards)...`)
    const cardDetails: any[] = []
    const failedCards: string[] = []

    // Process in chunks of 10 to avoid overwhelming the API
    for (let i = 0; i < allCardIds.length; i += 10) {
      const batch = allCardIds.slice(i, i + 10)
      process.stdout.write(`\r  Processed ${Math.min(i + 10, allCardIds.length)}/${allCardIds.length} cards...`)

      const batchDetails = await Promise.all(
        batch.map((cardId: string) =>
          fetchWithCertBypass(`${API_ROOT}/cards/${cardId}`)
            .then(card => {
              cardDetails.push(card)
              return true
            })
            .catch(() => {
              failedCards.push(cardId)
              return false
            })
        )
      )
    }

    console.log(`\n✓ Fetched details for ${cardDetails.length} cards`)
    if (failedCards.length > 0) {
      console.log(`⚠ Failed to fetch ${failedCards.length} cards (likely variance-only variants)`)
    }

    // Step 4: Save all card details to a file
    console.log('\n[4/4] Saving all card details...')
    const outputFile = path.join(dataDir, 'all-cards-detailed.json')
    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        {
          totalCards: cardDetails.length,
          fetchedAt: new Date().toISOString(),
          cards: cardDetails
        },
        null,
        2
      )
    )

    console.log(`✓ Saved all card details to ${outputFile}`)

    // Summary statistics
    console.log('\n=== Summary ===')
    console.log(`Total sets: ${sets.length}`)
    console.log(`Total cards: ${cardDetails.length}`)

    // Rarity breakdown
    const rarityMap: Record<string, number> = {}
    cardDetails.forEach((card: any) => {
      const rarity = card.rarity || 'Unknown'
      rarityMap[rarity] = (rarityMap[rarity] || 0) + 1
    })

    console.log('\nRarity Distribution:')
    Object.entries(rarityMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([rarity, count]) => {
        console.log(`  ${rarity}: ${count}`)
      })

    // Variants breakdown
    const withVariants = cardDetails.filter((c: any) => c.variants && Object.keys(c.variants).length > 0)
    console.log(`\nCards with variants: ${withVariants.length}`)

    console.log('\n✓ All done!')
  } catch (error: any) {
    console.error('\n✗ Fatal error:', error.message)
    process.exit(1)
  }
}

main()
