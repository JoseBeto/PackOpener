import React, { useEffect, useRef, useState } from 'react'
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
  const [coinPulseTone, setCoinPulseTone] = useState<'ultra' | 'secret' | null>(null)
  const coinPulseTimerRef = useRef<number | null>(null)

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
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const root = document.documentElement
    const updateLayoutVars = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      const headerEl = document.querySelector('.site-header') as HTMLElement | null
      const navEl = document.querySelector('.app-nav-dock') as HTMLElement | null

      const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0
      const navRect = navEl?.getBoundingClientRect()
      const navHeight = navRect ? Math.ceil(navRect.height) : 0
      const navBottomGap = navRect ? Math.max(0, Math.ceil(window.innerHeight - navRect.bottom)) : 0
      const navClearance = Math.max(124, navHeight + navBottomGap + 16)

      root.style.setProperty('--vvh', `${Math.max(320, Math.round(visualHeight))}px`)
      root.style.setProperty('--header-h', `${Math.max(48, headerHeight)}px`)
      root.style.setProperty('--nav-clearance', `${navClearance}px`)
    }

    updateLayoutVars()

    let rafId = 0
    const scheduleUpdate = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        updateLayoutVars()
      })
    }

    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('orientationchange', scheduleUpdate)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleUpdate)

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('orientationchange', scheduleUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const isHomeRoute = router.pathname === '/'
    document.documentElement.classList.toggle('route-home', isHomeRoute)
    document.body.classList.toggle('route-home', isHomeRoute)

    return () => {
      document.documentElement.classList.remove('route-home')
      document.body.classList.remove('route-home')
    }
  }, [router.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleCoinDisplayLock = (event: Event) => {
      const customEvent = event as CustomEvent<{ locked?: boolean; value?: number; pulse?: boolean; tone?: 'ultra' | 'secret' | 'holo' | 'base' }>
      const locked = Boolean(customEvent.detail?.locked)
      if (!locked) {
        setCoinDisplayOverride(null)
        setCoinPulseTone(null)
        return
      }

      const value = customEvent.detail?.value
      if (typeof value === 'number' && Number.isFinite(value)) {
        setCoinDisplayOverride(Math.max(0, Math.floor(value)))
      }

      if (customEvent.detail?.pulse && (customEvent.detail?.tone === 'ultra' || customEvent.detail?.tone === 'secret')) {
        setCoinPulseTone(customEvent.detail.tone)
        if (coinPulseTimerRef.current) {
          window.clearTimeout(coinPulseTimerRef.current)
        }
        coinPulseTimerRef.current = window.setTimeout(() => {
          setCoinPulseTone(null)
          coinPulseTimerRef.current = null
        }, customEvent.detail.tone === 'secret' ? 820 : 620)
      }
    }

    window.addEventListener(COIN_DISPLAY_LOCK_EVENT, handleCoinDisplayLock as EventListener)
    return () => {
      if (coinPulseTimerRef.current) {
        window.clearTimeout(coinPulseTimerRef.current)
        coinPulseTimerRef.current = null
      }
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
          <div className={`header-quick-coins ${coinPulseTone ? `is-pulse-${coinPulseTone}` : ''}`} aria-label="Current coins">
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
