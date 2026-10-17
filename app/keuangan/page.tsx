"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatIdr, formatDateJakarta, getCurrentWeekRange, getCurrentMonthRange } from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

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
  const voidTransaction = useMutation(api.transactions.voidTransaction);

  const categories = form.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseInt(form.amountIdr.replace(/[.,]/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Nominal harus bilangan bulat positif");
      return;
    }

    const dateStr = form.occurredAt || new Date().toISOString().split("T")[0];
    const occurredAt = new Date(dateStr + "T00:00:00+07:00").getTime();

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
    }
  };

  const handleQuickAdd = async () => {
    if (!parsedQuick || !parsedQuick.isValid || parsedQuick.needsClarification) return;

    try {
      const occurredAt = new Date(new Date().toISOString().split("T")[0] + "T00:00:00+07:00").getTime();
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
      occurredAt: new Date(tx.occurredAt).toISOString().split("T")[0],
      note: tx.note ?? "",
    });
    setEditId(tx._id);
    setModalMode("edit");
  };

  const handleVoid = async (id: Id<"transactions">) => {
    if (!confirm("Batalkan transaksi ini?")) return;
    try {
      await voidTransaction({ id });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const filteredTransactions = transactions?.filter((tx) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        tx.category.toLowerCase().includes(q) ||
        (tx.note ?? "").toLowerCase().includes(q) ||
        tx.amountIdr.toString().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Keuangan</h1>
          <p className="section-subtitle">Kelola pemasukan dan pengeluaran</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
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
              setForm({ ...initialForm, occurredAt: new Date().toISOString().split("T")[0] });
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
          <div className="stat-card-icon income">📈</div>
          <div className="stat-card-label">Pemasukan</div>
          <div className="stat-card-value income">
            {summary ? formatIdr(summary.totalIncome) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon expense">📉</div>
          <div className="stat-card-label">Pengeluaran</div>
          <div className="stat-card-value expense">
            {summary ? formatIdr(summary.totalExpense) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon balance">💰</div>
          <div className="stat-card-label">Saldo Bersih</div>
          <div className="stat-card-value">
            {summary ? formatIdr(summary.netBalance) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
      </div>

      {/* Quick Input */}
      <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="card-header">
          <h2 className="card-title">⚡ Input Cepat</h2>
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
                    ✓ {parsedQuick.kind === "income" ? "Pemasukan" : "Pengeluaran"}: {parsedQuick.category} {formatIdr(parsedQuick.amountIdr!)}
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
          placeholder="🔍 Cari transaksi..."
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

      {/* Transaction List */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Daftar Transaksi</h2>
          <span className="badge badge-accent">
            {filteredTransactions?.length ?? 0} transaksi
          </span>
        </div>
        {filteredTransactions && filteredTransactions.length > 0 ? (
          filteredTransactions.map((tx) => (
            <div key={tx._id} className={`list-item ${tx.voidedAt ? "voided" : ""}`}>
              <div
                className="list-item-icon"
                style={{
                  background: tx.kind === "income" ? "var(--income-bg)" : "var(--expense-bg)",
                  color: tx.kind === "income" ? "var(--income)" : "var(--expense)",
                }}
              >
                {tx.kind === "income" ? "📈" : "📉"}
              </div>
              <div className="list-item-content">
                <div className="list-item-title" style={{ textTransform: "capitalize" }}>
                  {tx.category}
                  {tx.voidedAt && <span className="badge badge-cancelled" style={{ marginLeft: "var(--space-sm)" }}>Dibatalkan</span>}
                </div>
                <div className="list-item-subtitle">
                  {formatDateJakarta(tx.occurredAt)}
                  {tx.note && ` · ${tx.note}`}
                </div>
              </div>
              <div className="list-item-right" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                <div className={`list-item-amount ${tx.kind}`}>
                  {tx.kind === "expense" ? "-" : "+"}{formatIdr(tx.amountIdr)}
                </div>
                {!tx.voidedAt && (
                  <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(tx)} title="Edit">
                      ✏️
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleVoid(tx._id)} title="Batalkan">
                      🚫
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : filteredTransactions ? (
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <div className="empty-state-title">Belum ada transaksi</div>
            <div className="empty-state-description">
              Tambahkan transaksi pertamamu dengan tombol &quot;+ Tambah&quot; atau gunakan input cepat.
            </div>
          </div>
        ) : (
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="list-item">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "var(--radius-md)" }} />
                <div className="list-item-content">
                  <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalMode && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {modalMode === "create" ? "Tambah Transaksi" : "Edit Transaksi"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tipe</label>
                <div className="tabs" style={{ width: "100%" }}>
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

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nominal (Rp)</label>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="28000"
                    value={form.amountIdr}
                    onChange={(e) => setForm({ ...form, amountIdr: e.target.value.replace(/[^0-9]/g, "") })}
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
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Catatan (opsional)</label>
                <input
                  className="form-input"
                  placeholder="Makan siang, bensin, dll."
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModalMode(null)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === "create" ? "Simpan" : "Perbarui"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
