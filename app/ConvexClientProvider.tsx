"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Component, ReactNode } from "react";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ConvexErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const isMissingFunction = this.state.error?.message?.includes("Could not find public function");
      return (
        <main className="convex-config-required" role="alert">
          <p className="eyebrow">FLOWER · SINKRONISASI BACKEND</p>
          <h1>{isMissingFunction ? "Fungsi Backend Belum Diunggah" : "Koneksi Backend Terkendala"}</h1>
          <p>
            {isMissingFunction ? (
              <>
                Frontend sudah terhubung ke Convex Cloud (<code>{deploymentUrl}</code>), namun fungsi backend (dari folder <code>convex/</code>) belum diunggah ke project tersebut.
                <br /><br />
                Jalankan perintah ini di Terminal Anda untuk mengunggah fungsi backend:
                <br />
                <code style={{ display: "inline-block", margin: "8px 0", padding: "6px 12px", fontSize: "1rem" }}>
                  npx convex dev --configure
                </code>
              </>
            ) : (
              this.state.error?.message || "Terjadi kesalahan saat memuat data dari Convex."
            )}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              padding: "8px 16px",
              background: "var(--accent-600)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Muat Ulang Halaman
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!convex) {
    return (
      <main className="convex-config-required" role="alert">
        <p className="eyebrow">FLOWER · KONEKSI DATA</p>
        <h1>Data belum tersambung</h1>
        <p>
          Alamat deployment Convex belum dikonfigurasi. Data, kueri, dan semua aksi tambah/edit tidak dapat berjalan sampai <code>NEXT_PUBLIC_CONVEX_URL</code> diatur ke deployment Convex FLOWER.
        </p>
      </main>
    );
  }
  return (
    <ConvexErrorBoundary>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ConvexErrorBoundary>
  );
}
