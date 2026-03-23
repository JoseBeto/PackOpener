import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'

type Props = {
  children: React.ReactNode
  title?: string
  description?: string
}

export default function Layout({ children, title = 'Rip Realm', description = 'Rip Realm — Rip. Reveal. Repeat.' }: Props) {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <div className={`app ${router.pathname === '/' ? 'app-home' : ''}`}>
        <header className="site-header">
          <Link href="/" className="brand">Rip Realm</Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link href="/" className={`nav-link ${router.pathname === '/' ? 'is-active' : ''}`}>
              Open Packs
            </Link>
            <Link href="/profile" className={`nav-link ${router.pathname === '/profile' ? 'is-active' : ''}`}>
              Profile
            </Link>
          </nav>
          <Link href="/profile" className={`mobile-profile-btn ${router.pathname === '/profile' ? 'is-active' : ''}`} aria-label="Open profile">
            Profile
          </Link>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">© Rip Realm</footer>
      </div>
    </>
  )
}
