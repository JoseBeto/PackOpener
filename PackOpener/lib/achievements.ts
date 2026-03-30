import type { ProgressionState } from './progression'

export type Achievement = {
  id: string
  label: string
  description: string
  unlocked: boolean
}

function uniqueOpenedSets(state: ProgressionState): number {
  const setIds = new Set<string>()
  for (const key of Object.keys(state.collection)) {
    const sep = key.indexOf(':')
    if (sep <= 0) continue
    setIds.add(key.slice(0, sep))
  }
  return setIds.size
}

export function getAchievements(state: ProgressionState): Achievement[] {
  const openedSets = uniqueOpenedSets(state)

  return [
    {
      id: 'first-good-pull',
      label: 'First Hit',
      description: 'Pull your first Illustration-tier card or better.',
      unlocked: state.stats.lifetimeGoodPulls >= 1,
    },
    {
      id: 'first-elite-pull',
      label: 'Elite Hunter',
      description: 'Pull your first top-tier elite card.',
      unlocked: state.stats.lifetimeElitePulls >= 1,
    },
    {
      id: 'pack-centurion',
      label: 'Pack Centurion',
      description: 'Open 100 packs.',
      unlocked: state.stats.lifetimePacksOpened >= 100,
    },
    {
      id: 'ten-day-streak',
      label: 'Daily Disciple',
      description: 'Reach a 10-day check-in streak.',
      unlocked: state.stats.checkInStreak >= 10,
    },
    {
      id: 'set-explorer',
      label: 'Set Explorer',
      description: 'Collect cards from 5 different sets.',
      unlocked: openedSets >= 5,
    },
    {
      id: 'god-pack',
      label: 'God Pack Witness',
      description: 'Open a full-pack god pull at least once.',
      unlocked: state.stats.godPacksOpened >= 1,
    },
  ]
}
