"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  formatIdr,
  todayKeyLocal,
  getCurrentWeekRange,
  getWeekDates,
  formatDateKeyLong,
  WEEKLY_MENU_BUDGET_IDR,
} from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "../components/ConfirmModal";

type ActiveTab = "recipes" | "ingredients" | "shopping" | "mealplan";
type IngredientKind = "harian" | "mingguan" | "bulanan";

const UNITS = [
  "gram",
  "kg",
  "ml",
  "liter",
  "buah",
  "ekor",
  "potong",
  "bungkus",
  "lembar",
  "butir",
  "sdm",
  "sdt",
  "siung",
];

export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("recipes");

  // Shared Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionText: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionText: "Hapus",
    isDanger: true,
    onConfirm: async () => {},
  });
  const [isActionLoading, setIsActionLoading] = useState(false);

  const openConfirm = (opts: {
    title: string;
    message: string;
    actionText?: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }) => {
    setConfirmModal({
      isOpen: true,
      title: opts.title,
      message: opts.message,
      actionText: opts.actionText ?? "Hapus",
      isDanger: opts.isDanger !== undefined ? opts.isDanger : true,
      onConfirm: async () => {
        setIsActionLoading(true);
        try {
          await opts.onConfirm();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: unknown) {
          console.error("Action error", err);
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="feature-page">
      <div className="section-header">
        <div>
          <h1 className="section-title">Menu & Belanja</h1>
          <p className="section-subtitle">
            Katalog resep, inventaris bahan masakan, daftar belanja otomatis, dan menu mingguan
          </p>
        </div>
      </div>

      {/* Tabs navigation in revised order: Resep -> Bahan -> Daftar Belanja -> Menu */}
      <div className="menu-tabs" role="tablist">
        {([
          { key: "recipes", label: "Resep" },
          { key: "ingredients", label: "Bahan" },
          { key: "shopping", label: "Daftar Belanja" },
          { key: "mealplan", label: "Menu" },
        ] as { key: ActiveTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "recipes" && <RecipesTab openConfirm={openConfirm} />}
      {activeTab === "ingredients" && <IngredientsTab openConfirm={openConfirm} />}
      {activeTab === "shopping" && (
        <ShoppingTab onGoToMenu={() => setActiveTab("mealplan")} />
      )}
      {activeTab === "mealplan" && <MealPlanTab openConfirm={openConfirm} />}

      {/* Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        actionText={confirmModal.actionText}
        isDanger={confirmModal.isDanger}
        isLoading={isActionLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resep Tab
// ─────────────────────────────────────────────────────────────────────────────

function RecipesTab({
  openConfirm,
}: {
  openConfirm: (opts: {
    title: string;
    message: string;
    actionText?: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manage ingredients modal
  const [manageRecipe, setManageRecipe] = useState<{
    _id: Id<"recipes">;
    name: string;
  } | null>(null);
  const [selectedIngId, setSelectedIngId] = useState<Id<"ingredients"> | "">("");
  const [ingQuantity, setIngQuantity] = useState("");
  const [ingUnit, setIngUnit] = useState("gram");
  const [ingError, setIngError] = useState<string | null>(null);

  // Instruction collapse state per recipe
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});

  const recipes = useQuery(api.meals.listRecipes, {});
  const allIngredients = useQuery(api.meals.listIngredients);
  const createRecipe = useMutation(api.meals.createRecipe);
  const removeRecipe = useMutation(api.meals.removeRecipe);
  const addRecipeIngredient = useMutation(api.meals.addRecipeIngredient);
  const removeRecipeIngredient = useMutation(api.meals.removeRecipeIngredient);

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createRecipe({
        name,
        servings: parseInt(servings, 10),
        instructions: instructions.trim() || undefined,
      });
      setShowForm(false);
      setName("");
      setServings("2");
      setInstructions("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngError(null);
    if (!manageRecipe || !selectedIngId) return;

    const qty = parseFloat(ingQuantity);
    if (isNaN(qty) || qty <= 0) {
      setIngError("Jumlah takaran harus lebih dari 0");
      return;
    }

    try {
      await addRecipeIngredient({
        recipeId: manageRecipe._id,
        ingredientId: selectedIngId as Id<"ingredients">,
        quantity: qty,
        unit: ingUnit,
      });
      setIngQuantity("");
    } catch (err: unknown) {
      setIngError(err instanceof Error ? err.message : "Gagal menambahkan bahan");
    }
  };

  const promptDeleteRecipe = (recipe: { _id: Id<"recipes">; name: string }) => {
    openConfirm({
      title: "Hapus Resep",
      message: `Hapus resep "${recipe.name}"? Bahan dan jadwal menu terkait resep ini juga akan dibersihkan.`,
      actionText: "Hapus Resep",
      isDanger: true,
      onConfirm: async () => {
        await removeRecipe({ id: recipe._id });
      },
    });
  };

  const promptRemoveIngredient = (riId: Id<"recipeIngredients">, ingName: string) => {
    openConfirm({
      title: "Hapus Bahan dari Resep",
      message: `Hapus bahan "${ingName}" dari resep ini?`,
      actionText: "Hapus Bahan",
      isDanger: true,
      onConfirm: async () => {
        await removeRecipeIngredient({ id: riId });
      },
    });
  };

  // Recipe being managed detail for modal
  const recipeWithDetail = recipes?.find((r) => r._id === manageRecipe?._id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-md)" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Batal" : "+ Resep Baru"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-md)" }}>
            Tambah Resep Baru
          </h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Nama Resep</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Ayam Goreng Lengkuas, Sayur Sop, Nasi Goreng..."
                required
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Porsi</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Instruksi / Catatan Memasak (opsional)</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Langkah memasak atau catatan bumbu..."
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : "Simpan Resep"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Recipes Table: DAFTAR BAHAN & ESTIMASI DITAMPILKAN DI TABEL; INSTRUKSI TIDAK LANGSUNG DITAMPILKAN */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">Daftar Resep</h2>
            <p className="card-subtitle">
              Resep makanan dengan daftar bahan, takaran, dan perkiraan biaya otomatis
            </p>
          </div>
          <span className="badge badge-accent">
            {recipes ? `${recipes.length} resep` : "Memuat..."}
          </span>
        </div>

        {recipes === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : recipes.length > 0 ? (
          <div className="table-container" style={{ marginTop: "var(--space-md)" }}>
            <table className="editorial-table">
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Nama Resep</th>
                  <th style={{ width: "38%" }}>Daftar Bahan & Takaran</th>
                  <th style={{ width: "18%" }}>Estimasi Biaya</th>
                  <th style={{ width: "12%" }}>Catatan</th>
                  <th className="col-actions" style={{ width: "10%" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const isNotesOpen = expandedInstructions[recipe._id] ?? false;
                  const ingredientsList = recipe.ingredients ?? [];

                  return (
                    <tr key={recipe._id} style={{ verticalAlign: "top" }}>
                      {/* 1. Nama Resep & Porsi */}
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "var(--font-size-base)" }}>
                          {recipe.name}
                        </div>
                        <span className="badge badge-neutral" style={{ marginTop: 4, fontSize: "11px" }}>
                          {recipe.servings} porsi
                        </span>
                      </td>

                      {/* 2. Daftar Bahan (ditampilkan langsung di tabel) */}
                      <td>
                        {ingredientsList.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {ingredientsList.map((ing) => (
                              <span
                                key={ing._id}
                                className="badge badge-accent"
                                style={{
                                  fontSize: "12px",
                                  padding: "3px 8px",
                                  fontWeight: 500,
                                }}
                              >
                                {ing.name} ({ing.quantity} {ing.unit})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-xs)" }}>
                            Belum ada bahan ditambahkan
                          </span>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "2px 6px", fontSize: "11px", color: "var(--accent-600)" }}
                            onClick={() => {
                              setManageRecipe({ _id: recipe._id, name: recipe.name });
                              setSelectedIngId("");
                              setIngQuantity("");
                            }}
                          >
                            + Kelola Bahan
                          </button>
                        </div>
                      </td>

                      {/* 3. Estimasi Biaya (ditampilkan langsung di tabel) */}
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--accent-600)", fontSize: "var(--font-size-base)" }}>
                          {formatIdr(recipe.estimatedCostIdr ?? 0)}
                        </div>
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", marginTop: 2 }}>
                          {formatIdr(recipe.costPerServing ?? 0)} / porsi
                        </div>
                      </td>

                      {/* 4. Instruksi / Catatan (tidak langsung ditampilkan, pakai toggle) */}
                      <td>
                        {recipe.instructions ? (
                          <div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: "11px", padding: "3px 6px" }}
                              onClick={() => toggleInstructions(recipe._id)}
                            >
                              {isNotesOpen ? "▲ Tutup" : "▼ Lihat Catatan"}
                            </button>
                            {isNotesOpen && (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: "8px 10px",
                                  background: "var(--bg-secondary)",
                                  borderRadius: "var(--radius-sm)",
                                  fontSize: "var(--font-size-xs)",
                                  color: "var(--text-secondary)",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.4,
                                }}
                              >
                                {recipe.instructions}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-xs)" }}>
                            —
                          </span>
                        )}
                      </td>

                      {/* 5. Aksi */}
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)" }}
                          onClick={() => promptDeleteRecipe(recipe)}
                          title="Hapus resep"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada resep</div>
            <div className="empty-state-description">
              Tambahkan resep masakan pertamamu dengan tombol &quot;+ Resep Baru&quot;.
            </div>
          </div>
        )}
      </div>

      {/* Modal Kelola Bahan untuk Resep */}
      {manageRecipe && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <h3 className="card-title" style={{ marginBottom: "var(--space-xs)" }}>
              Kelola Bahan: {manageRecipe.name}
            </h3>
            <p className="card-subtitle" style={{ marginBottom: "var(--space-md)" }}>
              Tambahkan atau hapus bahan yang digunakan pada resep ini
            </p>

            {/* List of currently linked ingredients */}
            <div style={{ marginBottom: "var(--space-md)" }}>
              <strong style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", display: "block", marginBottom: 6 }}>
                BAHAN SAAT INI:
              </strong>
              {recipeWithDetail?.ingredients && recipeWithDetail.ingredients.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {recipeWithDetail.ingredients.map((ing) => (
                    <div
                      key={ing._id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        background: "var(--bg-secondary)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "var(--font-size-xs)",
                      }}
                    >
                      <div>
                        <strong>{ing.name}</strong> — {ing.quantity} {ing.unit}
                        <span style={{ color: "var(--accent-600)", marginLeft: 8 }}>
                          ({formatIdr(ing.costIdr)})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--error)", padding: "2px 6px" }}
                        onClick={() => promptRemoveIngredient(ing._id, ing.name)}
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
                  Belum ada bahan pada resep ini.
                </p>
              )}
            </div>

            {/* Form to add ingredient */}
            <form onSubmit={handleAddIngredient} style={{ borderTop: "1px dashed var(--border-light)", paddingTop: "var(--space-md)" }}>
              <strong style={{ fontSize: "var(--font-size-xs)", color: "var(--text-primary)", display: "block", marginBottom: 8 }}>
                TAMBAH BAHAN KE RESEP INI:
              </strong>
              <div className="form-group">
                <label className="form-label">Pilih Bahan</label>
                <select
                  className="form-select"
                  value={selectedIngId}
                  onChange={(e) => {
                    const id = e.target.value as Id<"ingredients">;
                    setSelectedIngId(id);
                    const found = allIngredients?.find((i) => i._id === id);
                    if (found) setIngUnit(found.unit);
                  }}
                  required
                >
                  <option value="">Pilih bahan masakan...</option>
                  {allIngredients?.map((ing) => (
                    <option key={ing._id} value={ing._id}>
                      {ing.name} ({ing.unit}) — {ing.kind ?? "harian"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Jumlah Takaran</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    className="form-input"
                    value={ingQuantity}
                    onChange={(e) => setIngQuantity(e.target.value)}
                    placeholder="Contoh: 3 atau 250"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Satuan</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ingUnit}
                    onChange={(e) => setIngUnit(e.target.value)}
                    required
                  />
                </div>
              </div>

              {ingError && <div className="form-error">{ingError}</div>}

              <div className="modal-actions" style={{ marginTop: "var(--space-md)" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setManageRecipe(null)}
                >
                  Selesai
                </button>
                <button type="submit" className="btn btn-primary" disabled={!selectedIngId || !ingQuantity}>
                  + Tambahkan Bahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bahan Tab (Form Spesifik: Harian vs Mingguan vs Bulanan)
// ─────────────────────────────────────────────────────────────────────────────

function IngredientsTab({
  openConfirm,
}: {
  openConfirm: (opts: {
    title: string;
    message: string;
    actionText?: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [filterKind, setFilterKind] = useState<string>("all");

  // Step 1: User selects frequency first:
  const [kind, setKind] = useState<IngredientKind>("harian");

  // Common fields:
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("gram");

  // Harian specific fields:
  const [harianPrice, setHarianPrice] = useState("");
  const [harianBuyQty, setHarianBuyQty] = useState("");

  // Mingguan / Bulanan specific fields:
  const [packagePrice, setPackagePrice] = useState("");
  const [packageContent, setPackageContent] = useState("");
  const [usagePerCook, setUsagePerCook] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ingredients = useQuery(api.meals.listIngredients);
  const createIngredient = useMutation(api.meals.createIngredient);
  const removeIngredient = useMutation(api.meals.removeIngredient);

  const resetForm = () => {
    setName("");
    setUnit(kind === "harian" ? "ekor" : "siung");
    setHarianPrice("");
    setHarianBuyQty("");
    setPackagePrice("");
    setPackageContent("");
    setUsagePerCook("");
    setError(null);
  };

  const openFormWithKind = (k: IngredientKind) => {
    setKind(k);
    setName("");
    setUnit(k === "harian" ? "ekor" : "siung");
    setHarianPrice("");
    setHarianBuyQty("");
    setPackagePrice("");
    setPackageContent("");
    setUsagePerCook("");
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama bahan tidak boleh kosong");
      return;
    }

    setIsSubmitting(true);
    try {
      if (kind === "harian") {
        const price = parseInt(harianPrice.replace(/\D/g, ""), 10);
        if (isNaN(price) || price < 0) {
          setError("Harga per satuan harus berupa bilangan bulat positif");
          setIsSubmitting(false);
          return;
        }
        const buyQty = harianBuyQty ? parseFloat(harianBuyQty) : undefined;
        if (buyQty !== undefined && buyQty <= 0) {
          setError("Berapa banyak yang akan dibeli harus lebih dari 0");
          setIsSubmitting(false);
          return;
        }

        await createIngredient({
          name: trimmedName,
          unit,
          kind: "harian",
          currentPriceIdr: price,
          buyQuantity: buyQty,
        });
      } else {
        // Mingguan or Bulanan
        const pkgPrice = parseInt(packagePrice.replace(/\D/g, ""), 10);
        const pkgContent = parseFloat(packageContent);
        const cookUsage = parseFloat(usagePerCook);

        if (isNaN(pkgPrice) || pkgPrice <= 0) {
          setError("Harga beli paket harus bilangan bulat positif");
          setIsSubmitting(false);
          return;
        }
        if (isNaN(pkgContent) || pkgContent <= 0) {
          setError("Isi dalam 1 paket harus lebih dari 0");
          setIsSubmitting(false);
          return;
        }
        if (isNaN(cookUsage) || cookUsage <= 0) {
          setError("Berapa banyak bahan yang dipakai dalam sekali masak harus lebih dari 0");
          setIsSubmitting(false);
          return;
        }
        if (cookUsage > pkgContent) {
          setError("Pemakaian sekali masak tidak boleh melebihi isi paket pembelian");
          setIsSubmitting(false);
          return;
        }

        await createIngredient({
          name: trimmedName,
          unit,
          kind,
          packagePriceIdr: pkgPrice,
          packageContent: pkgContent,
          usagePerCook: cookUsage,
        });
      }

      setShowForm(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promptDeleteIngredient = (ing: { _id: Id<"ingredients">; name: string }) => {
    openConfirm({
      title: "Hapus Bahan",
      message: `Hapus bahan "${ing.name}"? Bahan ini juga akan dilepas dari semua resep terkait.`,
      actionText: "Hapus Bahan",
      isDanger: true,
      onConfirm: async () => {
        await removeIngredient({ id: ing._id });
      },
    });
  };

  // Preview calculations for Mingguan/Bulanan
  const parsedPkgPrice = parseInt(packagePrice.replace(/\D/g, ""), 10) || 0;
  const parsedPkgContent = parseFloat(packageContent) || 0;
  const parsedUsage = parseFloat(usagePerCook) || 0;
  const unitPricePreview = parsedPkgContent > 0 ? parsedPkgPrice / parsedPkgContent : 0;
  const perCookPricePreview = Math.round(unitPricePreview * parsedUsage);

  // Filtered ingredients
  const filteredList = ingredients?.filter((ing) => {
    if (filterKind === "all") return true;
    const itemKind = ing.kind ?? "harian";
    return itemKind === filterKind;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)", flexWrap: "wrap", gap: 12 }}>
        {/* Filter Pills */}
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "all", label: "Semua Bahan" },
            { id: "harian", label: "Harian" },
            { id: "mingguan", label: "Mingguan" },
            { id: "bulanan", label: "Bulanan" },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`btn btn-sm ${filterKind === pill.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterKind(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (showForm) setShowForm(false);
            else openFormWithKind("harian");
          }}
        >
          {showForm ? "Batal" : "+ Bahan Baru"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)", border: "2px solid var(--accent-500)" }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-xs)" }}>
            Tambah Bahan Baru
          </h2>
          <p className="card-subtitle" style={{ marginBottom: "var(--space-md)" }}>
            Pilih frekuensi pembelian terlebih dahulu untuk menampilkan formulir yang sesuai
          </p>

          {/* STEP 1: USER MEMILIH FREKUENSI PEMBELIAN TERLEBIH DAHULU */}
          <div style={{ marginBottom: "var(--space-lg)" }}>
            <label className="form-label" style={{ fontWeight: 700 }}>
              PILIH JENIS / FREKUENSI BAHAN:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <button
                type="button"
                className={`card ${kind === "harian" ? "active-calendar-day" : ""}`}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "12px",
                  border: kind === "harian" ? "2px solid var(--accent-600)" : "1px solid var(--border-light)",
                }}
                onClick={() => setKind("harian")}
              >
                <strong style={{ display: "block", color: "var(--text-primary)" }}>Bahan Harian</strong>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
                  Misal: Ikan, ayam, tempe. Dibeli segar per kebutuhan masak.
                </span>
              </button>

              <button
                type="button"
                className={`card ${kind === "mingguan" ? "active-calendar-day" : ""}`}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "12px",
                  border: kind === "mingguan" ? "2px solid var(--accent-600)" : "1px solid var(--border-light)",
                }}
                onClick={() => setKind("mingguan")}
              >
                <strong style={{ display: "block", color: "var(--text-primary)" }}>Bahan Mingguan</strong>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
                  Misal: Bawang putih, bawang merah, cabai. Dibeli per paket per minggu.
                </span>
              </button>

              <button
                type="button"
                className={`card ${kind === "bulanan" ? "active-calendar-day" : ""}`}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "12px",
                  border: kind === "bulanan" ? "2px solid var(--accent-600)" : "1px solid var(--border-light)",
                }}
                onClick={() => setKind("bulanan")}
              >
                <strong style={{ display: "block", color: "var(--text-primary)" }}>Bahan Bulanan</strong>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
                  Misal: Kaldu bubuk, garam, gula, terasi, bumbu marinasi.
                </span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Common Fields */}
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Nama Bahan</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    kind === "harian"
                      ? "Contoh: Daging Ayam, Ikan Tongkol, Tempe"
                      : kind === "mingguan"
                      ? "Contoh: Bawang Putih, Cabai Merah"
                      : "Contoh: Kaldu Bubuk, Minyak Goreng, Garam"
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Satuan</label>
                <select
                  className="form-select"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* FORM 1: BAHAN HARIAN */}
            {kind === "harian" && (
              <div style={{ background: "var(--bg-secondary)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)" }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Harga Beli per {unit} (Rp)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={harianPrice}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, "");
                        setHarianPrice(clean ? parseInt(clean, 10).toLocaleString("id-ID") : "");
                      }}
                      placeholder="Contoh: 15.000"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Berapa Banyak yang Akan Dibeli? ({unit})</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      min="0.1"
                      value={harianBuyQty}
                      onChange={(e) => setHarianBuyQty(e.target.value)}
                      placeholder="Contoh: 2 atau 500"
                      required
                    />
                  </div>
                </div>
                {harianPrice && harianBuyQty && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--accent-600)", fontWeight: 600 }}>
                    Perkiraan total belanja bahan ini: {formatIdr(
                      (parseInt(harianPrice.replace(/\D/g, ""), 10) || 0) * (parseFloat(harianBuyQty) || 0)
                    )}
                  </div>
                )}
              </div>
            )}

            {/* FORM 2 & 3: BAHAN MINGGUAN / BULANAN (Harga paket, isi paket, dan pemakaian per sekali masak) */}
            {(kind === "mingguan" || kind === "bulanan") && (
              <div style={{ background: "var(--bg-secondary)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)" }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Harga Beli 1 Paket (Rp)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={packagePrice}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, "");
                        setPackagePrice(clean ? parseInt(clean, 10).toLocaleString("id-ID") : "");
                      }}
                      placeholder="Contoh: 5.000"
                      required
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      Total uang yang dibayarkan saat membeli paket
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Isi dalam 1 Paket ({unit})</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      min="1"
                      value={packageContent}
                      onChange={(e) => setPackageContent(e.target.value)}
                      placeholder="Contoh: 15"
                      required
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      Misal: 15 siung, 500 gram, dll
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bahan Digunakan per Sekali Masak ({unit})</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      min="0.1"
                      value={usagePerCook}
                      onChange={(e) => setUsagePerCook(e.target.value)}
                      placeholder="Contoh: 3"
                      required
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      Misal: 3 siung setiap kali masak
                    </span>
                  </div>
                </div>

                {/* HITUNGAN OTOMATIS HARGA PER SEKALI MASAK */}
                {parsedPkgContent > 0 && parsedUsage > 0 && (
                  <div
                    style={{
                      marginTop: "var(--space-sm)",
                      padding: "10px",
                      background: "#ffffff",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--accent-200)",
                    }}
                  >
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                      Harga per 1 {unit}: <strong>{formatIdr(Math.round(unitPricePreview))}</strong>
                    </div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--accent-600)", fontWeight: 700, marginTop: 2 }}>
                      ⚡ Biaya Otomatis Sekali Masak ({parsedUsage} {unit}): {formatIdr(perCookPricePreview)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : "Simpan Bahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table of Ingredients */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">Inventaris Bahan</h2>
            <p className="card-subtitle">
              Daftar bahan harian, mingguan, dan bulanan beserta kalkulasi biaya sekali masak
            </p>
          </div>
          <span className="badge badge-accent">
            {filteredList ? `${filteredList.length} bahan` : "Memuat..."}
          </span>
        </div>

        {filteredList === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : filteredList.length > 0 ? (
          <div className="table-container" style={{ marginTop: "var(--space-md)" }}>
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Nama Bahan</th>
                  <th>Kategori</th>
                  <th>Skema Beli</th>
                  <th>Biaya Sekali Masak</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((ing) => {
                  const itemKind = ing.kind ?? "harian";
                  let buyScheme = "";
                  let perCookCalc = "Sesuai resep";

                  if (itemKind === "harian") {
                    buyScheme = ing.buyQuantity
                      ? `${formatIdr(ing.currentPriceIdr)} / ${ing.unit} (Beli: ${ing.buyQuantity} ${ing.unit})`
                      : `${formatIdr(ing.currentPriceIdr)} / ${ing.unit}`;
                  } else {
                    const pkgPrice = ing.packagePriceIdr ?? (ing.currentPriceIdr * (ing.packageContent ?? 1));
                    buyScheme = `Beli paket: ${formatIdr(pkgPrice)} (${ing.packageContent ?? "?"} ${ing.unit})`;
                    if (ing.usagePerCook) {
                      const costPerCook = Math.round(ing.currentPriceIdr * ing.usagePerCook);
                      perCookCalc = `${formatIdr(costPerCook)} (${ing.usagePerCook} ${ing.unit}/masak)`;
                    }
                  }

                  return (
                    <tr key={ing._id}>
                      <td>
                        <strong style={{ color: "var(--text-primary)" }}>{ing.name}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            itemKind === "harian"
                              ? "badge-accent"
                              : itemKind === "mingguan"
                              ? "badge-neutral"
                              : "badge-outline"
                          }`}
                          style={{ textTransform: "capitalize", fontSize: "11px" }}
                        >
                          {itemKind}
                        </span>
                      </td>
                      <td style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                        {buyScheme}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--accent-600)", fontSize: "var(--font-size-xs)" }}>
                        {perCookCalc}
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)" }}
                          onClick={() => promptDeleteIngredient(ing)}
                          title="Hapus bahan"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada bahan</div>
            <div className="empty-state-description">
              Tambahkan bahan harian, mingguan, atau bulanan dengan tombol &quot;+ Bahan Baru&quot;.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Daftar Belanja Tab (Fitur Generate Menu 7 Hari <= Rp 120.000 dengan Konfirmasi)
// ─────────────────────────────────────────────────────────────────────────────

function ShoppingTab({ onGoToMenu }: { onGoToMenu: () => void }) {
  const weekRange = getCurrentWeekRange();
  const todayKey = todayKeyLocal();

  // Generate Menu Modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [proposalSeed, setProposalSeed] = useState(1);
  const [previousAvoid, setPreviousAvoid] = useState<string | undefined>(undefined);
  const [isApplying, setIsApplying] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Active shopping list
  const shoppingList = useQuery(api.meals.getShoppingList, { weekKey: weekRange.weekKey });
  const checkItem = useMutation(api.meals.checkShoppingItem);

  // Proposal query (evaluated when modal is open)
  const proposal = useQuery(
    api.meals.proposeWeeklyMenu,
    showGenerateModal
      ? {
          startDate: todayKey,
          budgetIdr: WEEKLY_MENU_BUDGET_IDR, // 120.000
          seed: proposalSeed,
          avoid: previousAvoid,
        }
      : "skip"
  );

  const applyWeeklyMenu = useMutation(api.meals.applyWeeklyMenu);

  const handleOpenGenerate = () => {
    setProposalSeed(Date.now());
    setPreviousAvoid(undefined);
    setGenerateError(null);
    setShowGenerateModal(true);
  };

  const handleRerollMenu = () => {
    if (proposal && proposal.status === "ok") {
      setPreviousAvoid(proposal.signature);
    }
    setProposalSeed(Date.now() + Math.floor(Math.random() * 10000));
    setGenerateError(null);
  };

  const handleApproveMenu = async () => {
    if (!proposal || proposal.status !== "ok") return;

    setIsApplying(true);
    setGenerateError(null);
    try {
      await applyWeeklyMenu({
        startDate: todayKey,
        budgetIdr: WEEKLY_MENU_BUDGET_IDR,
        entries: proposal.days.map((d) => ({
          dateKeyLocal: d.dateKeyLocal,
          recipeId: d.recipeId,
        })),
      });

      setShowGenerateModal(false);
      // Pindah langsung ke tab Menu seperti yang diminta user!
      onGoToMenu();
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Gagal menyetujui menu");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">Daftar Belanja — {weekRange.weekKey}</h2>
            <p className="card-subtitle">
              Kebutuhan bahan belanja otomatis dari menu masakan minggu ini
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenGenerate}
          >
            ✨ Generate Menu 7 Hari (Maks. Rp 120.000)
          </button>
        </div>

        {/* Active Shopping List Table */}
        {shoppingList === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : shoppingList.items.length > 0 ? (
          <div className="table-container" style={{ marginTop: "var(--space-md)" }}>
            <table className="editorial-table">
              <thead>
                <tr>
                  <th style={{ width: 48, textAlign: "center" }}>Beli</th>
                  <th>Nama Bahan</th>
                  <th>Jumlah Dibutuhkan</th>
                  <th style={{ textAlign: "right" }}>Estimasi Biaya</th>
                </tr>
              </thead>
              <tbody>
                {shoppingList.items.map((item) => (
                  <tr
                    key={item._id}
                    className={item.checkedAt ? "voided" : ""}
                    onClick={() => checkItem({ id: item._id })}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className={`checkbox ${item.checkedAt ? "checked" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          checkItem({ id: item._id });
                        }}
                        style={{ display: "inline-block", verticalAlign: "middle" }}
                      >
                        {item.checkedAt && "✓"}
                      </button>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.ingredient?.name ?? "?"}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-accent">
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--accent-600)" }}>
                      {formatIdr(item.estimatedCostIdr)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>
                    Total Estimasi Belanja:
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 800,
                      fontSize: "var(--font-size-md)",
                      color: "var(--accent-600)",
                    }}
                  >
                    {formatIdr(shoppingList.totalEstimatedCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Daftar belanja masih kosong</div>
            <div className="empty-state-description">
              Klik tombol &quot;Generate Menu 7 Hari&quot; di atas untuk memilihkan menu seminggu dengan budget maksimal Rp 120.000.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "var(--space-md)" }}
              onClick={handleOpenGenerate}
            >
              ✨ Buat Rencana Menu Sekarang
            </button>
          </div>
        )}
      </div>

      {/* MODAL GENERATE MENU: KONFIRMASI MENU 7 HARI & TOTAL BELANJA */}
      {showGenerateModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="card-header" style={{ marginBottom: "var(--space-sm)" }}>
              <div>
                <h3 className="card-title">Rencana Menu 7 Hari</h3>
                <p className="card-subtitle">
                  Menu otomatis 1 hari 1 resep dengan batas maksimal belanja Rp 120.000 / minggu
                </p>
              </div>
              <span className="badge badge-accent">Maks. Rp 120.000</span>
            </div>

            {proposal === undefined ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <div className="skeleton skeleton-row" style={{ height: 40, marginBottom: 12 }} />
                <div className="skeleton skeleton-row" style={{ height: 40, marginBottom: 12 }} />
                <div className="skeleton skeleton-row" style={{ height: 40 }} />
                <p style={{ marginTop: 12, color: "var(--text-tertiary)", fontSize: "var(--font-size-xs)" }}>
                  Mengalkulasi kombinasi resep terbaik di bawah budget...
                </p>
              </div>
            ) : proposal.status === "no_recipes" ? (
              <div className="empty-state" style={{ padding: "var(--space-md)" }}>
                <div className="empty-state-title">Belum ada resep dengan bahan</div>
                <div className="empty-state-description">
                  Silakan buat beberapa resep dan hubungkan bahannya terlebih dahulu di tab &quot;Resep&quot;.
                </div>
              </div>
            ) : proposal.status === "over_budget" ? (
              <div className="form-error" style={{ margin: "var(--space-md) 0" }}>
                Biaya resep termurah yang tersedia ({formatIdr(proposal.minimumTotalIdr)}) melebihi batas budget mingguan Rp 120.000. Tambahkan resep yang lebih hemat atau sesuaikan takaran bahan.
              </div>
            ) : (
              <div>
                {/* 7 Days Menu Table */}
                <div className="table-container" style={{ margin: "var(--space-md) 0", maxHeight: 340, overflowY: "auto" }}>
                  <table className="editorial-table">
                    <thead>
                      <tr>
                        <th>Hari & Tanggal</th>
                        <th>Menu Resep</th>
                        <th>Porsi</th>
                        <th style={{ textAlign: "right" }}>Harga Masakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.days.map((day) => (
                        <tr key={day.dateKeyLocal}>
                          <td style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: "var(--font-size-xs)" }}>
                            {formatDateKeyLong(day.dateKeyLocal)}
                          </td>
                          <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            {day.recipeName}
                          </td>
                          <td>
                            <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                              {day.servings} porsi
                            </span>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-600)" }}>
                            {formatIdr(day.costIdr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Belanja Seminggu (DITAMPILKAN DI BAWAH) */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: "var(--accent-50)",
                    border: "1px solid var(--accent-100)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "var(--space-md)",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", display: "block" }}>
                      TOTAL SEMUA BELANJA PER MINGGU:
                    </span>
                    <strong style={{ fontSize: "18px", color: "var(--accent-600)" }}>
                      {formatIdr(proposal.totalIdr)}
                    </strong>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", marginLeft: 8 }}>
                      (Sisa budget: {formatIdr(proposal.remainingIdr)})
                    </span>
                  </div>
                  <span className="badge badge-accent">
                    ✓ Di bawah Rp 120.000
                  </span>
                </div>

                {generateError && <div className="form-error" style={{ marginBottom: "var(--space-md)" }}>{generateError}</div>}

                {/* ACTION BUTTONS: SETUJU ATAU GANTI MENU */}
                <div className="modal-actions" style={{ justifyContent: "space-between", gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowGenerateModal(false)}
                    disabled={isApplying}
                  >
                    Batal
                  </button>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleRerollMenu}
                      disabled={isApplying}
                    >
                      🔄 Ganti Menu
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleApproveMenu}
                      disabled={isApplying}
                    >
                      {isApplying ? "Menyetujui..." : "✓ Setuju & Masuk ke Menu"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Menu Tab (Final menu selama seminggu, posisi paling kanan, tanpa tombol tambah menu)
// ─────────────────────────────────────────────────────────────────────────────

function MealPlanTab({
  openConfirm,
}: {
  openConfirm: (opts: {
    title: string;
    message: string;
    actionText?: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}) {
  const weekRange = getCurrentWeekRange();
  const weekDates = getWeekDates(weekRange.start);
  const todayKey = todayKeyLocal();

  const [selectedDate, setSelectedDate] = useState(todayKey);

  const mealPlans = useQuery(api.meals.getMealPlanRange, {
    startDate: weekDates[0],
    endDate: weekDates[6],
  });
  const removeMealPlan = useMutation(api.meals.removeMealPlan);

  const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  const promptRemoveMeal = (mp: { _id: Id<"mealPlans">; recipeName: string }) => {
    openConfirm({
      title: "Hapus Menu",
      message: `Hapus resep "${mp.recipeName}" dari jadwal tanggal ini?`,
      actionText: "Hapus Menu",
      isDanger: true,
      onConfirm: async () => {
        await removeMealPlan({ id: mp._id });
      },
    });
  };

  const dayPlans = mealPlans?.filter((mp) => mp.dateKeyLocal === selectedDate) ?? [];
  const totalCost = dayPlans.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0);
  const totalWeekCost = mealPlans?.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0) ?? 0;

  return (
    <div>
      {/* Week Calendar */}
      <div className="menu-calendar">
        {weekDates.map((date, i) => {
          const isToday = date === todayKey;
          const isSelected = date === selectedDate;
          const count = mealPlans?.filter((mp) => mp.dateKeyLocal === date).length ?? 0;

          return (
            <button
              key={date}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedDate(date)}
              className={isSelected ? "active-calendar-day" : ""}
            >
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {dayNames[i]} {isToday && "•"}
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: isSelected ? "var(--accent-600)" : "var(--text-primary)",
                }}
              >
                {date.split("-")[2]}
              </div>
              {count > 0 && (
                <span className="calendar-count">
                  {count} menu
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Final Menu Table (BUTTON TAMBAH MENU DIHAPUS SESUAI PERMINTAAN USER) */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">
              Menu {selectedDate === todayKey ? "Hari Ini" : formatDateKeyLong(selectedDate)}
            </h2>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: 2 }}>
              Menu final seminggu ke depan • Total belanja seminggu: {formatIdr(totalWeekCost)}
            </div>
          </div>
          <span className="badge badge-accent">
            {dayPlans.length} menu dijadwalkan
          </span>
        </div>

        {mealPlans === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : dayPlans.length > 0 ? (
          <div className="table-container" style={{ marginTop: "var(--space-md)" }}>
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Menu Resep</th>
                  <th>Porsi</th>
                  <th>Estimasi Biaya</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {dayPlans.map((mp) => (
                  <tr key={mp._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {mp.recipe?.name ?? "Resep telah dihapus"}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-accent">
                        {mp.servings} porsi
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--accent-600)" }}>
                      {formatIdr(mp.estimatedCostIdr)}
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--error)" }}
                        onClick={() =>
                          promptRemoveMeal({
                            _id: mp._id,
                            recipeName: mp.recipe?.name ?? "menu",
                          })
                        }
                        title="Hapus dari jadwal"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>
                    Total Estimasi Hari Ini:
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--accent-600)", whiteSpace: "nowrap" }}>
                    {formatIdr(totalCost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada menu untuk hari ini</div>
            <div className="empty-state-description">
              Kamu bisa membuat menu otomatis 7 hari dari tab <strong>Daftar Belanja</strong> melalui tombol &quot;Generate Menu 7 Hari&quot;.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
