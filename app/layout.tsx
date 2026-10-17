import type { Metadata } from "next";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "Flower — Sistem Pribadi",
  description: "Kelola keuangan, rencana makanan, bahan belanja, dan tugas/pengingat Anda.",
};

import { Suspense } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <ConvexClientProvider>
          <AppShell>
            <Suspense
              fallback={
                <div className="loading" style={{ minHeight: "50vh" }}>
                  <div className="loading-spinner" />
                  <span>Memuat...</span>
                </div>
              }
            >
              {children}
            </Suspense>
          </AppShell>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
