import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'

type Props = {
  children: React.ReactNode
  title?: string
  description?: string
}

export default function Layout({ children, title = 'PackOpener', description = 'PackOpener — preview and open packs' }: Props) {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <div className={`app ${router.pathname === '/' ? 'app-home' : ''}`}>
        <header className="site-header">
          <Link href="/" className="brand">PackOpener</Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link href="/" className={`nav-link ${router.pathname === '/' ? 'is-active' : ''}`}>
              Open Packs
            </Link>
            <Link href="/profile" className={`nav-link ${router.pathname === '/profile' ? 'is-active' : ''}`}>
              Profile
            </Link>
          </nav>
          <button
            className="mobile-nav-fab"
            aria-label={mobileMenuOpen ? 'Close quick actions' : 'Open quick actions'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </header>

        <div
          className={`mobile-drawer-backdrop ${mobileMenuOpen ? 'is-open' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden={!mobileMenuOpen}
        />
        <aside className={`mobile-drawer ${mobileMenuOpen ? 'is-open' : ''}`} aria-hidden={!mobileMenuOpen}>
          <div className="mobile-drawer-title">Quick Actions</div>
          <Link
            href="/"
            className={`mobile-drawer-link ${router.pathname === '/' ? 'is-active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Open Packs
          </Link>
          <Link
            href="/profile"
            className={`mobile-drawer-link ${router.pathname === '/profile' ? 'is-active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Profile
          </Link>
        </aside>
        <main className="site-main">{children}</main>
        <footer className="site-footer">© PackOpener</footer>
      </div>
    </>
  )
}
