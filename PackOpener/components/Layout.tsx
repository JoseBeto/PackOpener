import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { PROGRESSION_EVENT, loadProgressionState, type ProgressionState } from '../lib/progression'

const COIN_DISPLAY_LOCK_EVENT = 'rr:coin-display-lock'

type Props = {
  children: React.ReactNode
  title?: string
  description?: string
}

export default function Layout({ children, title = 'Rip Realm', description = 'Rip Realm — Rip. Reveal. Repeat.' }: Props) {
  const router = useRouter()
  const [progression, setProgression] = useState<ProgressionState | null>(null)
  const [coinDisplayOverride, setCoinDisplayOverride] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refresh = () => {
      setProgression(loadProgressionState())
    }

    refresh()
    window.addEventListener(PROGRESSION_EVENT, refresh)

    return () => {
      window.removeEventListener(PROGRESSION_EVENT, refresh)
    }
  }, [router.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleCoinDisplayLock = (event: Event) => {
      const customEvent = event as CustomEvent<{ locked?: boolean; value?: number }>
      const locked = Boolean(customEvent.detail?.locked)
      if (!locked) {
        setCoinDisplayOverride(null)
        return
      }

      const value = customEvent.detail?.value
      if (typeof value === 'number' && Number.isFinite(value)) {
        setCoinDisplayOverride(Math.max(0, Math.floor(value)))
      }
    }

    window.addEventListener(COIN_DISPLAY_LOCK_EVENT, handleCoinDisplayLock as EventListener)
    return () => {
      window.removeEventListener(COIN_DISPLAY_LOCK_EVENT, handleCoinDisplayLock as EventListener)
    }
  }, [])

  function formatCoins(value: number): string {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <div className={`app ${router.pathname === '/' ? 'app-home' : ''}`}>
        <header className="site-header">
          <Link href="/" className="brand">Rip Realm</Link>
          <div className="header-quick-coins" aria-label="Current coins">
            <span>Coins</span>
            <strong>{formatCoins(coinDisplayOverride ?? progression?.currency ?? 0)}</strong>
          </div>
        </header>
        <main className="site-main">{children}</main>
        <nav className="app-nav-dock" aria-label="Primary navigation">
          <Link href="/missions" className={`app-nav-item ${router.pathname === '/missions' ? 'is-active' : ''}`}>
            Missions
          </Link>
          <Link href="/" className={`app-nav-item app-nav-center ${router.pathname === '/' ? 'is-active' : ''}`}>
            Open Packs
          </Link>
          <Link href="/profile" className={`app-nav-item ${router.pathname === '/profile' ? 'is-active' : ''}`}>
            Profile
          </Link>
        </nav>
        <footer className="site-footer">© Rip Realm</footer>
      </div>
    </>
  )
}
