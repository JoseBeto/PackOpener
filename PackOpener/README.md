# PackOpener — Next.js TypeScript PWA scaffold

Minimal starter for the PackOpener website. Includes:

- Next.js + TypeScript
- PWA support via `next-pwa`
- Basic responsive layout and animations (`framer-motion`)

Getting started:

```powershell
npm install
npm run dev
```

Notes:
- After `npm install`, open http://localhost:3000 to view the app.
- The PWA service worker is provided by `next-pwa` and written to `/public` at build time.
- Add real icons in `public/icons` and further mobile optimizations as needed.

## Pack Simulation Logic

The core of the app is a simple booster pack simulator. To keep things realistic for
recent sets (Scarlet & Violet era and newer) the generator uses **slot‑based pull
rates** rather than a flat percentage per card.

A modern pack contains (compact mode):

1. Three normal cards total (1 common + 2 uncommons)
2. One reverse‑holo slot (can be any rarity; default weights: 60% common, 30% uncommon,
   8% rare, 2% ultra)
3. One rare slot with weighted outcomes:
   - Regular Rare (~72%)
   - Holo Rare (~17%)
   - Ultra Rare (~6%)
   - Secret/Special (~4%)

Weights and templates are configured in `data/packs.json` via the
`template`/`slotWeights` properties. Legacy packs fall back to a simple
`rarityDistribution` model for older eras.

The simulator lives in `lib/simulator.ts` and exposes `simulatePack()` which is
called from `components/PackOpener.tsx`.

This slot‑based approach ensures exactly one rare‑slot per pack and brings
ultra‑tier pull rates closer to real‑world values (1 in ~15–20 packs instead of
an inflated 10% per card).

## Vercel Deployment

Yes — Vercel hosts full Next.js web apps, including pages, API routes, and a default public domain.

What you get:

- Hosting for the app frontend
- Hosting for Next.js API routes in `pages/api`
- A default domain like `your-project.vercel.app`
- Support for custom domains if you want your own DNS name later

Recommended deploy flow:

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Keep the detected Next.js settings.
4. No environment variables are required for the current TCGDex-based setup.
5. Deploy.

Notes for this project:

- The app is already compatible with Vercel's Next.js hosting model.
- Runtime cache writes use `/tmp` on Vercel, while bundled cache files in `data/cache` are still readable.
- The default production URL will be a `*.vercel.app` domain until a custom domain is attached.

Custom domain setup:

- Buy or use a domain from any registrar.
- Add it in the Vercel project settings.
- Vercel will show the DNS records to add.
- Once DNS propagates, the app will serve from that domain.
