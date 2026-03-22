import Layout from '../components/Layout'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'

const PackOpener = dynamic(() => import('../components/PackOpener'), { ssr: false })

export default function Home() {
  return (
    <Layout title="PackOpener | Open Packs" description="Open Pokémon packs and track your best pulls in your profile showcase.">
      <section className="hero">
        <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
          PackOpener
        </motion.h1>
        <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
          Open packs with realistic pull simulation and build your personal Showcase in Profile.
        </motion.p>

        <div style={{ marginTop: 18 }}>
          <PackOpener />
        </div>
      </section>
    </Layout>
  )
}
