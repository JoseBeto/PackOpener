/**
 * Monte Carlo pack simulation to validate pull rates across all eras.
 *
 * Replicates the core classifier + weight logic from lib/simulator.ts and
 * runs N packs per representative set, then prints slot-5 (rare slot) rates.
 *
 *  node scripts/monteCarlo.js
 */

'use strict'
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Load card database
// ---------------------------------------------------------------------------
const DB_PATH = path.join(__dirname, '..', 'data', 'detailed-cards', 'all-cards-detailed.json')
const allCards = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')).cards

function getPool(setId) {
  return allCards.filter((c) => c.id && c.id.startsWith(setId + '-'))
}

// ---------------------------------------------------------------------------
// Classifier helpers (mirrors lib/simulator.ts)
// ---------------------------------------------------------------------------
function rarityText(card) { return String(card.rarity || '').toLowerCase() }
function isSpecialIllustration(c) { return rarityText(c).includes('special illustration') }
function isIllustration(c) { return rarityText(c).includes('illustration') && !isSpecialIllustration(c) }
function isHyper(c) { return rarityText(c).includes('hyper') || rarityText(c).includes('mega hyper') }
function isSecret(c) { return rarityText(c).includes('secret') }
function isCrown(c) { return rarityText(c).includes('crown') }
function isGoldTier(c) { return isSecret(c) || isHyper(c) || isCrown(c) }
function isUltraRare(c) { return rarityText(c).includes('ultra') && !isGoldTier(c) }
function isLikelyEXByName(c) { return /\bex\b/i.test(c.name || '') }
function isShinyRareUltra(c) {
  const t = rarityText(c)
  return t.includes('shiny rare v') || t.includes('shiny rare vmax') || t.includes('shiny rare vstar') || t.includes('shiny ultra rare')
}
function isShinyRareBase(c) { return rarityText(c).includes('shiny rare') && !isShinyRareUltra(c) }
function isLegacyEXHit(c) {
  const t = rarityText(c)
  return (
    t.includes('radiant rare') || t.includes('amazing rare') || t.includes('ace spec') ||
    t.includes('full art trainer') || t.includes('rare prime') || t.includes('legend') ||
    t.includes('rare holo lv.x') || t.includes('holo rare v') || t.includes('holo rare vmax') ||
    t.includes('holo rare vstar')
  )
}
function isLegacyHoloHit(c) {
  const t = rarityText(c)
  if (isLegacyEXHit(c)) return false
  return t.includes('rare holo') || t.includes('holo rare') || t.includes('classic collection')
}
function isDoubleRare(c, isSVOrMega) {
  const t = rarityText(c)
  if (t.includes('double rare')) return true
  if (isSVOrMega && isLikelyEXByName(c)) {
    if (isSpecialIllustration(c) || isGoldTier(c) || isUltraRare(c)) return false
    return true
  }
  return false
}
function isBaseRareFamily(c, isSVOrMega) {
  const t = rarityText(c)
  if (!t.includes('rare')) return false
  if (isIllustration(c) || isSpecialIllustration(c) || isDoubleRare(c, isSVOrMega) ||
      isUltraRare(c) || isHyper(c) || isSecret(c)) return false
  if (isShinyRareUltra(c) || isShinyRareBase(c) || isLegacyEXHit(c) || isLegacyHoloHit(c)) return false
  return true
}

// ---------------------------------------------------------------------------
// Compute rare-slot weights for a set (same normalization as simulator.ts)
// ---------------------------------------------------------------------------
function computeRareWeights(pool, setId) {
  const norm = setId.trim().toLowerCase()
  const isPocket = ['a1','a1a','a2','a2a','a2b','a3','a3a','a3b','a4','a4a','b1','b1a','b2','p-a','p'].some(s => norm.startsWith(s))
  const isSVOrMega = /^sv\d/.test(norm) || /^me\d/.test(norm)

  const hasExplicitHoloLabel = pool.some(c => {
    const r = rarityText(c); return r.includes('rare holo') || r.includes('holo rare')
  })
  const hasHoloPrintOnly = pool.some(c =>
    rarityText(c) === 'rare' &&
    c.variants?.holo === true &&
    c.variants?.normal !== true &&
    c.variants?.reverse !== true
  )
  const isClassic = !isPocket && !isSVOrMega && !hasExplicitHoloLabel && hasHoloPrintOnly

  if (isPocket) return { pocket: true }
  if (isClassic) return { holoRare: 0.33, nonHoloRare: 0.67 }

  const rareAvailability = {
    holoRare: pool.filter(c => isBaseRareFamily(c, isSVOrMega) || isLegacyHoloHit(c)).length,
    doubleRare: pool.filter(c => isDoubleRare(c, isSVOrMega)).length,
    illustrationRare: pool.filter(c => isIllustration(c) || isShinyRareBase(c)).length,
    ultraRare: pool.filter(c => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)).length,
    specialIllustrationRare: pool.filter(c => isSpecialIllustration(c)).length,
    goldRare: pool.filter(c => isGoldTier(c)).length,
  }

  // Default SV-era weights (from packs.json standard)
  const defaults = { holoRare: 0.50, doubleRare: 0.24, ultraRare: 0.14, illustrationRare: 0.08, specialIllustrationRare: 0.03, goldRare: 0.01 }

  if (isSVOrMega) {
    // Current behaviour: drop zero-count categories, renormalise
    const entries = Object.entries(defaults).filter(([k]) => (rareAvailability[k] || 0) > 0)
    const total = entries.reduce((s, [, w]) => s + w, 0)
    return Object.fromEntries(entries.map(([k, w]) => [k, w / total]))
  } else {
    // Pre-SV: proportional weights with calibrated tier multipliers
    // (CURRENT code — just removes absent categories, same as isSVOrMega path)
    const entries = Object.entries(defaults).filter(([k]) => (rareAvailability[k] || 0) > 0)
    const total = entries.reduce((s, [, w]) => s + w, 0)
    return Object.fromEntries(entries.map(([k, w]) => [k, w / total]))
  }
}

