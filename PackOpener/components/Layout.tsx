import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { PROGRESSION_EVENT, loadProgressionState, type ProgressionState } from '../lib/progression'
import { SESSION_STATS_EVENT, loadSessionStats, type SessionStats } from '../lib/sessionStats'

type Props = {
  children: React.ReactNode
  title?: string
  description?: string
}

export default function Layout({ children, title = 'Rip Realm', description = 'Rip Realm — Rip. Reveal. Repeat.' }: Props) {
  const router = useRouter()
  const [progression, setProgression] = useState<ProgressionState | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refresh = () => {
      setProgression(loadProgressionState())
      setSessionStats(loadSessionStats())
    }

    refresh()
    window.addEventListener(PROGRESSION_EVENT, refresh)
    window.addEventListener(SESSION_STATS_EVENT, refresh)

    return () => {
      window.removeEventListener(PROGRESSION_EVENT, refresh)
      window.removeEventListener(SESSION_STATS_EVENT, refresh)
    }
  }, [router.pathname])

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
            <strong>{formatCoins(progression?.currency || 0)}</strong>
          </div>
        </header>
        <div className="session-hud" role="status" aria-live="polite">
          <div className="session-hud-chip">
            <span>Coins</span>
            <strong>{formatCoins(progression?.currency || 0)}</strong>
          </div>
          <div className="session-hud-chip">
            <span>Session Packs</span>
            <strong>{sessionStats?.packsOpened || 0}</strong>
          </div>
          <div className="session-hud-chip">
            <span>Session Net</span>
            <strong className={(sessionStats?.netCoins || 0) >= 0 ? 'is-positive' : 'is-negative'}>
              {(sessionStats?.netCoins || 0) >= 0 ? '+' : ''}{formatCoins(sessionStats?.netCoins || 0)}
            </strong>
          </div>
          <div className="session-hud-chip">
            <span>Lifetime Packs</span>
            <strong>{formatCoins(progression?.stats.lifetimePacksOpened || 0)}</strong>
          </div>
          <div className="session-hud-chip session-hud-best">
            <span>Best This Session</span>
            <strong>{sessionStats?.bestPullName || 'None yet'}</strong>
          </div>
        </div>
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
