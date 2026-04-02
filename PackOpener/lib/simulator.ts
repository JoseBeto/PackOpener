import { getSetFamily, getBallTypes } from './rarityLadder'

type Card = {
  id: string
  name: string
  images?: { small?: string; large?: string }
  rarity?: string
  category?: string // e.g., 'Pokémon', 'Trainer', 'Energy'
  hp?: number
  types?: string[]
  // runtime flags set when constructing a pack
  isReverse?: boolean
  isHolo?: boolean
  isGodPack?: boolean
  special?: string // e.g. 'Illustration', 'DoubleRare', 'SecretRare', 'GodPack'
  variants?: Record<string, any>
}

type PackDefinition = {
  cardsPerPack: number
  // for legacy or non-modern packs we may still have a flat distribution
  rarityDistribution?: Record<string, number>
  guarantee?: { minRareOrAbove?: number }
  // optional slot-based template marker, e.g. "modern" for SV-era
  template?: string
  // weights used by the modern/slot template
  slotWeights?: {
    reverse?: Record<string, number>
    rareSlot?: Record<string, number>
    bonusSlot?: Record<string, number>
    bonusReverse?: Record<string, number>
  }
  // rarity weight map for weighted card selection
  rarityWeightMap?: Map<string, number>
}

function rarityToKey(r: string | undefined) {
  if (!r) return 'Common'
  const val = r.toLowerCase()
  if (val.includes('secret') || val.includes('hyper') || val.includes('crown') || val.includes('three star')) return 'Secret'
  if (
    val.includes('shiny ultra rare') ||
    val.includes('shiny rare v') ||
    val.includes('shiny rare vmax') ||
    val.includes('shiny rare vstar') ||
    val.includes('holo rare v') ||
    val.includes('holo rare vmax') ||
    val.includes('holo rare vstar') ||
    val.includes('rare holo lv.x') ||
    val.includes('radiant rare') ||
    val.includes('amazing rare') ||
    val.includes('ace spec') ||
    val.includes('full art trainer') ||
    val.includes('rare prime') ||
    val.includes('legend')
  ) return 'Ultra'
  if (
    val.includes('ultra') ||
    val.includes('ex') ||
    val.includes('vmax') ||
    val.includes('vstar') ||
    val.includes('double rare') ||
    val.includes('two star') ||
    val.includes('one shiny') ||
    val.includes('two shiny')
  ) return 'Ultra'
  // Base Shiny Rare (non-V/VMAX) → Rare bucket for legacy/fallback packs (slot-based packs use isShinyRareBase filter directly)
  if (val.includes('shiny rare')) return 'Rare'
  if (
    val.includes('rare') ||
    val.includes('holo') ||
    val.includes('holofoil') ||
    val.includes('one star') ||
    val.includes('four diamond') ||
    val.includes('three diamond')
  ) return 'Rare'
  if (val.includes('uncommon') || val.includes('unco') || val.includes('two diamond')) return 'Uncommon'
  return 'Common'
}

