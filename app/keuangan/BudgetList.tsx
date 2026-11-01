"use client";

import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { ActionIcon } from "../components/ActionIcon";
import { formatIdr, todayKeyLocal } from "../lib/utils";

export type BudgetRow = FunctionReturnType<typeof api.budget.listBudgets>[number];
type BudgetView = "groups" | "table";
const VIEW_KEY = "flower-budget-view";

/** Also refreshes while the page remains open over a Jakarta month boundary. */
export function useBudgetMonth() {
  const [monthKey, setMonthKey] = useState(() => todayKeyLocal().slice(0, 7));
  useEffect(() => {
    const refresh = () => setMonthKey(todayKeyLocal().slice(0, 7));
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return monthKey;
}

export function BudgetList({ budgets, monthKey, onCreate, onEdit, onDelete }: {
  budgets: BudgetRow[] | undefined;
  monthKey: string;
  onCreate: () => void;
  onEdit: (budget: BudgetRow) => void;
  onDelete: (budget: BudgetRow) => void;
}) {
  const [view, setView] = useState<BudgetView>("groups");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { if (window.localStorage.getItem(VIEW_KEY) === "table") setView("table"); } catch { /* Perangkat membatasi penyimpanan. */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const selectView = (next: BudgetView) => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* Tetap berfungsi untuk sesi ini. */ }
  };
  const month = new Date(`${monthKey}-01T00:00:00+07:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  const groups = new Map<string, { name: string; rows: BudgetRow[] }>();
  for (const budget of budgets ?? []) {
    const key = budget.categoryId ?? "uncategorized";
    if (!groups.has(key)) groups.set(key, { name: budget.categoryName ?? "Tanpa kategori", rows: [] });
    groups.get(key)!.rows.push(budget);
  }
  const actions = (budget: BudgetRow) => <div className="budget-actions"><ActionIcon action="edit" label={`Edit budget ${budget.name}`} onClick={() => onEdit(budget)} /><ActionIcon action="delete" label={`Hapus budget ${budget.name}`} onClick={() => onDelete(budget)} /></div>;
  const remaining = (budget: BudgetRow) => <strong className={`budget-remaining ${budget.remainingIdr < 0 ? "over-budget" : ""}`}>{formatIdr(budget.remainingIdr)}{budget.remainingIdr < 0 && <small>Melebihi budget</small>}</strong>;

  return (
    <section className="card monthly-budgets" aria-labelledby="monthly-budget-title">
      <div className="budget-list-heading">
        <div><h2 className="card-title" id="monthly-budget-title">Daftar Budget</h2><p className="card-subtitle">Budget bulanan per subkategori · {month}</p></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>+ Budget</button>
      </div>
      <div className="budget-view-switch" role="group" aria-label="Tampilan daftar budget">
        <button type="button" className="budget-view-button" aria-pressed={view === "groups"} onClick={() => selectView("groups")}>Kelompok kategori</button>
        <button type="button" className="budget-view-button" aria-pressed={view === "table"} onClick={() => selectView("table")}>Tabel adaptif</button>
      </div>
      {budgets === undefined ? <div className="loading" role="status">Memuat budget...</div> : !budgets.length ? <div className="empty-state"><div className="empty-state-title">Belum ada budget</div><p className="empty-state-description">Tambahkan subkategori dan budget bulanan dengan tombol + Budget.</p></div> : view === "groups" ? (
        <div className="budget-groups">
          {Array.from(groups, ([key, group]) => (
            <details key={key} className="budget-group" open>
              <summary><span className="budget-group-name">{group.name}<small>{group.rows.length} subkategori</small></span><span className="budget-group-total">Sisa <strong>{formatIdr(group.rows.reduce((sum, row) => sum + row.remainingIdr, 0))}</strong></span></summary>
              {group.rows.map(budget => <article key={budget._id} className="budget-entry">
                <div className="budget-entry-head"><h3>{budget.name}</h3><div className="budget-entry-remainder"><span>Sisa</span>{remaining(budget)}</div>{actions(budget)}</div>
                <div className="budget-meter" role="progressbar" aria-label={`Pemakaian budget ${budget.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(budget.spentIdr / budget.amountIdr * 100))}><div className={budget.remainingIdr < 0 ? "over-budget-fill" : ""} style={{ width: `${Math.min(100, budget.spentIdr / budget.amountIdr * 100)}%` }} /></div>
                <div className="budget-entry-numbers"><span>Budget awal <strong>{formatIdr(budget.amountIdr)}</strong></span><span>Terpakai <strong>{formatIdr(budget.spentIdr)}</strong></span></div>
              </article>)}
            </details>
          ))}
        </div>
      ) : (
        <div className="budget-table-wrap"><table className="budget-table"><thead><tr><th>Subkategori</th><th>Budget awal</th><th>Terpakai</th><th>Sisa</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>
          {budgets.map(budget => <tr key={budget._id}><td><strong>{budget.name}</strong><small>{budget.categoryName ?? "Tanpa kategori"}</small></td><td data-label="Budget awal">{formatIdr(budget.amountIdr)}</td><td data-label="Terpakai">{formatIdr(budget.spentIdr)}</td><td data-label="Sisa">{remaining(budget)}</td><td>{actions(budget)}</td></tr>)}
        </tbody></table></div>
      )}
      <p className="budget-reset-note">Pemakaian reset setiap tanggal 1, waktu Jakarta. Sisa uang tetap termasuk saldo tersedia.</p>
    </section>
  );
}
