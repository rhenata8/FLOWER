"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", mark: "01" },
  { href: "/keuangan", label: "Keuangan", mark: "02" },
  { href: "/tugas", label: "Tugas", mark: "03" },
  { href: "/menu", label: "Menu", mark: "04" },
  { href: "/ai-team", label: "AI Team", mark: "05" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link href="/" className="sidebar-logo">
          <span className="sidebar-logo-icon" aria-hidden="true">F.</span>
          <span className="sidebar-logo-text">Flower</span>
          <span className="sidebar-edition">PERSONAL / 01</span>
        </Link>
        <p className="sidebar-caption">RUANG KERJA</p>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`sidebar-link ${pathname === item.href ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined}>
              <span className="sidebar-link-icon" aria-hidden="true">{item.mark}</span>
              <span>{item.label}</span>
              {pathname === item.href && <span className="nav-current-mark" aria-hidden="true">↗</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className="sidebar-bottom-rule" /><span>HARI INI, SATU HAL<br />PADA SATU WAKTU.</span></div>
      </aside>

      <main className="app-main"><div className="page-enter">{children}</div></main>

      <nav className="bottom-nav" aria-label="Navigasi utama">
        <ul className="bottom-nav-items">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={`bottom-nav-link ${pathname === item.href ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined}>
                <span className="bottom-nav-icon" aria-hidden="true">{item.mark}</span>
                <span className="bottom-nav-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
