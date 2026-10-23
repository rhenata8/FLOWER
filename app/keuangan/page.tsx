"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  formatIdr,
  formatDateJakarta,
  getCurrentWeekRange,
  getCurrentMonthRange,
  todayKeyLocal,
  toJakartaDateKey,
  dateKeyToEpoch,
} from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "../components/ConfirmModal";

type ViewMode = "weekly" | "monthly";
type ModalMode = "create" | "edit" | null;

interface TransactionForm {
  kind: "income" | "expense";
  category: string;
  amountIdr: string;
  occurredAt: string;
  note: string;
}

const EXPENSE_CATEGORIES = ["makanan", "transportasi", "belanja", "parkir", "tagihan"];
const INCOME_CATEGORIES = ["gaji"];

const initialForm: TransactionForm = {
  kind: "expense",
  category: "makanan",
  amountIdr: "",
  occurredAt: "",
  note: "",
};

export default function KeuanganPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<TransactionForm>(initialForm);
  const [editId, setEditId] = useState<Id<"transactions"> | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterKind, setFilterKind] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<Id<"transactions"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const weekRange = getCurrentWeekRange();
  const monthRange = getCurrentMonthRange();
  const range = viewMode === "weekly" ? weekRange : monthRange;

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

  const categories = form.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSubmitting) return;

    const amount = parseInt(form.amountIdr.replace(/[.,]/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Nominal harus bilangan bulat positif");
      return;
    }

    const dateStr = form.occurredAt || todayKeyLocal();
    const occurredAt = dateKeyToEpoch(dateStr);

    setIsSubmitting(true);
    try {
      if (modalMode === "edit" && editId) {
        await updateTransaction({
          id: editId,
          kind: form.kind,
          category: form.category,
          amountIdr: amount,
          occurredAt,
          note: form.note || undefined,
        });
      } else {
        await createTransaction({
          kind: form.kind,
          category: form.category,
          amountIdr: amount,
          occurredAt,
          note: form.note || undefined,
          source: "manual",
        });
      }
      setModalMode(null);
      setForm(initialForm);
      setEditId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!parsedQuick || !parsedQuick.isValid || parsedQuick.needsClarification) return;

    try {
      const occurredAt = dateKeyToEpoch(todayKeyLocal());
      await createTransaction({
        kind: parsedQuick.kind!,
        category: parsedQuick.category!,
        amountIdr: parsedQuick.amountIdr!,
        occurredAt,
        source: "chat",
      });
      setQuickInput("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const handleEdit = (tx: NonNullable<typeof transactions>[0]) => {
    setForm({
      kind: tx.kind,
      category: tx.category,
      amountIdr: tx.amountIdr.toString(),
      occurredAt: toJakartaDateKey(tx.occurredAt),
      note: tx.note ?? "",
    });
    setEditId(tx._id);
    setModalMode("edit");
  };

  const filteredTransactions = transactions?.filter((tx) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.category.toLowerCase().includes(q) ||
      (tx.note && tx.note.toLowerCase().includes(q))
    );
  });

  return (
    <div className="feature-page">
      <div className="section-header">
        <div>
          <h1 className="section-title">Keuangan</h1>
          <p className="section-subtitle">Kelola pemasukan dan pengeluaran</p>
        </div>
        <div className="finance-toolbar">
          <div className="tabs">
            <button className={`tab ${viewMode === "weekly" ? "active" : ""}`} onClick={() => setViewMode("weekly")}>
              Mingguan
            </button>
            <button className={`tab ${viewMode === "monthly" ? "active" : ""}`} onClick={() => setViewMode("monthly")}>
              Bulanan
            </button>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm({ ...initialForm, occurredAt: todayKeyLocal() });
              setModalMode("create");
              setEditId(null);
            }}
          >
            + Tambah
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Pemasukan</div>
          <div className="stat-card-value income">
            {summary === undefined ? (
              <div className="skeleton skeleton-stat" />
            ) : (
              formatIdr(summary.totalIncome)
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pengeluaran</div>
          <div className="stat-card-value expense">
            {summary === undefined ? (
              <div className="skeleton skeleton-stat" />
            ) : (
              formatIdr(summary.totalExpense)
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Saldo Bersih</div>
          <div className="stat-card-value">
            {summary === undefined ? (
              <div className="skeleton skeleton-stat" />
            ) : (
              formatIdr(summary.netBalance)
            )}
          </div>
        </div>
      </div>

      {/* Quick Input */}
      <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="card-header">
          <h2 className="card-title">Input Cepat</h2>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <input
              className="form-input"
              placeholder='Ketik: "makanan 28000" atau "gaji 5000000"'
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
            />
            {quickInput.trim().length >= 3 && parsedQuick && (
              <div style={{ marginTop: "var(--space-xs)", fontSize: "var(--font-size-xs)" }}>
                {parsedQuick.isValid ? (
                  <span style={{ color: "var(--success)" }}>
                    {parsedQuick.kind === "income" ? "Pemasukan" : "Pengeluaran"}: {parsedQuick.category} {formatIdr(parsedQuick.amountIdr!)}
                  </span>
                ) : (
                  <span style={{ color: "var(--error)" }}>
                    {parsedQuick.clarificationMessage}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            disabled={!parsedQuick?.isValid}
            onClick={handleQuickAdd}
          >
            Catat
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="form-input"
          placeholder="Cari transaksi..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ minWidth: "200px" }}
        />
        <select
          className="form-select"
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
        >
          <option value="">Semua Tipe</option>
          <option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option>
        </select>
        <select
          className="form-select"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">Semua Kategori</option>
          {[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Transaction Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Daftar Transaksi</h2>
          <span className="badge badge-accent">
            {filteredTransactions?.length ?? 0} transaksi
          </span>
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
                    <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                      {formatDateJakarta(tx.occurredAt)}
                    </td>
                    <td>
                      <span className={`badge ${tx.kind === "income" ? "badge-income" : "badge-expense"}`}>
                        {tx.kind === "income" ? "Pemasukan" : "Pengeluaran"}
                      </span>
                      {tx.voidedAt && (
                        <span className="badge badge-cancelled" style={{ marginLeft: 6 }}>
                          Dibatalkan
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                      {tx.category}
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {tx.note || "—"}
                    </td>
                    <td style={{ fontWeight: 700, color: tx.kind === "income" ? "var(--income)" : "var(--expense)", whiteSpace: "nowrap" }}>
                      {tx.kind === "expense" ? "−" : "+"}{formatIdr(tx.amountIdr)}
                    </td>
                    <td className="col-actions">
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleEdit(tx)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)" }}
                          onClick={() => setDeleteConfirmId(tx._id)}
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
              Tambahkan transaksi pertamamu dengan tombol &quot;+ Tambah&quot; atau gunakan input cepat.
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalMode && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {modalMode === "create" ? "Catat Transaksi" : "Edit Transaksi"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tipe</label>
                <div className="tabs" style={{ width: "100%", display: "flex" }}>
                  <button
                    type="button"
                    className={`tab ${form.kind === "expense" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, kind: "expense", category: EXPENSE_CATEGORIES[0] })}
                    style={{ flex: 1 }}
                  >
                    Pengeluaran
                  </button>
                  <button
                    type="button"
                    className={`tab ${form.kind === "income" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, kind: "income", category: INCOME_CATEGORIES[0] })}
                    style={{ flex: 1 }}
                  >
                    Pemasukan
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select
                  className="form-select"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Nominal (Rp)</label>
                <input
                  className="form-input"
                  type="text"
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

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalMode(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} />
                      Menyimpan...
                    </>
                  ) : modalMode === "create" ? "Simpan" : "Perbarui"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Hapus Transaksi"
        message="Apakah Anda yakin ingin menghapus transaksi ini? Data transaksi akan dihapus secara permanen dari sistem."
        confirmLabel="Hapus Permanen"
        isLoading={isDeleting}
        onConfirm={async () => {
          if (!deleteConfirmId) return;
          setIsDeleting(true);
          try {
            await removeTransaction({ id: deleteConfirmId });
            setDeleteConfirmId(null);
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Gagal menghapus transaksi");
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
