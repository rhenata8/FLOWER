"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { QuickAddFab } from "./QuickAddFab";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/keuangan", label: "Keuangan" },
  { href: "/tugas", label: "Tugas" },
  { href: "/menu", label: "Menu & Belanja" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Lewati ke konten</a>
      <header className="app-topbar">
        <Link href="/" className="brand-wordmark" aria-label="Flower, Dashboard">
          flower<span className="brand-period" aria-hidden="true">.</span>
        </Link>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`desktop-nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </header>
      <main className="app-main" id="main-content">
        <div className="page-enter">{children}</div>
      </main>
      <nav className="bottom-nav" aria-label="Navigasi utama">
        <ul className="bottom-nav-items">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`bottom-nav-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="bottom-nav-label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <QuickAddFab />
    </div>
  );
}
