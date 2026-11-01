"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ActionIcon } from "../components/ActionIcon";
import { BudgetList, useBudgetMonth } from "./BudgetList";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Dropdown } from "../components/Dropdown";
import { useConfirm } from "../components/useConfirm";
import { formatDateJakarta, formatIdr, parseIdr } from "../lib/utils";

type CategoryModal = { mode: "create" } | { mode: "edit"; id: Id<"budgetCategories"> } | null;
type BudgetModal = { mode: "create" } | { mode: "edit"; id: Id<"budgets"> } | null;

function splitItems(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BudgetingTab({ onGoSaving }: { onGoSaving: () => void }) {
  const categories = useQuery(api.budget.listCategories);
  const monthKey = useBudgetMonth();
  const budgets = useQuery(api.budget.listBudgets, { monthKey });
  const savings = useQuery(api.savings.list);
  const contributions = useQuery(api.savings.listContributions, { limit: 6 });

  const createCategory = useMutation(api.budget.createCategory);
  const updateCategory = useMutation(api.budget.updateCategory);
  const removeCategory = useMutation(api.budget.removeCategory);
  const createBudget = useMutation(api.budget.createBudget);
  const updateBudget = useMutation(api.budget.updateBudget);
  const removeBudget = useMutation(api.budget.removeBudget);
  const contribute = useMutation(api.savings.contribute);
  const removeContribution = useMutation(api.savings.removeContribution);

  const { openConfirm, confirmModal } = useConfirm();

  // ── Category modal ──
  const [categoryModal, setCategoryModal] = useState<CategoryModal>(null);
  const [catName, setCatName] = useState("");
  const [catItems, setCatItems] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [newItemByCategory, setNewItemByCategory] = useState<Record<string, string>>({});
  const [inlineError, setInlineError] = useState<string | null>(null);

  // ── Budget modal ──
  const [budgetModal, setBudgetModal] = useState<BudgetModal>(null);
  const [bName, setBName] = useState("");
  const [bCategory, setBCategory] = useState("");
  const [bAmount, setBAmount] = useState("");
  const [bError, setBError] = useState<string | null>(null);
  const [bSaving, setBSaving] = useState(false);

  // ── Saving contribution modal ──
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState("");
  const [saveAmount, setSaveAmount] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSaving, setSaveSaving] = useState(false);

  // ── Category handlers ──
  const openCreateCategory = () => {
    setCatName("");
    setCatItems("");
    setCatError(null);
    setCategoryModal({ mode: "create" });
  };

  const openEditCategory = (c: NonNullable<typeof categories>[number]) => {
    setCatName(c.name);
    setCatItems(c.items.join(", "));
    setCatError(null);
    setCategoryModal({ mode: "edit", id: c._id });
  };

  const submitCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryModal || catSaving) return;
    setCatError(null);
    setCatSaving(true);
    try {
      if (categoryModal.mode === "create") {
        await createCategory({ name: catName, items: splitItems(catItems) });
      } else {
        await updateCategory({ id: categoryModal.id, name: catName, items: splitItems(catItems) });
      }
      setCategoryModal(null);
    } catch (err: unknown) {
      setCatError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setCatSaving(false);
    }
  };

  const addItem = async (c: NonNullable<typeof categories>[number]) => {
    const value = (newItemByCategory[c._id] ?? "").trim();
    if (!value) return;
    setInlineError(null);
    try {
      await updateCategory({ id: c._id, items: [...c.items, value] });
      setNewItemByCategory((prev) => ({ ...prev, [c._id]: "" }));
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const dropItem = async (c: NonNullable<typeof categories>[number], item: string) => {
    setInlineError(null);
    try {
      await updateCategory({ id: c._id, items: c.items.filter((i) => i !== item) });
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  // ── Budget handlers ──
  const openCreateBudget = () => {
    setBName("");
    setBCategory("");
    setBAmount("");
    setBError(null);
    setBudgetModal({ mode: "create" });
  };

  const openEditBudget = (b: NonNullable<typeof budgets>[number]) => {
    setBName(b.name);
    setBCategory(b.categoryId ?? "");
    setBAmount(b.amountIdr.toString());
    setBError(null);
    setBudgetModal({ mode: "edit", id: b._id });
  };

  const submitBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetModal || bSaving) return;
    setBError(null);

    const amount = parseIdr(bAmount);
    if (amount === null) return setBError("Nominal harus bilangan bulat positif");

    setBSaving(true);
    try {
      if (budgetModal.mode === "create") {
        await createBudget({
          name: bName,
          categoryId: bCategory ? (bCategory as Id<"budgetCategories">) : undefined,
          amountIdr: amount,
        });
      } else {
        await updateBudget({
          id: budgetModal.id,
          name: bName,
          categoryId: bCategory ? (bCategory as Id<"budgetCategories">) : undefined,
          clearCategory: !bCategory,
          amountIdr: amount,
        });
      }
      setBudgetModal(null);
    } catch (err: unknown) {
      setBError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBSaving(false);
    }
  };

  // ── Saving handlers ──
  const openSave = () => {
    setSaveTarget(savings && savings.length === 1 ? savings[0]._id : "");
    setSaveAmount("");
    setSaveNote("");
    setSaveError(null);
    setSaveOpen(true);
  };

  const submitSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveSaving) return;
    setSaveError(null);
    const amount = parseIdr(saveAmount);
    if (!saveTarget) return setSaveError("Pilih tabungan tujuan");
    if (amount === null) return setSaveError("Jumlah harus bilangan bulat positif");

    setSaveSaving(true);
    try {
      await contribute({
        savingId: saveTarget as Id<"savings">,
        amountIdr: amount,
        note: saveNote || undefined,
      });
      setSaveOpen(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSaveSaving(false);
    }
  };

  const categoryOptions = [
    { value: "", label: "Tanpa kategori" },
    ...(categories ?? []).map((c) => ({ value: c._id, label: c.name })),
  ];
  const savingOptions = (savings ?? []).map((s) => ({
    value: s._id,
    label: s.name,
    hint: `${formatIdr(s.savedIdr)} dari ${formatIdr(s.targetIdr)}`,
  }));


  return (
    <div>
      <p className="tab-intro">
        Atur kategori, subkategori, dan budget bulanan di sini. Pengeluaran otomatis mengurangi sisa budget,
        sementara setoran menabung dicatat terpisah. Pilihan tampilan disimpan di perangkat ini.
      </p>

      <BudgetList budgets={budgets} monthKey={monthKey} onCreate={openCreateBudget} onEdit={openEditBudget} onDelete={(b) => openConfirm({ title: "Hapus Budget", message: `Hapus budget "${b.name}"? Transaksi dan saldo tersedia tetap tersimpan.`, actionText: "Hapus Budget", onConfirm: async () => { await removeBudget({ id: b._id }); } })} />
      <div className="budget-layout budget-support-layout">
        <div className="stack">
          <div className="card">
            <div className="card-header" style={{ marginBottom: 0 }}>
              <div>
                <h2 className="card-title">Menabung</h2>
                <div className="card-subtitle">Pilih tabungan, lalu isi jumlahnya</div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openSave}
                disabled={!savings || savings.length === 0}
              >
                + Menabung
              </button>
            </div>

            {savings !== undefined && savings.length === 0 && (
              <div className="inline-note" style={{ marginTop: 14 }}>
                Belum ada target tabungan. Buat dulu di tab{" "}
                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "0 4px", minHeight: 0, color: "var(--accent-700)", fontWeight: 700 }} onClick={onGoSaving}>
                  Saving
                </button>
                , lalu kembali ke sini untuk menabung.
              </div>
            )}

            {contributions && contributions.length > 0 && (
              <div className="contribution-list" style={{ marginTop: 10 }}>
                {contributions.map((c) => (
                  <div key={c._id} className="contribution-row">
                    <div>
                      <strong>{c.savingName}</strong>
                      <small>
                        {formatDateJakarta(c.occurredAt)}
                        {c.note ? ` · ${c.note}` : ""}
                      </small>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="money-strong">+{formatIdr(c.amountIdr)}</span>
                      <ActionIcon action="delete" label={`Hapus setoran ${c.savingName}`}
                        onClick={() =>
                          openConfirm({
                            title: "Batalkan Setoran",
                            message: `Hapus setoran ${formatIdr(c.amountIdr)} ke "${c.savingName}"? Saldo tabungan akan berkurang.`,
                            actionText: "Hapus Setoran",
                            onConfirm: async () => {
                              await removeContribution({ id: c._id });
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: categories ── */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 0 }}>
            <div>
              <h2 className="card-title">Kategori</h2>
              <div className="card-subtitle">Kelompokkan subkategori seperti Tissue, Air, atau Belanja</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateCategory}>
              + Kategori
            </button>
          </div>

          {inlineError && <div className="form-error" style={{ marginTop: 12 }}>{inlineError}</div>}

          {categories === undefined ? (
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          ) : categories.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              {categories.map((c) => (
                <div key={c._id} className="category-card">
                  <div className="category-card-head">
                    <h3>{c.name}</h3>
                    <div style={{ display: "inline-flex", gap: 4 }}>
                      <ActionIcon action="edit" label={`Edit kategori ${c.name}`} onClick={() => openEditCategory(c)} />
                      <ActionIcon action="delete" label={`Hapus kategori ${c.name}`}
                        onClick={() =>
                          openConfirm({
                            title: "Hapus Kategori",
                            message: `Hapus kategori "${c.name}"? Budget terkait tetap ada tanpa kategori, dan transaksi lama tetap tersimpan.`,
                            actionText: "Hapus Kategori",
                            onConfirm: async () => {
                              await removeCategory({ id: c._id });
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  {c.items.length > 0 || budgets?.some(b => b.categoryId === c._id) ? (
                    <div className="item-chips">
                      {Array.from(new Map([...c.items, ...(budgets ?? []).filter(b => b.categoryId === c._id).map(b => b.name)].map(item => [item.toLowerCase(), item])).values()).map((item) => (
                        <span key={item} className="item-chip">
                          {item}
                          {!budgets?.some(b => b.categoryId === c._id && b.name.toLowerCase() === item.toLowerCase()) && <button type="button" aria-label={`Hapus ${item}`} onClick={() => dropItem(c, item)}>
                            ×
                          </button>}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                      Belum ada subkategori. Tambahkan subkategori pertama.
                    </div>
                  )}

                  <form
                    className="add-item-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addItem(c);
                    }}
                  >
                    <input
                      className="form-input"
                      placeholder="Tambah subkategori, mis. Tissue"
                      value={newItemByCategory[c._id] ?? ""}
                      onChange={(e) => setNewItemByCategory((prev) => ({ ...prev, [c._id]: e.target.value }))}
                      aria-label={`Tambah isi kategori ${c.name}`}
                    />
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Tambah
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">Belum ada kategori</div>
              <div className="empty-state-description">
                Contoh: &quot;Kebutuhan pokok&quot; berisi tissue, air, skincare.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category modal */}
      {categoryModal && (
        <div className="modal-overlay" onClick={() => setCategoryModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{categoryModal.mode === "create" ? "Kategori Baru" : "Edit Kategori"}</h2>
            <form onSubmit={submitCategory}>
              <div className="form-group">
                <label className="form-label">Nama kategori</label>
                <input
                  className="form-input"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Contoh: Kebutuhan pokok"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Isi kategori (pisahkan dengan koma)</label>
                <textarea
                  className="form-textarea"
                  value={catItems}
                  onChange={(e) => setCatItems(e.target.value)}
                  placeholder="tissue, air, skincare"
                />
              </div>
              {catError && <div className="form-error">{catError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCategoryModal(null)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={catSaving}>
                  {catSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budget modal */}
      {budgetModal && (
        <div className="modal-overlay" onClick={() => setBudgetModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{budgetModal.mode === "create" ? "Budget Baru" : "Edit Budget"}</h2>
            <form onSubmit={submitBudget}>
              <div className="form-group">
                <label className="form-label">Nama subkategori</label>
                <input
                  className="form-input"
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  placeholder="Contoh: Skincare bulanan"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <Dropdown value={bCategory} onChange={setBCategory} options={categoryOptions} ariaLabel="Kategori budget" />
              </div>
              <div className="budget-amount-field">
                <div className="form-group">
                  <label className="form-label">Budget awal per bulan (Rp)</label>
                  <input
                    className="form-input"
                    inputMode="numeric"
                    value={bAmount}
                    onChange={(e) => setBAmount(e.target.value)}
                    placeholder="Contoh: 150000"
                    required
                  />
                </div>
              </div>
              <p className="inline-note">Budget berlaku bulanan. Terpakai dihitung ulang setiap tanggal 1; saldo tersedia tetap berlanjut.</p>
              {bError && <div className="form-error" style={{ marginTop: 12 }}>{bError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setBudgetModal(null)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={bSaving}>
                  {bSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Saving contribution modal */}
      {saveOpen && (
        <div className="modal-overlay" onClick={() => setSaveOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Menabung</h2>
            <form onSubmit={submitSave}>
              <div className="form-group">
                <label className="form-label">Menabung untuk</label>
                <Dropdown
                  value={saveTarget}
                  onChange={setSaveTarget}
                  options={savingOptions}
                  placeholder="Pilih tabungan..."
                  ariaLabel="Tabungan tujuan"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah (Rp)</label>
                <input
                  className="form-input"
                  inputMode="numeric"
                  value={saveAmount}
                  onChange={(e) => setSaveAmount(e.target.value)}
                  placeholder="Contoh: 100000"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan (opsional)</label>
                <input
                  className="form-input"
                  value={saveNote}
                  onChange={(e) => setSaveNote(e.target.value)}
                  placeholder="Contoh: Sisa uang bulan ini"
                />
              </div>
              {saveError && <div className="form-error">{saveError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSaveOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saveSaving}>
                  {saveSaving ? "Menyimpan..." : "Simpan Setoran"}
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