// PROPOSED FIX — proportional formula for pre-SV
function computeRareWeightsFixed(pool, setId) {
  const norm = setId.trim().toLowerCase()
  const isPocket = ['a1','a1a','a2','a2a','a2b','a3','a3a','a3b','a4','a4a','b1','b1a','b2','p-a','p'].some(s => norm.startsWith(s))
  const isSVOrMega = /^sv\d/.test(norm) || /^me\d/.test(norm)

  const hasExplicitHoloLabel = pool.some(c => {
    const r = rarityText(c); return r.includes('rare holo') || r.includes('holo rare')
  })
  const hasHoloPrintOnly = pool.some(c =>
    rarityText(c) === 'rare' &&
    c.variants?.holo === true &&
    c.variants?.normal !== true &&
    c.variants?.reverse !== true
  )
  const isClassic = !isPocket && !isSVOrMega && !hasExplicitHoloLabel && hasHoloPrintOnly

  if (isPocket) return { pocket: true }
  if (isClassic) return { holoRare: 0.33, nonHoloRare: 0.67 }

  const rareAvailability = {
    holoRare: pool.filter(c => isBaseRareFamily(c, isSVOrMega) || isLegacyHoloHit(c)).length,
    doubleRare: pool.filter(c => isDoubleRare(c, isSVOrMega)).length,
    illustrationRare: pool.filter(c => isIllustration(c) || isShinyRareBase(c)).length,
    ultraRare: pool.filter(c => isUltraRare(c) || isShinyRareUltra(c) || isLegacyEXHit(c)).length,
    specialIllustrationRare: pool.filter(c => isSpecialIllustration(c)).length,
    goldRare: pool.filter(c => isGoldTier(c)).length,
  }

  const defaults = { holoRare: 0.50, doubleRare: 0.24, ultraRare: 0.14, illustrationRare: 0.08, specialIllustrationRare: 0.03, goldRare: 0.01 }

  if (isSVOrMega) {
    // SV/Mega: drop zero-count categories, renormalise (unchanged)
    const entries = Object.entries(defaults).filter(([k]) => (rareAvailability[k] || 0) > 0)
    const total = entries.reduce((s, [, w]) => s + w, 0)
    return Object.fromEntries(entries.map(([k, w]) => [k, w / total]))
  } else {
    // Pre-SV: proportional weight = cardCount × tierMultiplier, then renormalise
    // Multipliers calibrated so a typical SWSH-era set (~52 holo, ~34 ultra, ~12 gold)
    // yields roughly 70% holo / 26% ultra / 4% gold.
    const multipliers = {
      holoRare: 0.0135,
      doubleRare: 0.0133,
      ultraRare: 0.0077,
      illustrationRare: 0.0040,
      specialIllustrationRare: 0.0030,
      goldRare: 0.0033,
    }
    const raw = {}
    for (const [tier, count] of Object.entries(rareAvailability)) {
      if (count > 0) raw[tier] = count * (multipliers[tier] ?? 0.005)
    }
    const total = Object.values(raw).reduce((s, w) => s + w, 0)
    return total > 0 ? Object.fromEntries(Object.entries(raw).map(([k, w]) => [k, w / total])) : { holoRare: 1 }
  }
}

// ---------------------------------------------------------------------------
// Simulate N rare-slot picks, return tally
// ---------------------------------------------------------------------------
function simulateRareSlot(pool, weights, N) {
  const keys = Object.keys(weights)
  const vals = keys.map(k => weights[k])
  const total = vals.reduce((s, v) => s + v, 0)
  const tally = {}
  keys.forEach(k => { tally[k] = 0 })
  for (let i = 0; i < N; i++) {
    let roll = Math.random() * total
    let chosen = keys[0]
    for (let j = 0; j < keys.length; j++) {
      if (roll < vals[j]) { chosen = keys[j]; break }
      roll -= vals[j]
    }
    tally[chosen]++
  }
  return tally
}

