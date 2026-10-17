"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/keuangan", label: "Keuangan", icon: "💰" },
  { href: "/tugas", label: "Tugas", icon: "✅" },
  { href: "/menu", label: "Menu", icon: "🍽️" },
  { href: "/ai-team", label: "AI Team", icon: "🤖" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <aside className="app-sidebar">
        <Link href="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">🌸</div>
          <span className="sidebar-logo-text">Flower</span>
        </Link>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname === item.href ? "active" : ""}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        <div className="page-enter">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav">
        <ul className="bottom-nav-items">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`bottom-nav-link ${pathname === item.href ? "active" : ""}`}
              >
                <span className="bottom-nav-icon">{item.icon}</span>
                <span className="bottom-nav-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
