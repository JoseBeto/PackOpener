import Layout from '../components/Layout'
import dynamic from 'next/dynamic'

const PackOpener = dynamic(() => import('../components/PackOpener'), { ssr: false })

export default function Home() {
  return (
    <Layout title="PackOpener | Open Packs" description="Open Pokémon packs and track your best pulls in your profile showcase.">
      <section className="packopener-page">
        <div className="packopener-host">
          <PackOpener />
        </div>
      </section>
    </Layout>
  )
}
