import Layout from '../components/Layout'
import dynamic from 'next/dynamic'

const PackOpener = dynamic(() => import('../components/PackOpener'), { ssr: false })

export default function Home() {
  return (
    <Layout title="Rip Realm | Open Packs" description="Rip Realm — Rip. Reveal. Repeat. Open Pokémon packs and track your best pulls.">
      <section className="packopener-page">
        <div className="packopener-host">
          <PackOpener />
        </div>
      </section>
    </Layout>
  )
}