function pct(n, total) { return (n / total * 100).toFixed(1) + '%' }

// ---------------------------------------------------------------------------
// Representative sets (one per major era)
// ---------------------------------------------------------------------------
const TEST_SETS = [
  // Classic WOTC
  { id: 'base1',     label: 'Base Set      ' },
  { id: 'gym1',      label: 'Gym Heroes    ' },
  { id: 'neo1',      label: 'Neo Genesis   ' },
  // EX era
  { id: 'ex1',       label: 'EX RubySaph   ' },
  { id: 'ex12',      label: 'EX FireRed LG ' },
  // DP era
  { id: 'dp1',       label: 'Diamond Pearl ' },
  { id: 'dp7',       label: 'Arceus        ' },
  { id: 'hgss1',     label: 'HeartGold SS  ' },
  // BW era
  { id: 'bw1',       label: 'BW Base       ' },
  { id: 'bw3',       label: 'Noble Vic     ' },
  { id: 'bw8',       label: 'Plasma Freeze ' },
  // XY era
  { id: 'xy1',       label: 'XY Base       ' },
  { id: 'xy4',       label: 'Phantom Forces' },
  { id: 'xy9',       label: 'BREAKPoint    ' },
  // SM era
  { id: 'sm1',       label: 'SM Base       ' },
  { id: 'sm7',       label: 'Celestial Storm'},
  { id: 'sm11',      label: 'Unified Minds ' },
  // SWSH era
  { id: 'swsh1',     label: 'SWSH Base     ' },
  { id: 'swsh3.5',   label: 'Champ Path    ' },
  { id: 'swsh7',     label: 'Evolving Skies' },
  { id: 'swsh12.5',  label: 'Crown Zenith  ' },
  // SV era
  { id: 'sv01',      label: 'SV Base       ' },
  { id: 'sv05',      label: 'Temporal Forces'},
  { id: 'sv10',      label: 'Perfect Order ' },
  // Mega era
  { id: 'me01',      label: 'Mega Dream ex ' },
  { id: 'me02',      label: 'Mega Clash ex ' },
  { id: 'me02.5',    label: 'Ascended Heroes'},
]

const N = 50_000
const COL = ['holoRare', 'nonHoloRare', 'doubleRare', 'ultraRare', 'illustrationRare', 'specialIllustrationRare', 'goldRare']

// Table header
const HDR = `${'Set'.padEnd(18)}  ` + COL.map(c => c.slice(0,8).padStart(9)).join('')
console.log('\n=== FINAL pull-rate model (proportional × tier-multiplier for pre-SV, configured weights for SV/Mega) ===')
console.log(HDR)
console.log('─'.repeat(HDR.length))

for (const { id, label } of TEST_SETS) {
  const pool = getPool(id)
  if (pool.length === 0) { console.log(`${label.padEnd(18)}  (no cards in DB)`); continue }

  const weights = computeRareWeightsFixed(pool, id)
  if (weights.pocket) { console.log(`${label.padEnd(18)}  POCKET  (skip)`); continue }

  const tally = simulateRareSlot(pool, weights, N)
  const totSim = Object.values(tally).reduce((s, n) => s + n, 0)
  const row = COL.map(k => (tally[k] ? pct(tally[k], totSim) : '    -   ').padStart(9)).join('')
  console.log(`${label.padEnd(18)}  ${row}`)
}

// Also verify: no ex cards in base-slot pool for SV/Mega
console.log('\n=== BASE-SLOT ex-card check (should all be 0) ===')
for (const { id, label } of TEST_SETS.filter(s => /^(sv|me)\d/.test(s.id))) {
  const pool = getPool(id)
  const isSVOrMega = true
  const lowTier = pool.filter(c => {
    if (isDoubleRare(c, isSVOrMega) || isUltraRare(c) || isGoldTier(c) || isSpecialIllustration(c) || isIllustration(c)) return false
    if (isShinyRareUltra(c) || isShinyRareBase(c) || isLegacyEXHit(c)) return false
    if (isSVOrMega && isLikelyEXByName(c)) return false
    return true
  })
  const exInBase = lowTier.filter(c => isLikelyEXByName(c)).length
  const common = lowTier.filter(c => String(c.rarity||'').toLowerCase().includes('common') || c.rarity === 'Common').length
  const uncommon = lowTier.filter(c => String(c.rarity||'').toLowerCase().includes('uncommon')).length
  console.log(`${label.padEnd(18)}  basePool=${lowTier.length}  common=${common}  uncommon=${uncommon}  exInBase=${exInBase}`)
}
console.log()
