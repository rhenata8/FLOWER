"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Dropdown } from "../components/Dropdown";
import { useConfirm } from "../components/useConfirm";
import {
  dateKeyToEpoch,
  formatDateJakarta,
  formatDateKeyLong,
  formatIdr,
  getCurrentMonthRange,
  getCurrentWeekRange,
  getDayRange,
  parseIdr,
  todayKeyLocal,
  toJakartaDateKey,
} from "../lib/utils";

type ViewMode = "weekly" | "monthly";
type TimeMode = "period" | "day";

interface EditForm {
  kind: "income" | "expense";
  category: string;
  amountIdr: string;
  occurredAt: string;
  note: string;
}

export function ExpensesTab({ onGoBudgeting }: { onGoBudgeting: () => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [timeMode, setTimeMode] = useState<TimeMode>("period");
  const [dayKey, setDayKey] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickInput, setQuickInput] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);

  const [editId, setEditId] = useState<Id<"transactions"> | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { openConfirm, confirmModal } = useConfirm();

  const dayActive = timeMode === "day" && dayKey !== "";
  const periodRange = viewMode === "weekly" ? getCurrentWeekRange() : getCurrentMonthRange();
  const range = dayActive ? getDayRange(dayKey) : periodRange;

  const categoryData = useQuery(api.transactions.getCategories);
  const transactions = useQuery(api.transactions.list, {
    startDate: range.start,
    endDate: range.end,
    category: filterCategory || undefined,
    kind: (filterKind as "income" | "expense") || undefined,
    includeVoided: true,
  });
  const summary = useQuery(api.transactions.getSummary, {
    startDate: range.start,
    endDate: range.end,
  });
  const parsedQuick = useQuery(
    api.hermes.parseQuickTransaction,
    quickInput.trim().length >= 3 ? { input: quickInput } : "skip"
  );

  const createTransaction = useMutation(api.transactions.create);
  const updateTransaction = useMutation(api.transactions.update);
  const removeTransaction = useMutation(api.transactions.remove);

  const expenseCategories = categoryData?.expense ?? [];
  const incomeCategories = categoryData?.income ?? [];

  const handleQuickAdd = async () => {
    if (!parsedQuick || !parsedQuick.isValid || isQuickSaving) return;
    setQuickError(null);
    setIsQuickSaving(true);
    try {
      await createTransaction({
        kind: parsedQuick.kind!,
        category: parsedQuick.category!,
        amountIdr: parsedQuick.amountIdr!,
        occurredAt: dateKeyToEpoch(todayKeyLocal()),
        note: parsedQuick.item,
        source: "chat",
      });
      setQuickInput("");
    } catch (err: unknown) {
      setQuickError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsQuickSaving(false);
    }
  };

  const openEdit = (tx: NonNullable<typeof transactions>[number]) => {
    setForm({
      kind: tx.kind,
      category: tx.category,
      amountIdr: tx.amountIdr.toString(),
      occurredAt: toJakartaDateKey(tx.occurredAt),
      note: tx.note ?? "",
    });
    setEditId(tx._id);
    setFormError(null);
  };

  const closeEdit = () => {
    setEditId(null);
    setForm(null);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !editId || isSaving) return;
    setFormError(null);

    const amount = parseIdr(form.amountIdr);
    if (amount === null) {
      setFormError("Nominal harus bilangan bulat positif");
      return;
    }

    setIsSaving(true);
    try {
      await updateTransaction({
        id: editId,
        kind: form.kind,
        category: form.category,
        amountIdr: amount,
        occurredAt: dateKeyToEpoch(form.occurredAt || todayKeyLocal()),
        note: form.note,
      });
      closeEdit();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTransactions = transactions?.filter((tx) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return tx.category.toLowerCase().includes(q) || (tx.note?.toLowerCase().includes(q) ?? false);
  });

  const scopeLabel = dayActive ? ` · ${formatDateKeyLong(dayKey)}` : "";

  const kindOptions = [
    { value: "", label: "Semua Tipe" },
    { value: "income", label: "Pemasukan" },
    { value: "expense", label: "Pengeluaran" },
  ];
  const categoryOptions = [
    { value: "", label: "Semua Kategori" },
    ...[...expenseCategories, ...incomeCategories].map((c) => ({ value: c, label: c })),
  ];
  const timeOptions = [
    { value: "period", label: viewMode === "weekly" ? "Minggu ini" : "Bulan ini" },
    { value: "day", label: "Per hari" },
  ];

  const editCategoryOptions = (() => {
    if (!form) return [];
    const base = form.kind === "income" ? incomeCategories : expenseCategories;
    const list = base.includes(form.category) || !form.category ? base : [form.category, ...base];
    return list.map((c) => ({ value: c, label: c }));
  })();

  const daySummaryCategories = summary
    ? Object.entries(summary.byCategory).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div>
      {/* Period toggle (applies when no day filter is chosen) */}
      <div className="finance-toolbar" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`tab ${viewMode === "weekly" ? "active" : ""}`}
            onClick={() => setViewMode("weekly")}
          >
            Mingguan
          </button>
          <button
            type="button"
            className={`tab ${viewMode === "monthly" ? "active" : ""}`}
            onClick={() => setViewMode("monthly")}
          >
            Bulanan
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Pemasukan{scopeLabel}</div>
          <div className="stat-card-value income">
            {summary === undefined ? <div className="skeleton skeleton-stat" /> : formatIdr(summary.totalIncome)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pengeluaran{scopeLabel}</div>
          <div className="stat-card-value expense">
            {summary === undefined ? <div className="skeleton skeleton-stat" /> : formatIdr(summary.totalExpense)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Saldo Bersih{scopeLabel}</div>
          <div className="stat-card-value">
            {summary === undefined ? <div className="skeleton skeleton-stat" /> : formatIdr(summary.netBalance)}
          </div>
        </div>
      </div>

      {/* Quick input — the only way to add a transaction */}
      <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="card-header">
          <h2 className="card-title">Input Cepat</h2>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <input
              className="form-input"
              placeholder='Ketik: "makanan 28000", "tissue 5000", atau "gaji 5000000"'
              value={quickInput}
              onChange={(e) => {
                setQuickInput(e.target.value);
                setQuickError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
              aria-label="Input cepat transaksi"
            />
            {quickInput.trim().length >= 3 && parsedQuick && (
              <div style={{ marginTop: "var(--space-xs)", fontSize: "var(--font-size-xs)" }}>
                {parsedQuick.isValid ? (
                  <span style={{ color: "var(--success)" }}>
                    {parsedQuick.kind === "income" ? "Pemasukan" : "Pengeluaran"}: {parsedQuick.category}
                    {parsedQuick.item ? ` (${parsedQuick.item})` : ""} {formatIdr(parsedQuick.amountIdr!)}
                  </span>
                ) : (
                  <span style={{ color: "var(--error)" }}>{parsedQuick.clarificationMessage}</span>
                )}
              </div>
            )}
            {quickError && (
              <div className="form-error" style={{ marginTop: 6 }}>{quickError}</div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsedQuick?.isValid || isQuickSaving}
            onClick={handleQuickAdd}
          >
            {isQuickSaving ? "Menyimpan..." : "Catat"}
          </button>
        </div>
        {categoryData && expenseCategories.length === 0 && (
          <div className="inline-note" style={{ marginTop: 12 }}>
            Belum ada kategori pengeluaran. Buat kategori dulu di tab{" "}
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "0 4px", minHeight: 0, color: "var(--accent-700)", fontWeight: 700 }} onClick={onGoBudgeting}>
              Budgeting
            </button>{" "}
            agar bisa mencatat pengeluaran.
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="form-input"
          placeholder="Cari transaksi..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ minWidth: 200 }}
          aria-label="Cari transaksi"
        />
        <Dropdown value={filterKind} onChange={setFilterKind} options={kindOptions} ariaLabel="Filter tipe" />
        <Dropdown value={filterCategory} onChange={setFilterCategory} options={categoryOptions} ariaLabel="Filter kategori" />
        <Dropdown
          value={timeMode}
          onChange={(v) => {
            setTimeMode(v as TimeMode);
            if (v === "period") setDayKey("");
          }}
          options={timeOptions}
          ariaLabel="Filter waktu"
        />
        {timeMode === "day" && (
          <input
            className="form-input filter-date"
            type="date"
            value={dayKey}
            onChange={(e) => setDayKey(e.target.value)}
            aria-label="Pilih tanggal"
          />
        )}
      </div>

      {/* Transaction table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">Daftar Transaksi</h2>
            <div className="card-subtitle">
              {dayActive
                ? formatDateKeyLong(dayKey)
                : timeMode === "day"
                  ? "Pilih tanggal di kalender untuk melihat satu hari"
                  : viewMode === "weekly"
                    ? "Minggu ini"
                    : "Bulan ini"}
            </div>
          </div>
          <span className="badge badge-accent">{filteredTransactions?.length ?? 0} transaksi</span>
        </div>

        {transactions === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : filteredTransactions && filteredTransactions.length > 0 ? (
          <div className="table-container">
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Tipe</th>
                  <th>Kategori</th>
                  <th>Catatan</th>
                  <th>Nominal</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx._id} className={tx.voidedAt ? "voided" : ""}>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{formatDateJakarta(tx.occurredAt)}</td>
                    <td>
                      <span className={`badge ${tx.kind === "income" ? "badge-income" : "badge-expense"}`}>
                        {tx.kind === "income" ? "Pemasukan" : "Pengeluaran"}
                      </span>
                      {tx.voidedAt && (
                        <span className="badge badge-cancelled" style={{ marginLeft: 6 }}>Dibatalkan</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{tx.category}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{tx.note || "—"}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: tx.kind === "income" ? "var(--income)" : "var(--expense)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tx.kind === "expense" ? "−" : "+"}
                      {formatIdr(tx.amountIdr)}
                    </td>
                    <td className="col-actions">
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(tx)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)" }}
                          onClick={() =>
                            openConfirm({
                              title: "Hapus Transaksi",
                              message: "Apakah Anda yakin ingin menghapus transaksi ini? Data transaksi akan dihapus secara permanen dari sistem.",
                              actionText: "Hapus Permanen",
                              onConfirm: async () => {
                                await removeTransaction({ id: tx._id });
                              },
                            })
                          }
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada transaksi</div>
            <div className="empty-state-description">
              {dayActive ? "Tidak ada transaksi di tanggal ini." : "Catat transaksi lewat Input Cepat di atas."}
            </div>
          </div>
        )}
      </div>

      {/* Day summary — only when a specific day is chosen */}
      {dayActive && summary && (
        <section className="day-summary" aria-label={`Ringkasan ${formatDateKeyLong(dayKey)}`}>
          <div className="day-summary-head">
            <div>
              <span className="eyebrow-label">Ringkasan hari ini</span>
              <h3>Yang dihabiskan pada {formatDateKeyLong(dayKey)}</h3>
            </div>
            <div className="day-summary-total">{formatIdr(summary.totalExpense)}</div>
          </div>
          <div className="day-summary-grid">
            <div>
              <span>Pemasukan</span>
              <strong style={{ color: "var(--income)" }}>{formatIdr(summary.totalIncome)}</strong>
            </div>
            <div>
              <span>Pengeluaran</span>
              <strong style={{ color: "var(--expense)" }}>{formatIdr(summary.totalExpense)}</strong>
            </div>
            <div>
              <span>Saldo bersih</span>
              <strong>{formatIdr(summary.netBalance)}</strong>
            </div>
          </div>
          {daySummaryCategories.length > 0 ? (
            <div className="chip-row">
              {daySummaryCategories.map(([category, amount]) => (
                <span key={category} className="stat-chip">
                  {category} <b>{formatIdr(amount)}</b>
                </span>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Tidak ada pengeluaran di tanggal ini.</div>
          )}
        </section>
      )}

      {/* Edit modal */}
      {form && editId && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Edit Transaksi</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Tipe</label>
                <div className="tabs" style={{ width: "100%", display: "flex" }}>
                  <button
                    type="button"
                    className={`tab ${form.kind === "expense" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, kind: "expense", category: expenseCategories[0] ?? "" })}
                    style={{ flex: 1 }}
                  >
                    Pengeluaran
                  </button>
                  <button
                    type="button"
                    className={`tab ${form.kind === "income" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, kind: "income", category: incomeCategories[0] ?? "" })}
                    style={{ flex: 1 }}
                  >
                    Pemasukan
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Kategori</label>
                <Dropdown
                  value={form.category}
                  onChange={(v) => setForm({ ...form, category: v })}
                  options={editCategoryOptions}
                  placeholder="Pilih kategori..."
                  ariaLabel="Kategori transaksi"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nominal (Rp)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 28000"
                  value={form.amountIdr}
                  onChange={(e) => setForm({ ...form, amountIdr: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.occurredAt}
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan (opsional)</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Contoh: Makan siang nasi padang"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeEdit}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Perbarui"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal}
    </div>
  );
}
