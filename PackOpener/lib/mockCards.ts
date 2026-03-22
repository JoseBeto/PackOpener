// Mock card data for development when tcgdex is unavailable
export type MockCard = {
  id: string
  name: string
  images?: { small?: string; large?: string }
  rarity?: string
}

const POKEMON_NAMES = [
  'Pikachu', 'Charizard', 'Blastoise', 'Venusaur', 'Arcanine', 'Golem', 'Alakazam', 'Machamp', 'Gengar', 'Arbok',
  'Lapras', 'Snorlax', 'Articuno', 'Zapdos', 'Moltres', 'Dragonite', 'Mewtwo', 'Mew', 'Gyarados', 'Exeggutor',
  'Steelix', 'Scizor', 'Tyranitar', 'Salamence', 'Metagross', 'Garchomp', 'Reshiram', 'Zekrom', 'Kyurem', 'Dragapult'
]

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Ultra Rare', 'Secret Rare']

function seedRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export function generateMockCards(count: number = 150): MockCard[] {
  const cards: MockCard[] = []
  const namesUsed = new Set<string>()

  for (let i = 0; i < count; i++) {
    const rnd = seedRandom(i * 12.9898)
    const nameIdx = Math.floor(rnd * POKEMON_NAMES.length)
    let name = POKEMON_NAMES[nameIdx]
    let counter = 0
    while (namesUsed.has(name) && counter < 5) {
      name = POKEMON_NAMES[(nameIdx + counter) % POKEMON_NAMES.length]
      counter++
    }
    namesUsed.add(name)

    const rarityRnd = seedRandom(i * 78.233)
    const rarity = RARITIES[Math.floor(rarityRnd * RARITIES.length)]

    // Generate a simple colored SVG placeholder
    const colors = ['#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da']
    const color = colors[Math.floor(seedRandom(i * 45.164) * colors.length)]

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 342"><rect width="245" height="342" fill="${color}"/><text x="50%" y="40%" text-anchor="middle" dominant-baseline="middle" font-size="20" fill="white" font-weight="bold">${name}</text><text x="50%" y="60%" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="white">${rarity}</text></svg>`
    const imgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')

    cards.push({
      id: `mock-${i}`,
      name,
      rarity,
      images: { small: imgUrl, large: imgUrl }
    })
  }

  return cards
}
