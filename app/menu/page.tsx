"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  formatIdr,
  todayKeyLocal,
  getCurrentWeekRange,
  getWeekDates,
  formatDateKeyLong,
} from "../lib/utils";
import { useCallback, useRef, useState } from "react";
import { ActionIcon } from "../components/ActionIcon";
import { useQuickCreate, useUrlTab } from "../components/useNavigationActions";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "../components/ConfirmModal";
import { RecipeIngredientCatalog } from "./RecipeIngredientCatalog";
import { NewRecipeForm } from "./NewRecipeForm";
import { ShoppingTab } from "./ShoppingTab";

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
  const [activeTab, setActiveTab] = useUrlTab<ActiveTab>(["recipes", "ingredients", "shopping", "mealplan"], "recipes");

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
        <ShoppingTab />
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
  useQuickCreate(useCallback(() => setShowForm(true), []));
  // Manage ingredients modal
  const [manageRecipe, setManageRecipe] = useState<{
    _id: Id<"recipes">;
    name: string;
  } | null>(null);
  // Instruction collapse state per recipe
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});

  const recipes = useQuery(api.meals.listRecipes, {});
  const allIngredients = useQuery(api.meals.listIngredients);
  const removeRecipe = useMutation(api.meals.removeRecipe);
  const removeRecipeIngredient = useMutation(api.meals.removeRecipeIngredient);

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => ({ ...prev, [id]: !prev[id] }));
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
          onClick={() => setShowForm(true)}
          disabled={showForm}
        >
          + Resep Baru
        </button>
      </div>

      {showForm && <NewRecipeForm ingredients={allIngredients} onSaved={() => setShowForm(false)} onCancel={() => setShowForm(false)} />}

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

      {manageRecipe && (
        <RecipeIngredientCatalog
          key={manageRecipe._id}
          recipe={manageRecipe}
          lines={recipeWithDetail?.ingredients}
          ingredients={allIngredients}
          onClose={() => setManageRecipe(null)}
          onRemove={promptRemoveIngredient}
        />
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
  const [editingId, setEditingId] = useState<Id<"ingredients"> | null>(null);
  const ingredientFormRef = useRef<HTMLDivElement>(null);
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
  const updateIngredient = useMutation(api.meals.updateIngredient);
  const removeIngredient = useMutation(api.meals.removeIngredient);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setUnit(kind === "harian" ? "ekor" : "siung");
    setHarianPrice("");
    setHarianBuyQty("");
    setPackagePrice("");
    setPackageContent("");
    setUsagePerCook("");
    setError(null);
  };

  const openFormWithKind = useCallback((k: IngredientKind) => {
    setEditingId(null);
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
  }, []);

  useQuickCreate(useCallback(() => openFormWithKind("harian"), [openFormWithKind]));

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

        const values = {
          name: trimmedName,
          unit,
          kind: "harian",
          currentPriceIdr: price,
          buyQuantity: buyQty,
        } as const;
        if (editingId) await updateIngredient({ id: editingId, ...values, buyQuantity: buyQty ?? null });
        else await createIngredient(values);
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

        const values = {
          name: trimmedName,
          unit,
          kind,
          packagePriceIdr: pkgPrice,
          packageContent: pkgContent,
          usagePerCook: cookUsage,
        };
        if (editingId) await updateIngredient({ id: editingId, ...values });
        else await createIngredient(values);
      }

      setShowForm(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditIngredient = (ing: NonNullable<typeof ingredients>[number]) => {
    setEditingId(ing._id);
    setKind(ing.kind ?? "harian");
    setName(ing.name);
    setUnit(ing.unit);
    setHarianPrice((ing.kind ?? "harian") === "harian" ? ing.currentPriceIdr.toLocaleString("id-ID") : "");
    setHarianBuyQty(ing.buyQuantity?.toString() ?? "");
    setPackagePrice(ing.packagePriceIdr?.toLocaleString("id-ID") ?? "");
    setPackageContent(ing.packageContent?.toString() ?? "");
    setUsagePerCook(ing.usagePerCook?.toString() ?? "");
    setError(null);
    setShowForm(true);
    window.requestAnimationFrame(() => {
      ingredientFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      ingredientFormRef.current?.querySelector("input")?.focus({ preventScroll: true });
    });
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
        <div ref={ingredientFormRef} className="card ingredient-editor" style={{ marginBottom: "var(--space-lg)", border: "2px solid var(--accent-500)", scrollMarginTop: 90 }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-xs)" }}>
            {editingId ? "Edit Bahan" : "Tambah Bahan Baru"}
          </h2>
          <p className="card-subtitle" style={{ marginBottom: "var(--space-md)" }}>
            {editingId ? "Perbarui data bahan. Bahan yang sama tetap terhubung ke resep dan daftar belanja." : "Pilih frekuensi pembelian terlebih dahulu untuk menampilkan formulir yang sesuai"}
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
                      required={!editingId}
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
                      background: "var(--bg-card)",
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
                {isSubmitting ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Bahan"}
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
                        <div className="ingredient-actions">
                          <ActionIcon action="edit" label={`Edit bahan ${ing.name}`} onClick={() => openEditIngredient(ing)} />
                          <ActionIcon action="delete" label={`Hapus bahan ${ing.name}`} onClick={() => promptDeleteIngredient(ing)} />
                        </div>
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
  const activeShopping = useQuery(api.meals.getActiveShoppingList, {});
  const weekDates = getWeekDates(activeShopping?.startDate ? new Date(`${activeShopping.startDate}T00:00:00+07:00`).getTime() : weekRange.start);
  const todayKey = todayKeyLocal();

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const activeDate = weekDates.includes(selectedDate) ? selectedDate : weekDates[0];

  const mealPlans = useQuery(api.meals.getMealPlanRange, {
    startDate: weekDates[0],
    endDate: weekDates[6],
  });
  const removeMealPlan = useMutation(api.meals.removeMealPlan);


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

  const dayPlans = mealPlans?.filter((mp) => mp.dateKeyLocal === activeDate) ?? [];
  const totalCost = dayPlans.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0);
  const totalWeekCost = mealPlans?.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0) ?? 0;

  return (
    <div>
      {/* Week Calendar */}
      <div className="menu-calendar">
        {weekDates.map((date) => {
          const isToday = date === todayKey;
          const isSelected = date === activeDate;
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
                {new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }).format(new Date(`${date}T12:00:00+07:00`))} {isToday && "•"}
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
              Menu {activeDate === todayKey ? "Hari Ini" : formatDateKeyLong(activeDate)}
            </h2>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: 2 }}>
              Menu final seminggu ke depan • Total belanja seminggu: {formatIdr(activeShopping?.totalEstimatedCost ?? totalWeekCost)}
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
