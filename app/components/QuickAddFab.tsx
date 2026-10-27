"use client";

import Link from "next/link";
import { useState } from "react";

const ACTIONS = [
  { href: "/keuangan?tab=expenses&action=create", label: "Catat Pengeluaran" },
  { href: "/menu?tab=ingredients&action=create", label: "Tambah Bahan" },
  { href: "/menu?tab=recipes&action=create", label: "Tambah Resep" },
  { href: "/tugas?action=create", label: "Tambah Tugas" },
];

export function QuickAddFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <button
          type="button"
          className="quick-add-backdrop"
          aria-label="Tutup panel tambah cepat"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="quick-add-panel" role="menu" aria-label="Tambah cepat">
          <div className="quick-add-panel-title">Tambah Cepat</div>
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="quick-add-action"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        className="quick-add-fab"
        aria-label="Tambah cepat"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        +
      </button>
    </>
  );
}
