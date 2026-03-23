import Layout from '../components/Layout'
import dynamic from 'next/dynamic'

const RipRealmApp = dynamic(() => import('../components/PackOpener'), { ssr: false })

export default function Home() {
  return (
    <Layout title="Rip Realm | Open Packs" description="Rip Realm — Rip. Reveal. Repeat. Open Pokémon packs and track your best pulls.">
      <section className="riprealm-page">
        <div className="riprealm-host">
          <RipRealmApp />
        </div>
      </section>
    </Layout>
  )
}