export function simulatePack(packDef: PackDefinition, pool: Card[], opts?: { setId?: string; packType?: 'standard' | 'premium' }) {
  const result: Card[] = []
  const setId = opts?.setId || ''
  const packType = opts?.packType || 'standard'
  const isPocketSet = getSetFamily(setId) === 'pocket'
  const baseGodPackRate = isPocketSet ? 0.0006 : 0.00035
  const GOD_PACK_RATE = packType === 'premium' ? baseGodPackRate * 2 : baseGodPackRate

  // Get rarity weight map from packDef or use defaults
  const rarityWeightMap = packDef.rarityWeightMap || new Map([
    ['Secret', 0.026],
    ['Ultra', 0.065],
    ['Rare', 0.186],
    ['Uncommon', 0.213],
    ['Common', 0.257],
  ])
  
  // Build rarity buckets from pool
  const buckets: Record<string, Card[]> = {}
  for (const c of pool) {
    const k = rarityToKey(c.rarity)
    buckets[k] = buckets[k] || []
    buckets[k].push({ ...c })
  }

  // helper: draw n cards from a bucket without replacement (fallback to random with replacement)
  function draw(bucketName: string, n: number): Card[] {
    const out: Card[] = []
    const bucket = (buckets[bucketName] || []).slice()
    for (let i = 0; i < n; i++) {
      if (bucket.length === 0) {
        // fallback to any card in pool
        const any = pool[Math.floor(Math.random() * pool.length)]
        out.push({ ...any })
      } else {
        const idx = Math.floor(Math.random() * bucket.length)
        out.push(bucket.splice(idx, 1)[0])
      }
    }
    return out
  }

  // helper: pick a single card by weighted rarity
  function pickByRarity(rarityKey?: string): Card {
    let targetBucket: string
    if (rarityKey) {
      targetBucket = rarityKey
    } else {
      // weight-based selection using database weights
      let roll = Math.random()
      targetBucket = 'Common'
      // Try to match rarity buckets to weights
      const rarities = ['Secret', 'Ultra', 'Rare', 'Uncommon', 'Common']
      for (const rarity of rarities) {
        const weight = rarityWeightMap.get(rarity) || 0
        if (roll < weight) {
          targetBucket = rarity
          break
        }
        roll -= weight
      }
    }

    const bucket = (buckets[targetBucket] || []).slice()
    if (bucket.length === 0) {
      const any = pool[Math.floor(Math.random() * pool.length)]
      return { ...any }
    }
    const idx = Math.floor(Math.random() * bucket.length)
    return { ...bucket[idx] }
  }

  function pickFromCandidates(candidates: Card[], fallback?: () => Card): Card {
    if (candidates.length > 0) {
      return { ...candidates[Math.floor(Math.random() * candidates.length)] }
    }
    return fallback ? fallback() : pickByRarity()
  }

  const normalizedSetId = setId.trim().toLowerCase()
  const isSVOrMegaSet = /^sv\d/.test(normalizedSetId) || /^me\d/.test(normalizedSetId)
  const isAscendedHeroesSet = normalizedSetId === 'me02.5'
  const isAscendedHeroesBigHit = (card: Card) => {
    const text = (card.rarity || '').toLowerCase()
    return (
      text.includes('double rare') ||
      text.includes('ultra rare') ||
      text.includes('mega attack') ||
      text.includes('illustration') ||
      text.includes('special illustration') ||
      text.includes('mega hyper')
    )
  }
  const isTeamRocketPokemon = (card: Card) => /team rocket/i.test(card.name || '')
  const ascendedAssignedPatterns = ['ReversePokeBall', 'ReverseLoveBall', 'ReverseFriendBall', 'ReverseQuickBall', 'ReverseDuskBall'] as const
  const ascendedPatternMap = new Map<string, (typeof ascendedAssignedPatterns)[number]>()
  if (isAscendedHeroesSet) {
    const eligible = pool
      .filter((card) => {
        const category = (card.category || '').toLowerCase()
        return category === 'pokemon' && !isAscendedHeroesBigHit(card) && !isTeamRocketPokemon(card)
      })
      .slice()
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
    eligible.forEach((card, idx) => {
      ascendedPatternMap.set(card.id, ascendedAssignedPatterns[idx % ascendedAssignedPatterns.length])
    })
  }
  const getAssignedAscendedHeroesPattern = (card: Card) => {
    if (isTeamRocketPokemon(card)) return 'ReverseRocketR'
    return ascendedPatternMap.get(card.id) || 'ReversePokeBall'
  }

  function applyMainlineReverseFinish(card: Card) {
    if (isPocketSet || !card.isReverse) return
    const balls = getBallTypes(setId)
    if (!balls.pokeball) return

    if (isAscendedHeroesSet) {
      const category = (card.category || '').toLowerCase()
      if (category === 'trainer' || category === 'energy' || isAscendedHeroesBigHit(card)) return
      if (category !== 'pokemon') return

      // Ascended Heroes (me02.5) reverse model: non-ex Pokémon have two reverse styles:
      // 1. Energy reverse holo (default)
      // 2. Assigned pattern reverse holo (Poké Ball / Love Ball / Friend Ball / Quick Ball / Dusk Ball / Rocket R)
      //
      // Real-world data (Japanese Mega Dream ex, 1000+ packs):
      // - ~71% of packs have any reverse (1 in 1.4)
      // - Each non-ex Pokémon gets exactly ONE reverse variant printed
      // - Not all reverses are assigned patterns; most remain Energy reverses
      // - Assigned patterns are a smaller subset to make them feel special
      //
      // Conservative estimate: ~40% of eligible non-ex Pokémon actually have assigned pattern reverses printed.
      // This keeps Love Ball and other patterns rarer and more exciting.
      if (Math.random() < 0.4) {
        card.special = getAssignedAscendedHeroesPattern(card)
      } else {
        card.special = 'ReverseEnergyType'
      }
      return
    }

    const roll = Math.random()
    // Cumulative thresholds — rarest first
    // Master Ball ~3%  (SV era only)
    // Poké Ball  ~25% (all eligible sets)
    // Standard reverse: remainder
    let threshold = 0
    if (balls.masterball) {
      threshold += 0.03
      if (roll < threshold) { card.special = 'ReverseMasterBall'; return }
    }
    threshold += 0.25
    if (roll < threshold) { card.special = 'ReversePokeBall' }
    // else standard reverse holo — card.special stays undefined
  }

  const rarityText = (card: Card) => (card.rarity || '').toLowerCase()
  const isSpecialIllustration = (card: Card) => rarityText(card).includes('special illustration')
  const isIllustration = (card: Card) => rarityText(card).includes('illustration') && !isSpecialIllustration(card)
  const isHyper = (card: Card) => rarityText(card).includes('hyper')
  const isSecret = (card: Card) => rarityText(card).includes('secret')
  const isCrown = (card: Card) => rarityText(card).includes('crown')
  const isBlackWhiteRare = (card: Card) => rarityText(card).includes('black white rare') || rarityText(card).includes('monochrome')
  const isGoldTier = (card: Card) => isSecret(card) || isHyper(card) || isCrown(card)
  const isLikelyEXCardByName = (card: Card) => /\bex\b/i.test(card.name || '')
  const isDoubleRare = (card: Card) => {
    const text = rarityText(card)
    if (text.includes('double rare') || text === 'double rare') return true
    // Defensive fallback for newer SV/Mega cards where upstream rarity may be missing/inconsistent.
    // Keep EX-name cards in hit-tier slots instead of leaking into base-card picks.
    if (isSVOrMegaSet && isLikelyEXCardByName(card)) {
      if (isSpecialIllustration(card) || isGoldTier(card)) return false
      if (isUltraRare(card)) return false
      return true
    }
    return false
  }
  const isUltraRare = (card: Card) => rarityText(card).includes('ultra') && !isGoldTier(card)
  const isPocketOneDiamond = (card: Card) => rarityText(card).includes('one diamond')
  const isPocketTwoDiamond = (card: Card) => rarityText(card).includes('two diamond')
  const isPocketThreeDiamond = (card: Card) => rarityText(card).includes('three diamond')
  const isPocketFourDiamond = (card: Card) => rarityText(card).includes('four diamond')
  const isPocketOneStar = (card: Card) => rarityText(card).includes('one star')
  const isPocketTwoStar = (card: Card) => rarityText(card).includes('two star')
  const isPocketThreeStar = (card: Card) => rarityText(card).includes('three star')
  const isPocketOneShiny = (card: Card) => rarityText(card).includes('one shiny')
  const isPocketTwoShiny = (card: Card) => rarityText(card).includes('two shiny')
  const isPocketCrown = (card: Card) => rarityText(card).includes('crown')
  const isTopTierMainlineHit = (card: Card) => isSpecialIllustration(card) || isGoldTier(card) || isBlackWhiteRare(card)
  const isGodPackEligible = (card: Card) => {
    if (isPocketSet) {
      // Pocket analogue of Illustration Rare+ tiers.
      return isPocketOneStar(card) || isPocketTwoStar(card) || isPocketThreeStar(card) || isPocketOneShiny(card) || isPocketTwoShiny(card) || isPocketCrown(card)
    }

    // Mainline Illustration Rare+ tiers.
    return isIllustration(card) || isSpecialIllustration(card) || isUltraRare(card) || isGoldTier(card) || isBlackWhiteRare(card)
  }
  const canBeReverse = (card: Card) => {
    const reverseFlag = (card.variants as any)?.reverse
    return reverseFlag !== false
  }
  // Shiny Rare V/VMAX/VSTAR — EX-tier hit (ultraRare slot)
  const isShinyRareUltra = (card: Card) => {
    const t = rarityText(card)
    return t.includes('shiny rare v') || t.includes('shiny rare vmax') || t.includes('shiny rare vstar') || t.includes('shiny ultra rare')
  }
  // Base Shiny Rare (no V/VMAX/VSTAR suffix) — Illustration Rare-tier hit (illustrationRare slot)
  const isShinyRareBase = (card: Card) => {
    const t = rarityText(card)
    return t.includes('shiny rare') && !isShinyRareUltra(card)
  }
  // Legacy non-SV hits that should be ultra-rare tier: Radiant, Amazing, ACE SPEC, Rare PRIME, Full Art Trainer, LV.X
  const isLegacyEXHit = (card: Card) => {
    const t = rarityText(card)
    return (
      t.includes('radiant rare') ||
      t.includes('amazing rare') ||
      t.includes('ace spec') ||
      t.includes('full art trainer') ||
      t.includes('rare prime') ||
      t.includes('legend') ||
      t.includes('rare holo lv.x') ||
      t.includes('holo rare v') ||
      t.includes('holo rare vmax') ||
      t.includes('holo rare vstar')
    )
  }
  // Classic Collection and base Rare Holo / Holo Rare (non-V) — holo-rare-tier hits
  const isLegacyHoloHit = (card: Card) => {
    const t = rarityText(card)
    if (isLegacyEXHit(card)) return false
    return t.includes('rare holo') || t.includes('holo rare') || t.includes('classic collection')
  }
  const isBaseRareFamily = (card: Card) => {
    const text = rarityText(card)
    if (!text.includes('rare')) return false
    if (isIllustration(card) || isSpecialIllustration(card) || isDoubleRare(card) || isUltraRare(card) || isHyper(card) || isSecret(card)) return false
    if (isShinyRareUltra(card) || isShinyRareBase(card) || isLegacyEXHit(card) || isLegacyHoloHit(card)) return false
    return true
  }
  const isLowTierMainlineBaseCard = (card: Card) => {
    if (isDoubleRare(card) || isUltraRare(card) || isGoldTier(card) || isSpecialIllustration(card) || isIllustration(card)) return false
    if (isShinyRareUltra(card) || isShinyRareBase(card) || isLegacyEXHit(card)) return false
    if (isSVOrMegaSet && isLikelyEXCardByName(card)) return false
    return true
  }
  // Classic era (WOTC / EX era): rarity is just 'Rare' for both holo and non-holo prints;
  // holo status is encoded in card.variants, not the rarity label.
  // Detected at runtime so works for base1-5, neo, gym, ex series, etc.
  const hasExplicitHoloRareLabel = pool.some((c) => {
    const r = rarityText(c)
    return r.includes('rare holo') || r.includes('holo rare')
  })
  const hasHoloPrintOnlyCard = pool.some(
    (c) =>
      rarityText(c) === 'rare' &&
      (c.variants as any)?.holo === true &&
      (c.variants as any)?.normal !== true &&
      (c.variants as any)?.reverse !== true // WOTC era: no reverse holos
  )
  // Never treat SV/Mega sets as classic-holo era, even if variant data contains holo-only rares.
  const isClassicEraSet = !isPocketSet && !isSVOrMegaSet && !hasExplicitHoloRareLabel && hasHoloPrintOnlyCard
  // Holo-only Rare card (Base Set holo rares: Charizard, Blastoise, etc.)
  const isHoloPrintOnlyRare = (card: Card) =>
    rarityText(card) === 'rare' &&
    (card.variants as any)?.holo === true &&
    (card.variants as any)?.normal !== true &&
    (card.variants as any)?.reverse !== true
  // Non-holo Rare card (Base Set non-holo rares: Beedrill, Electrode, etc.)
  const isNonHoloPrintRare = (card: Card) =>
    rarityText(card) === 'rare' && (card.variants as any)?.normal === true

  // decide whether we should use the modern slot-based template
  // support all SV sets (sv01-sv99) and mark newer 2025 eras as modern
  const useSlotTemplate = isPocketSet || /^sv\d+/.test(setId) || packDef.template === 'modern'

  function buildGodPack(cardsPerPack: number): Card[] | null {
    const eligiblePool = pool.filter(isGodPackEligible)
    if (eligiblePool.length === 0) return null

    const localPool = eligiblePool.slice()
    const godPack: Card[] = []
    const drawFrom = (candidates: Card[], fallbackPool: Card[]): Card => {
      if (candidates.length > 0) {
        const idx = Math.floor(Math.random() * candidates.length)
        return { ...candidates.splice(idx, 1)[0] }
      }
      if (fallbackPool.length > 0) {
        const idx = Math.floor(Math.random() * fallbackPool.length)
        return { ...fallbackPool.splice(idx, 1)[0] }
      }
      return { ...eligiblePool[Math.floor(Math.random() * eligiblePool.length)] }
    }

    if (isPocketSet) {
      for (let i = 0; i < cardsPerPack; i++) {
        const picked = drawFrom(localPool, localPool)
        picked.isHolo = true
        picked.isReverse = false
        picked.isGodPack = true
        godPack.push(picked)
      }
      return godPack
    }

    const topTierPool = localPool.filter(isTopTierMainlineHit)
    const leadHitPool = localPool.filter((card) => isGodPackEligible(card) && !isTopTierMainlineHit(card))
    const frontHitCount = Math.max(0, cardsPerPack - 3)

    for (let i = 0; i < frontHitCount; i++) {
      const picked = drawFrom(leadHitPool, localPool)
      picked.isHolo = true
      picked.isReverse = false
      picked.isGodPack = true
      godPack.push(picked)
    }

    for (let i = godPack.length; i < cardsPerPack; i++) {
      const picked = drawFrom(topTierPool, localPool)
      picked.isHolo = true
      picked.isReverse = false
      picked.isGodPack = true
      godPack.push(picked)
    }

    return godPack
  }

  // Rare full-pack jackpot: every card is Illustration-tier or above.
  if (Math.random() < GOD_PACK_RATE) {
    const godPack = buildGodPack(packDef.cardsPerPack || 6)
    if (godPack) return godPack
  }

  if (!useSlotTemplate) {
    // Default generic pack behavior
    const rarityKeys = Object.keys(packDef.rarityDistribution || {})
    if (rarityKeys.length > 0) {
      const rarityWeights = rarityKeys.map((k) => packDef.rarityDistribution![k])
      const total = rarityWeights.reduce((a, b) => a + b, 0)

      for (let i = 0; i < packDef.cardsPerPack; i++) {
        let roll = Math.random() * total
        let chosen = rarityKeys[0]
        let acc = 0

        for (let j = 0; j < rarityKeys.length; j++) {
          acc += rarityWeights[j]
          if (roll <= acc) {
            chosen = rarityKeys[j]
            break
          }
        }

        const bucket = buckets[chosen] || []
        if (bucket.length === 0) {
          result.push(pool[Math.floor(Math.random() * pool.length)])
        } else {
          result.push(bucket[Math.floor(Math.random() * bucket.length)])
        }
      }
    } else {
      // Fallback: use database weights
      for (let i = 0; i < packDef.cardsPerPack; i++) {
        result.push(pickByRarity())
      }
    }
  } else {
    // modern slot-based pack template (SV era and newer)
    // Compact 6-card pack structure:
    // - 3 normal cards (1 common + 2 uncommons)
    // - 1 reverse holo (common/uncommon/rare)
    // - 1 holo-or-better rare slot (uses configured pull rates)
    // - 1 bonus slot (usually reverse, occasional hit)

    // 3 normal cards:
    // - Mainline: 1 common + 2 uncommons
    // - Pocket: 1 one-diamond + 2 two-diamond
    if (isPocketSet) {
      result.push(pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c)), () => pickByRarity('Common')))
      for (let i = 0; i < 2; i++) {
        result.push(pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c)), () => pickByRarity('Uncommon')))
      }
    } else {
      const baseCommonCandidates = pool.filter((c) => rarityToKey(c.rarity) === 'Common' && isLowTierMainlineBaseCard(c))
      const baseUncommonCandidates = pool.filter((c) => rarityToKey(c.rarity) === 'Uncommon' && isLowTierMainlineBaseCard(c))
      const genericLowTierPool = pool.filter((c) => isLowTierMainlineBaseCard(c))

      result.push(pickFromCandidates(baseCommonCandidates, () => pickFromCandidates(genericLowTierPool, () => pickByRarity('Common'))))
      for (let i = 0; i < 2; i++) {
        result.push(pickFromCandidates(baseUncommonCandidates, () => pickFromCandidates(genericLowTierPool, () => pickByRarity('Uncommon'))))
      }
    }

    // Card 9: Reverse holo slot (can be common, uncommon, or rare)
    const reverseWeights = isPocketSet
      ? { oneDiamond: 0.46, twoDiamond: 0.39, threeDiamond: 0.15 }
      : (packDef.slotWeights?.reverse || { Common: 0.6, Uncommon: 0.3, Rare: 0.1 })
    const revRarityKeys = Object.keys(reverseWeights)
    const revRarityVals = revRarityKeys.map((k) => reverseWeights[k])
    const reverseTotal = revRarityVals.reduce((a, b) => a + b, 0)
    let roll = Math.random() * reverseTotal
    let chosenRevRarity = revRarityKeys[0]
    let acc = 0

    for (let i = 0; i < revRarityKeys.length; i++) {
      acc += revRarityVals[i]
      if (roll <= acc) {
        chosenRevRarity = revRarityKeys[i]
        break
      }
    }

    let reverseCard: Card
    // For SV/ME era: reverse holos are typically Pokémon for special finishes (Love Ball, etc.)
    // Try to pick a Pokémon first; fall back to any eligible card if none available
    const isPokemonCategory = (c: Card) => (c.category || '').toLowerCase() === 'pokemon'
    
    if (chosenRevRarity === 'Rare') {
      const rarePool = pool.filter((c) => isBaseRareFamily(c) && canBeReverse(c))
      const pokemonPool = rarePool.filter(isPokemonCategory)
      reverseCard = pickFromCandidates(pokemonPool.length > 0 ? pokemonPool : rarePool, () => pickByRarity('Rare'))
    } else if (chosenRevRarity === 'oneDiamond') {
      reverseCard = pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c) && canBeReverse(c)), () => pickByRarity('Common'))
    } else if (chosenRevRarity === 'twoDiamond') {
      reverseCard = pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c) && canBeReverse(c)), () => pickByRarity('Uncommon'))
    } else if (chosenRevRarity === 'threeDiamond') {
      reverseCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c) && canBeReverse(c)), () => pickByRarity('Rare'))
    } else {
      // For C/U: prefer Pokémon to get more special reverse finishes
      const candPool = pool.filter((c) => rarityToKey(c.rarity) === chosenRevRarity && canBeReverse(c))
      const pokemonPool = candPool.filter(isPokemonCategory)
      reverseCard = pickFromCandidates(pokemonPool.length > 0 ? pokemonPool : candPool, () => pickByRarity(chosenRevRarity))
    }
    reverseCard.isReverse = true
    reverseCard.isHolo = true
    applyMainlineReverseFinish(reverseCard)
    result.push(reverseCard)

     // Card 10: Holo-or-better rare slot (weighted distribution)
     // Mainline custom 6-card model:
     // Holo 53%, Double 28%, Illustration 10%, Ultra 6%, Special Ill 2.5%, Gold 0.5%
     // Pocket custom model:
     // Three Diamond 42%, Four Diamond 31%, One Star 16%, Two Star/Two Shiny 7%, Three Star 3%, Crown 1%
     let rareSlotWeights: Record<string, number> = isPocketSet
       ? {
           threeDiamond: 0.42,
           fourDiamond: 0.31,
           oneStar: 0.16,
           twoStar: 0.07,
           threeStar: 0.03,
           crown: 0.01
         }
       : isClassicEraSet
         // Classic era (Base, Neo, Gym, EX): ~1/3 packs had a holo rare, ~2/3 non-holo rare
         ? { holoRare: 0.33, nonHoloRare: 0.67 }
         : (packDef.slotWeights?.rareSlot || {
             holoRare: 0.53,
             doubleRare: 0.28,
             illustrationRare: 0.10,
             ultraRare: 0.06,
             specialIllustrationRare: 0.025,
             goldRare: 0.005
           })
    // Normalise rare-slot weights against what actually exists in the pool.
    if (!isPocketSet && !isClassicEraSet) {
      const rareAvailability: Record<string, number> = {
        holoRare: pool.filter((c) => isBaseRareFamily(c) || isLegacyHoloHit(c)).length,
        doubleRare: pool.filter((c) => isDoubleRare(c)).length,
        illustrationRare: pool.filter((c) => isIllustration(c) || isShinyRareBase(c)).length,
        ultraRare: pool.filter((c) => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)).length,
        specialIllustrationRare: pool.filter((c) => isSpecialIllustration(c)).length,
        goldRare: pool.filter((c) => isGoldTier(c)).length,
      }

      if (isSVOrMegaSet) {
        // SV/Mega era: configured weights are well-calibrated; just drop absent tiers.
        const presentEntries = Object.entries(rareSlotWeights).filter(([k]) => (rareAvailability[k] || 0) > 0)
        const presentTotal = presentEntries.reduce((acc, [, w]) => acc + (w as number), 0)
        if (presentEntries.length > 0 && presentTotal > 0) {
          rareSlotWeights = Object.fromEntries(presentEntries.map(([k, w]) => [k, (w as number) / presentTotal]))
        }
      } else {
        // Pre-SV mainline (DP / BW / XY / SM / SWSH and anything else not SV/Mega).
        // Simple removal of absent tiers produces the same ~77 % holo / ~22 % ultra split
        // for every set regardless of era, because the default ultraRare weight (14 %) is
        // orders-of-magnitude larger than the ultraRare card proportion in DP/BW sets.
        //
        // Instead, derive the slot weight from the actual number of cards in each tier,
        // scaled by a per-tier multiplier calibrated against a reference SWSH set
        // (~52 holo rares / ~34 ultra rares / ~12 secret rares → 70% / 26% / 4%).
        // This gives era-appropriate hit rates: dp1 LV.X ≈ 4%, bw1 Full Art ≈ 3.5%,
        // swsh7 Alt-Art ≈ 46%, while SV era is left on its own controlled path above.
        const tierMultipliers: Record<string, number> = {
          holoRare:              0.0135,
          doubleRare:            0.0133,
          ultraRare:             0.0077,
          illustrationRare:      0.0040,
          specialIllustrationRare: 0.0030,
          goldRare:              0.0033,
        }
        const rawWeights: Record<string, number> = {}
        for (const [tier, count] of Object.entries(rareAvailability)) {
          if (count > 0) rawWeights[tier] = count * (tierMultipliers[tier] ?? 0.005)
        }
        const rawTotal = Object.values(rawWeights).reduce((a, b) => a + b, 0)
        if (rawTotal > 0) {
          rareSlotWeights = Object.fromEntries(Object.entries(rawWeights).map(([k, w]) => [k, w / rawTotal]))
        }
      }
    }
    const rareKeys = Object.keys(rareSlotWeights)
    const rareVals = rareKeys.map((k) => rareSlotWeights[k] as number)
    const rareTotal = rareVals.reduce((a, b) => a + b, 0)
    roll = Math.random() * rareTotal
    let chosenRareCategory = rareKeys[0]
    acc = 0

    for (let i = 0; i < rareKeys.length; i++) {
      acc += rareVals[i]
      if (roll <= acc) {
        chosenRareCategory = rareKeys[i]
        break
      }
    }

    let rareCard: Card
     if (chosenRareCategory === 'holoRare') {
       // Classic era: only pick cards that only exist as holofoil prints
       const holoCandidates = isClassicEraSet
         ? pool.filter((c) => isHoloPrintOnlyRare(c))
         : pool.filter((c) => isBaseRareFamily(c) || (!isSVOrMegaSet && isLegacyHoloHit(c)))
       rareCard = pickFromCandidates(holoCandidates, () => pickByRarity('Rare'))
       rareCard.isHolo = true
       rareCard.isReverse = false
       // Tag plain Rare cards picked as holofoil so they register as a hit
       if (isClassicEraSet && !rareCard.special && rarityText(rareCard) === 'rare') rareCard.special = 'HoloRare'
     } else if (chosenRareCategory === 'nonHoloRare') {
       // Classic era non-holo rare slot: pick a non-holo-print card (no holo treatment)
       const nonHoloCandidates = pool.filter((c) => isNonHoloPrintRare(c))
       rareCard = pickFromCandidates(nonHoloCandidates, () => pickByRarity('Rare'))
       rareCard.isHolo = false
       rareCard.isReverse = false
     } else if (chosenRareCategory === 'threeDiamond') {
       rareCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c)), () => pickByRarity('Rare'))
       rareCard.isHolo = true
       rareCard.isReverse = false
     } else if (chosenRareCategory === 'fourDiamond') {
       rareCard = pickFromCandidates(pool.filter((c) => isPocketFourDiamond(c)), () => pickByRarity('Ultra'))
       rareCard.isHolo = true
       rareCard.special = 'DoubleRare'
     } else if (chosenRareCategory === 'oneStar') {
       rareCard = pickFromCandidates(pool.filter((c) => isPocketOneStar(c)), () => pickByRarity('Rare'))
       rareCard.isHolo = true
       rareCard.special = 'Illustration'
     } else if (chosenRareCategory === 'twoStar') {
       rareCard = pickFromCandidates(
         pool.filter((c) => isPocketTwoStar(c) || isPocketOneShiny(c) || isPocketTwoShiny(c)),
         () => pickByRarity('Ultra')
       )
       rareCard.isHolo = true
     } else if (chosenRareCategory === 'threeStar') {
       rareCard = pickFromCandidates(pool.filter((c) => isPocketThreeStar(c)), () => pickByRarity('Ultra'))
       rareCard.isHolo = true
       rareCard.special = 'SpecialIllustration'
     } else if (chosenRareCategory === 'crown') {
       rareCard = pickFromCandidates(pool.filter((c) => isPocketCrown(c)), () => pickByRarity('Ultra'))
       rareCard.isHolo = true
       rareCard.special = 'GoldRare'
     } else if (chosenRareCategory === 'doubleRare') {
       rareCard = pickFromCandidates(pool.filter((c) => isDoubleRare(c)), () => pickByRarity('Ultra'))
       rareCard.isHolo = true
       if (isPocketSet) rareCard.special = 'DoubleRare'
     } else if (chosenRareCategory === 'illustrationRare') {
       // Illustration Rare + Shiny Rare (base, non-V) + legacy Holo Rare hits all share this tier
       rareCard = pickFromCandidates(
         pool.filter((c) => isIllustration(c) || isShinyRareBase(c)),
         () => pickByRarity('Rare')
       )
       rareCard.isHolo = true
       if (isPocketSet) rareCard.special = 'Illustration'
     } else if (chosenRareCategory === 'ultraRare') {
       // Ultra Rare + Shiny Rare V/VMAX + legacy EX-tier hits (Radiant, Amazing, ACE SPEC, etc.)
       rareCard = pickFromCandidates(
         pool.filter((c) => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)),
         () => pickByRarity('Ultra')
       )
       rareCard.isHolo = true
     } else if (chosenRareCategory === 'specialIllustrationRare') {
       rareCard = pickFromCandidates(
         pool.filter((c) => isSpecialIllustration(c)),
         () => pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Ultra'))
       )
       rareCard.isHolo = true
       if (isPocketSet) rareCard.special = 'SpecialIllustration'
     } else if (chosenRareCategory === 'hyperRare' || chosenRareCategory === 'goldRare') {
       const secretCandidates = pool.filter((c) => isGoldTier(c))
       if (secretCandidates.length > 0) {
         rareCard = { ...secretCandidates[Math.floor(Math.random() * secretCandidates.length)] }
       } else {
         rareCard = pickByRarity('Ultra')
       }
       rareCard.isHolo = true
       if (isPocketSet) rareCard.special = 'GoldRare'
     } else {
      rareCard = pickByRarity('Rare')
       rareCard.isHolo = true
    }

     result.push(rareCard)

     // Card 11: Bonus slot
     // Mainline: mostly reverse with low chance for additional hit
     // Pocket: mostly lower diamonds with small chance of extra star/crown hit
     let bonusWeights: Record<string, number> = isPocketSet
       ? {
           reversePocket: 0.89,
           fourDiamond: 0.065,
           oneStar: 0.028,
           twoStar: 0.012,
           threeStar: 0.004,
           crown: 0.001
         }
       : (packDef.slotWeights?.bonusSlot || {
           reverseHolo: 0.915,
           doubleRare: 0.04,
           illustration: 0.028,
           ultra: 0.013,
           specialIllustration: 0.003,
           gold: 0.001
         })
    if (!isPocketSet) {
       const bonusAvailability: Record<string, number> = {
         reverseHolo: pool.filter((c) => canBeReverse(c)).length,
         doubleRare: pool.filter((c) => isDoubleRare(c)).length,
         illustration: pool.filter((c) => isIllustration(c) || isShinyRareBase(c)).length,
         ultra: pool.filter((c) => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)).length,
         specialIllustration: pool.filter((c) => isSpecialIllustration(c)).length,
         gold: pool.filter((c) => isGoldTier(c)).length,
       }
       const presentEntries = Object.entries(bonusWeights).filter(([k]) => (bonusAvailability[k] || 0) > 0)
       const presentTotal = presentEntries.reduce((acc, [, w]) => acc + (w as number), 0)
       if (presentEntries.length > 0 && presentTotal > 0) {
         bonusWeights = Object.fromEntries(presentEntries.map(([k, w]) => [k, (w as number) / presentTotal]))
       }
     }
     const bonusKeys = Object.keys(bonusWeights)
     const bonusVals = bonusKeys.map((k) => bonusWeights[k] as number)
     const bonusTotal = bonusVals.reduce((a, b) => a + b, 0)
     roll = Math.random() * bonusTotal
     let chosenBonusCategory = bonusKeys[0]
     acc = 0

     for (let i = 0; i < bonusKeys.length; i++) {
       acc += bonusVals[i]
       if (roll <= acc) {
         chosenBonusCategory = bonusKeys[i]
         break
       }
     }

     let bonusCard: Card
    if (chosenBonusCategory === 'reverseHolo') {
       // Another reverse holo, could be any rarity
       const bonusRevWeights = packDef.slotWeights?.bonusReverse || { Common: 0.4, Uncommon: 0.4, Rare: 0.2 }
       const bonusRevKeys = Object.keys(bonusRevWeights)
       const bonusRevVals = bonusRevKeys.map((k) => bonusRevWeights[k] as number)
       const bonusRevTotal = bonusRevVals.reduce((a, b) => a + b, 0)
       roll = Math.random() * bonusRevTotal
       let chosenBonusRevRarity = bonusRevKeys[0]
       acc = 0
       for (let i = 0; i < bonusRevKeys.length; i++) {
         acc += bonusRevVals[i]
         if (roll <= acc) {
           chosenBonusRevRarity = bonusRevKeys[i]
           break
         }
       }
      if (chosenBonusRevRarity === 'Rare') {
        const rarePool = pool.filter((c) => isBaseRareFamily(c) && canBeReverse(c))
        const pokemonPool = rarePool.filter((c) => (c.category || '').toLowerCase() === 'pokemon')
        bonusCard = pickFromCandidates(pokemonPool.length > 0 ? pokemonPool : rarePool, () => pickByRarity('Rare'))
      } else {
        const candPool = pool.filter((c) => rarityToKey(c.rarity) === chosenBonusRevRarity && canBeReverse(c))
        const pokemonPool = candPool.filter((c) => (c.category || '').toLowerCase() === 'pokemon')
        bonusCard = pickFromCandidates(pokemonPool.length > 0 ? pokemonPool : candPool, () => pickByRarity(chosenBonusRevRarity))
      }
      bonusCard.isReverse = true
      bonusCard.isHolo = true
      applyMainlineReverseFinish(bonusCard)
     } else if (chosenBonusCategory === 'reversePocket') {
       const pocketReverseWeights = { oneDiamond: 0.46, twoDiamond: 0.39, threeDiamond: 0.15 }
       const pocketKeys = Object.keys(pocketReverseWeights)
       const pocketVals = pocketKeys.map((k) => pocketReverseWeights[k as keyof typeof pocketReverseWeights] as number)
       const pocketTotal = pocketVals.reduce((a, b) => a + b, 0)
       roll = Math.random() * pocketTotal
       let chosenPocketBonus = pocketKeys[0]
       acc = 0
       for (let i = 0; i < pocketKeys.length; i++) {
         acc += pocketVals[i]
         if (roll <= acc) {
           chosenPocketBonus = pocketKeys[i]
           break
         }
       }
       if (chosenPocketBonus === 'oneDiamond') {
         bonusCard = pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c) && canBeReverse(c)), () => pickByRarity('Common'))
       } else if (chosenPocketBonus === 'twoDiamond') {
         bonusCard = pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c) && canBeReverse(c)), () => pickByRarity('Uncommon'))
       } else {
         bonusCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c) && canBeReverse(c)), () => pickByRarity('Rare'))
       }
       bonusCard.isReverse = true
       bonusCard.isHolo = true
     } else if (chosenBonusCategory === 'fourDiamond') {
       bonusCard = pickFromCandidates(pool.filter((c) => isPocketFourDiamond(c)), () => pickByRarity('Ultra'))
       bonusCard.isHolo = true
       bonusCard.special = 'DoubleRare'
     } else if (chosenBonusCategory === 'oneStar') {
       bonusCard = pickFromCandidates(pool.filter((c) => isPocketOneStar(c)), () => pickByRarity('Rare'))
       bonusCard.isHolo = true
       bonusCard.special = 'Illustration'
     } else if (chosenBonusCategory === 'twoStar') {
       bonusCard = pickFromCandidates(
         pool.filter((c) => isPocketTwoStar(c) || isPocketOneShiny(c) || isPocketTwoShiny(c)),
         () => pickByRarity('Ultra')
       )
       bonusCard.isHolo = true
     } else if (chosenBonusCategory === 'threeStar') {
       bonusCard = pickFromCandidates(pool.filter((c) => isPocketThreeStar(c)), () => pickByRarity('Ultra'))
       bonusCard.isHolo = true
       bonusCard.special = 'SpecialIllustration'
     } else if (chosenBonusCategory === 'crown') {
       bonusCard = pickFromCandidates(pool.filter((c) => isPocketCrown(c)), () => pickByRarity('Ultra'))
       bonusCard.isHolo = true
       bonusCard.special = 'GoldRare'
     } else if (chosenBonusCategory === 'illustration') {
       bonusCard = pickFromCandidates(
         pool.filter((c) => isIllustration(c) || isShinyRareBase(c)),
         () => pickByRarity('Rare')
       )
       bonusCard.isHolo = true
       if (isPocketSet) bonusCard.special = 'Illustration'
     } else if (chosenBonusCategory === 'doubleRare') {
       bonusCard = pickFromCandidates(pool.filter((c) => isDoubleRare(c)), () => pickByRarity('Ultra'))
       bonusCard.isHolo = true
       if (isPocketSet) bonusCard.special = 'DoubleRare'
     } else if (chosenBonusCategory === 'ultra') {
       bonusCard = pickFromCandidates(
         pool.filter((c) => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)),
         () => pickByRarity('Ultra')
       )
       bonusCard.isHolo = true
     } else if (chosenBonusCategory === 'specialIllustration') {
       bonusCard = pickFromCandidates(
         pool.filter((c) => isSpecialIllustration(c)),
         () => pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Ultra'))
       )
       bonusCard.isHolo = true
       if (isPocketSet) bonusCard.special = 'SpecialIllustration'
     } else if (chosenBonusCategory === 'secret' || chosenBonusCategory === 'gold') {
       const secretCandidates = pool.filter((c) => isGoldTier(c))
       if (secretCandidates.length > 0) {
         bonusCard = { ...secretCandidates[Math.floor(Math.random() * secretCandidates.length)] }
       } else {
         bonusCard = pickByRarity('Ultra')
       }
       bonusCard.isHolo = true
       if (isPocketSet) bonusCard.special = 'GoldRare'
     } else {
       bonusCard = pickByRarity('Rare')
       bonusCard.isHolo = true
     }

     result.push(bonusCard)
  }

  // enforce guarantee: ensure at least `minRareOrAbove` rare or above
  const minRare = packDef.guarantee?.minRareOrAbove || 0
  const rareOrAbove = result.filter((c) => ['Rare', 'Ultra', 'Secret'].includes(rarityToKey(c.rarity))).length
  if (rareOrAbove < minRare) {
    const rarePool = (buckets['Rare'] || []).concat(buckets['Ultra'] || [])
    if (rarePool.length > 0) {
      let idx = -1
      for (let i = result.length - 1; i >= 0; i--) {
        if (!['Rare', 'Ultra', 'Secret'].includes(rarityToKey(result[i].rarity))) {
          idx = i
          break
        }
      }
      if (idx !== -1) result[idx] = rarePool[Math.floor(Math.random() * rarePool.length)]
    }
  }

  return result
}

export type { Card, PackDefinition }
