export type SetFamily = 'mainline' | 'pocket'

export function getSetFamily(setId: string): SetFamily {
  const id = setId.trim().toUpperCase()
  if (/^(A\d+[A-Z]?|B\d+[A-Z]?|P-A)$/.test(id)) return 'pocket'
  return 'mainline'
}

export const MAINLINE_LADDER_DISPLAY = 'Holo → Double → Ultra → IR → SIR → Gold'
export const POCKET_LADDER_DISPLAY = '1◊/2◊ → 3◊ → 4◊ → 1★ → 2★/Shiny → 3★ → Crown'

export function supportsBallReverseSet(setId: string) {
  const id = setId.trim().toLowerCase()
  return id === 'sv03.5' || id.includes('151')
}

export function getMainlineRank(card: { rarity?: string; special?: string; isReverse?: boolean; isHolo?: boolean }) {
  const rarity = (card.rarity || '').toLowerCase()
  const special = (card.special || '').toLowerCase()

  const isGoldTier =
    special.includes('gold') ||
    special.includes('hyper') ||
    special.includes('secret') ||
    rarity.includes('hyper') ||
    rarity.includes('secret') ||
    rarity.includes('crown') ||
    rarity.includes('mega hyper')

  if (special.includes('godpack')) return 100
  if (isGoldTier) return 95
  if (special.includes('specialillustration') || rarity.includes('special illustration')) return 90
  if (special.includes('illustration') || rarity.includes('illustration')) return 82
  if (rarity.includes('ultra')) return 68
  if (special.includes('reversemasterball')) return 62
  if (special.includes('doublerare') || rarity.includes('double rare')) return 58
  if (special.includes('reversepokeball')) return 49
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
