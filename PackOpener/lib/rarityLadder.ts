export type SetFamily = 'mainline' | 'pocket'

export function getSetFamily(setId: string): SetFamily {
  const id = setId.trim().toUpperCase()
  if (/^(A\d+[A-Z]?|B\d+[A-Z]?|P-A)$/.test(id)) return 'pocket'
  return 'mainline'
}

export const MAINLINE_LADDER_DISPLAY = 'Holo → Double → Ultra → IR → SIR → Gold'
export const POCKET_LADDER_DISPLAY = '1◊/2◊ → 3◊ → 4◊ → 1★ → 2★/Shiny → 3★ → Crown'

export type BallTypes = {
  pokeball: boolean
  masterball: boolean
  loveball: boolean
  friendball: boolean
  quickball: boolean
  duskball: boolean
  rocketr: boolean
  energytype: boolean
}

/**
 * Returns which special reverse variants are available for a given set.
 * - SWSH: Poké Ball
 * - SV: Poké Ball + Master Ball
 * - Ascended Heroes (me02.5): Energy reverse + assigned pattern reverse
 *   (Poké Ball, Love Ball, Friend Ball, Quick Ball, Dusk Ball, Rocket R)
 */
export function getBallTypes(setId: string): BallTypes {
  const id = setId.trim().toLowerCase()
  const isSV = /^sv\d/.test(id) || id === 'sv03.5' || id.includes('151')
  const isSWSH = /^swsh\d/.test(id)
  const isAscendedHeroes = id === 'me02.5'
  if (isAscendedHeroes) {
    return {
      pokeball: true,
      masterball: false,
      loveball: true,
      friendball: true,
      quickball: true,
      duskball: true,
      rocketr: true,
      energytype: true,
    }
  }
  return {
    pokeball: isSV || isSWSH,
    masterball: isSV,
    loveball: false,
    friendball: false,
    quickball: false,
    duskball: false,
    rocketr: false,
    energytype: false,
  }
}

/** @deprecated use getBallTypes */
export const supportsBallReverseSet = (setId: string) => getBallTypes(setId).pokeball
/** @deprecated use getBallTypes */
export const supportsMasterBallSet  = (setId: string) => getBallTypes(setId).masterball

export function getMainlineRank(card: { rarity?: string; special?: string; isReverse?: boolean; isHolo?: boolean }) {
  const rarity = (card.rarity || '').toLowerCase()
  const special = (card.special || '').toLowerCase()
  const isShinyUltraTier = rarity.includes('shiny ultra') || special.includes('shinyultra')
  const isShinyRareTier = rarity.includes('shiny rare') || special.includes('shinyrare')
  const isLegacyUltraTier =
    rarity.includes('holo rare v') ||
    rarity.includes('holo rare vmax') ||
    rarity.includes('holo rare vstar') ||
    rarity.includes('rare holo lv.x') ||
    rarity.includes('radiant rare') ||
    rarity.includes('amazing rare') ||
    rarity.includes('ace spec') ||
    rarity.includes('full art trainer') ||
    rarity.includes('rare prime') ||
    rarity.includes('legend')
  const isLegacyHoloHitTier = rarity.includes('rare holo') || rarity.includes('holo rare') || rarity.includes('classic collection')
  const isMonochromeTier =
    rarity.includes('black white rare') ||
    rarity.includes('monochrome') ||
    special.includes('blackwhiterare') ||
    special.includes('monochrome')

  const isGoldTier =
    special.includes('gold') ||
    special.includes('hyper') ||
    special.includes('secret') ||
    rarity.includes('hyper') ||
    rarity.includes('secret') ||
    rarity.includes('crown') ||
    rarity.includes('mega hyper')

  if (special.includes('godpack')) return 100
  if (isMonochromeTier) return 95
  if (isGoldTier) return 95
  if (special.includes('specialillustration') || rarity.includes('special illustration')) return 90
  if (isLegacyUltraTier) return 74
  if (isShinyUltraTier) return 74
  if (special.includes('illustration') || rarity.includes('illustration')) return 82
  if (isShinyRareTier) return 68
  if (rarity.includes('ultra')) return 68
  if (isLegacyHoloHitTier) return 46
  if (special.includes('reversemasterball')) return 52
  if (special.includes('doublerare') || rarity.includes('double rare')) return 58
  if (
    special.includes('reversepokeball') ||
    special.includes('reverseloveball') ||
    special.includes('reversefriendball') ||
    special.includes('reversequickball') ||
    special.includes('reverseduskball') ||
    special.includes('reverserocketr')
  ) return 49
  if (special.includes('reverseenergytype')) return 47
  if (card.isReverse) return 46
  if (card.isHolo || rarity.includes('holo')) return 40
  if (rarity.includes('rare')) return 30
  if (rarity.includes('uncommon')) return 18
  return 10
}

export function getPocketRank(card: { rarity?: string; special?: string; isReverse?: boolean; isHolo?: boolean }) {
  const rarity = (card.rarity || '').toLowerCase()
  const special = (card.special || '').toLowerCase()

  if (special.includes('godpack')) return 100
  if (rarity.includes('crown')) return 95
  if (rarity.includes('three star') || rarity.includes('two shiny')) return 90
  if (rarity.includes('one star')) return 82
  if (rarity.includes('two star') || rarity.includes('one shiny')) return 74
  if (rarity.includes('four diamond')) return 58
  if (rarity.includes('three diamond')) return 40
  if (card.isReverse) return 28
  if (card.isHolo) return 24
  if (rarity.includes('two diamond')) return 18
  return 10
}

export function getCardRankBySet(
  card: { rarity?: string; special?: string; isReverse?: boolean; isHolo?: boolean } | null | undefined,
  setId: string
) {
  if (!card) return 0
  return getSetFamily(setId) === 'pocket' ? getPocketRank(card) : getMainlineRank(card)
}
