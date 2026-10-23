"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatIdr, todayKeyLocal, getCurrentWeekRange, getWeekDates } from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "../components/ConfirmModal";

type ActiveTab = "recipes" | "ingredients" | "mealplan" | "shopping";

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
          <p className="section-subtitle">Resep, bahan, rencana menu mingguan, dan daftar belanja</p>
        </div>
      </div>

      <div className="menu-tabs">
        {([
          { key: "recipes", label: "Resep" },
          { key: "ingredients", label: "Bahan" },
          { key: "mealplan", label: "Rencana Menu" },
          { key: "shopping", label: "Daftar Belanja" },
        ] as { key: ActiveTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "recipes" && <RecipesTab openConfirm={openConfirm} />}
      {activeTab === "ingredients" && <IngredientsTab openConfirm={openConfirm} />}
      {activeTab === "mealplan" && <MealPlanTab openConfirm={openConfirm} />}
      {activeTab === "shopping" && <ShoppingTab />}

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

// ─── 1. Recipes Tab ─────────────────────────────────────────────────────

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
  const [servings, setServings] = useState("1");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedRecipeId, setExpandedRecipeId] = useState<Id<"recipes"> | null>(null);

  const recipes = useQuery(api.meals.listRecipes, {});
  const createRecipe = useMutation(api.meals.createRecipe);
  const removeRecipe = useMutation(api.meals.removeRecipe);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createRecipe({
        name,
        servings: parseInt(servings, 10),
        instructions: instructions || undefined,
      });
      setShowForm(false);
      setName("");
      setServings("1");
      setInstructions("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promptDeleteRecipe = (recipe: { _id: Id<"recipes">; name: string }) => {
    openConfirm({
      title: "Hapus Resep",
      message: `Apakah Anda yakin ingin menghapus resep "${recipe.name}"? Bahan dan jadwal menu terkait resep ini juga akan dibersihkan.`,
      actionText: "Hapus Resep",
      isDanger: true,
      onConfirm: async () => {
        await removeRecipe({ id: recipe._id });
        if (expandedRecipeId === recipe._id) {
          setExpandedRecipeId(null);
        }
      },
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-md)" }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Batal" : "+ Resep Baru"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-md)" }}>Tambah Resep Baru</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nama Resep</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Nasi Goreng Spesial"
                required
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
              <label className="form-label">Instruksi Memasak (opsional)</label>
              <textarea
                className="form-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Langkah-langkah memasak..."
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

      {/* Recipes Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Daftar Resep</h2>
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
          <div className="table-container">
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Nama Resep</th>
                  <th>Porsi</th>
                  <th>Instruksi / Catatan</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const isExpanded = expandedRecipeId === recipe._id;
                  return (
                    <RecipeRow
                      key={recipe._id}
                      recipe={recipe}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedRecipeId(isExpanded ? null : recipe._id)}
                      onDelete={() => promptDeleteRecipe(recipe)}
                      openConfirm={openConfirm}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada resep</div>
            <div className="empty-state-description">Tambahkan resep pertamamu dengan tombol &quot;+ Resep Baru&quot;.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeRow({
  recipe,
  isExpanded,
  onToggle,
  onDelete,
  openConfirm,
}: {
  recipe: { _id: Id<"recipes">; name: string; servings: number; instructions?: string };
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  openConfirm: (opts: {
    title: string;
    message: string;
    actionText?: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}) {
  const detail = useQuery(
    api.meals.getRecipeWithIngredients,
    isExpanded ? { recipeId: recipe._id } : "skip"
  );
  const removeRecipeIngredient = useMutation(api.meals.removeRecipeIngredient);

  const promptRemoveIngredient = (riId: Id<"recipeIngredients">, ingredientName: string) => {
    openConfirm({
      title: "Hapus Bahan dari Resep",
      message: `Hapus bahan "${ingredientName}" dari resep ${recipe.name}?`,
      actionText: "Hapus Bahan",
      isDanger: true,
      onConfirm: async () => {
        await removeRecipeIngredient({ id: riId });
      },
    });
  };

  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {recipe.name}
          </div>
          {detail && (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--accent-600)", fontWeight: 600, marginTop: 2 }}>
              Estimasi: {formatIdr(detail.estimatedCostIdr)} ({formatIdr(detail.costPerServing)}/porsi)
            </div>
          )}
        </td>
        <td>
          <span className="badge badge-accent">
            {recipe.servings} porsi
          </span>
        </td>
        <td style={{ color: "var(--text-secondary)", maxWidth: 320 }}>
          {recipe.instructions ? (
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {recipe.instructions}
            </div>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          )}
        </td>
        <td className="col-actions">
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onToggle}
            >
              {isExpanded ? "Tutup Bahan" : "Lihat Bahan"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--error)" }}
              onClick={onDelete}
              title="Hapus resep"
            >
              Hapus
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4} style={{ background: "var(--accent-50)", padding: "var(--space-md) var(--space-lg)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              {recipe.instructions && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>
                  <strong>Instruksi:</strong> {recipe.instructions}
                </div>
              )}
              <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                Daftar Bahan:
              </div>
              {detail === undefined ? (
                <div className="skeleton skeleton-row" style={{ height: 28 }} />
              ) : detail && detail.ingredients.length > 0 ? (
                <div style={{ background: "#ffffff", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-xs)" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-light)", color: "var(--text-tertiary)", textAlign: "left" }}>
                        <th style={{ padding: "6px 12px" }}>Bahan</th>
                        <th style={{ padding: "6px 12px" }}>Takaran</th>
                        <th style={{ padding: "6px 12px" }}>Perkiraan Biaya</th>
                        <th style={{ padding: "6px 12px", textAlign: "right" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ingredients.map((ri) => (
                        <tr key={ri._id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td style={{ padding: "6px 12px", fontWeight: 500 }}>{ri.ingredient?.name ?? "?"}</td>
                          <td style={{ padding: "6px 12px" }}>{ri.quantity} {ri.unit}</td>
                          <td style={{ padding: "6px 12px", color: "var(--accent-600)" }}>
                            {ri.ingredient ? formatIdr(Math.round(ri.quantity * ri.ingredient.currentPriceIdr)) : "-"}
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--error)", padding: "2px 6px", fontSize: 11 }}
                              onClick={() => promptRemoveIngredient(ri._id, ri.ingredient?.name ?? "bahan")}
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                  Belum ada bahan yang dihubungkan ke resep ini. Hubungkan melalui tab &quot;Bahan&quot;.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── 2. Ingredients Tab ─────────────────────────────────────────────────

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
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("gram");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [linkRecipeId, setLinkRecipeId] = useState<Id<"recipes"> | "">("");
  const [linkIngredientId, setLinkIngredientId] = useState<Id<"ingredients"> | "">("");
  const [linkQuantity, setLinkQuantity] = useState("");
  const [linkUnit, setLinkUnit] = useState("gram");
  const [showLinkForm, setShowLinkForm] = useState(false);

  const ingredients = useQuery(api.meals.listIngredients);
  const recipes = useQuery(api.meals.listRecipes, {});
  const createIngredient = useMutation(api.meals.createIngredient);
  const removeIngredient = useMutation(api.meals.removeIngredient);
  const addRecipeIngredient = useMutation(api.meals.addRecipeIngredient);

  const UNITS = ["gram", "kg", "ml", "liter", "buah", "bungkus", "lembar", "butir", "sdm", "sdt", "siung"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createIngredient({
        name,
        unit,
        currentPriceIdr: parseInt(price, 10),
      });
      setShowForm(false);
      setName("");
      setPrice("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!linkRecipeId || !linkIngredientId) return;

    try {
      await addRecipeIngredient({
        recipeId: linkRecipeId as Id<"recipes">,
        ingredientId: linkIngredientId as Id<"ingredients">,
        quantity: parseFloat(linkQuantity),
        unit: linkUnit,
      });
      setShowLinkForm(false);
      setLinkQuantity("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const promptDeleteIngredient = (ing: { _id: Id<"ingredients">; name: string }) => {
    openConfirm({
      title: "Hapus Bahan",
      message: `Apakah Anda yakin ingin menghapus bahan "${ing.name}"? Bahan ini juga akan dilepas dari resep terkait.`,
      actionText: "Hapus Bahan",
      isDanger: true,
      onConfirm: async () => {
        await removeIngredient({ id: ing._id });
      },
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setShowLinkForm(!showLinkForm);
            setShowForm(false);
          }}
        >
          {showLinkForm ? "Batal Hubung" : "Hubungkan ke Resep"}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowForm(!showForm);
            setShowLinkForm(false);
          }}
        >
          {showForm ? "Batal" : "+ Bahan Baru"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-md)" }}>Tambah Bahan Baru</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nama Bahan</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Beras Ramos"
                  required
                />
              </div>
              <div className="form-group">
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
            <div className="form-group">
              <label className="form-label">Harga per satuan (Rp)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="15000"
                required
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
                {isSubmitting ? "Menyimpan..." : "Simpan Bahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showLinkForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <h2 className="card-title" style={{ marginBottom: "var(--space-md)" }}>Hubungkan Bahan ke Resep</h2>
          <form onSubmit={handleLink}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Pilih Resep</label>
                <select
                  className="form-select"
                  value={linkRecipeId}
                  onChange={(e) => setLinkRecipeId(e.target.value as Id<"recipes">)}
                  required
                >
                  <option value="">Pilih resep tujuan...</option>
                  {recipes?.map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Pilih Bahan</label>
                <select
                  className="form-select"
                  value={linkIngredientId}
                  onChange={(e) => {
                    const ingId = e.target.value as Id<"ingredients">;
                    setLinkIngredientId(ingId);
                    const found = ingredients?.find((i) => i._id === ingId);
                    if (found) setLinkUnit(found.unit);
                  }}
                  required
                >
                  <option value="">Pilih bahan...</option>
                  {ingredients?.map((i) => (
                    <option key={i._id} value={i._id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Takaran / Jumlah</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={linkQuantity}
                  onChange={(e) => setLinkQuantity(e.target.value)}
                  placeholder="Contoh: 250"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Satuan</label>
                <select
                  className="form-select"
                  value={linkUnit}
                  onChange={(e) => setLinkUnit(e.target.value)}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLinkForm(false)}
              >
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Hubungkan Bahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ingredients Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Daftar Bahan Makanan</h2>
          <span className="badge badge-accent">
            {ingredients ? `${ingredients.length} bahan` : "Memuat..."}
          </span>
        </div>

        {ingredients === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : ingredients.length > 0 ? (
          <div className="table-container">
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Nama Bahan</th>
                  <th>Satuan Dasar</th>
                  <th>Harga Terkini</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing) => (
                  <tr key={ing._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {ing.name}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-accent">
                        {ing.unit}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--accent-600)" }}>
                      {formatIdr(ing.currentPriceIdr)} / {ing.unit}
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
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada bahan</div>
            <div className="empty-state-description">Tambahkan bahan untuk memulai perencanaan menu.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3. Meal Plan Tab ───────────────────────────────────────────────────

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<Id<"recipes"> | "">("");
  const [selectedServings, setSelectedServings] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recipes = useQuery(api.meals.listRecipes, {});
  const mealPlans = useQuery(api.meals.getMealPlanRange, {
    startDate: weekDates[0],
    endDate: weekDates[6],
  });
  const addMealPlan = useMutation(api.meals.addMealPlan);
  const removeMealPlan = useMutation(api.meals.removeMealPlan);

  const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedRecipeId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addMealPlan({
        dateKeyLocal: selectedDate,
        recipeId: selectedRecipeId as Id<"recipes">,
        servings: parseInt(selectedServings, 10),
      });
      setShowAddForm(false);
      setSelectedRecipeId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promptRemoveMeal = (mp: { _id: Id<"mealPlans">; recipeName: string }) => {
    openConfirm({
      title: "Hapus Rencana Menu",
      message: `Hapus resep "${mp.recipeName}" dari rencana menu tanggal ini?`,
      actionText: "Hapus Menu",
      isDanger: true,
      onConfirm: async () => {
        await removeMealPlan({ id: mp._id });
      },
    });
  };

  const dayPlans = mealPlans?.filter((mp) => mp.dateKeyLocal === selectedDate) ?? [];
  const totalCost = dayPlans.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0);

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
              <div style={{ fontSize: "16px", fontWeight: 700, color: isSelected ? "var(--accent-600)" : "var(--text-primary)" }}>
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

      {/* Selected Day Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">
              Menu {selectedDate === todayKey ? "Hari Ini" : selectedDate}
            </h2>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: 2 }}>
              {dayPlans.length} resep dijadwalkan
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Batal" : "+ Tambah Menu"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAdd}
            style={{
              margin: "var(--space-md) 0",
              padding: "var(--space-md)",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Pilih Resep</label>
                <select
                  className="form-select"
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value as Id<"recipes">)}
                  required
                >
                  <option value="">Pilih resep...</option>
                  {recipes?.map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Porsi yang Dimasak</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={selectedServings}
                  onChange={(e) => setSelectedServings(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAddForm(false)}
              >
                Batal
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
                {isSubmitting ? "Menambahkan..." : "Tambah ke Menu"}
              </button>
            </div>
          </form>
        )}

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
                        onClick={() => promptRemoveMeal({ _id: mp._id, recipeName: mp.recipe?.name ?? "menu" })}
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
                  <td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>Total Estimasi Hari Ini:</td>
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
            <div className="empty-state-description">Tambahkan resep ke rencana menu hari ini.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 4. Shopping Tab ────────────────────────────────────────────────────

function ShoppingTab() {
  const weekRange = getCurrentWeekRange();
  const weekDates = getWeekDates(weekRange.start);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const shoppingList = useQuery(api.meals.getShoppingList, { weekKey: weekRange.weekKey });
  const generateList = useMutation(api.meals.generateShoppingList);
  const checkItem = useMutation(api.meals.checkShoppingItem);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    try {
      await generateList({
        startDate: weekDates[0],
        endDate: weekDates[6],
        weekKey: weekRange.weekKey,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="card-title">Daftar Belanja — {weekRange.weekKey}</h2>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: 2 }}>
              Dihitung otomatis dari seluruh menu mingguan
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "Menghitung..." : "Generate dari Menu"}
          </button>
        </div>

        {error && <div className="form-error" style={{ margin: "var(--space-md) 0" }}>{error}</div>}

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
                  <td style={{ textAlign: "right", fontWeight: 800, fontSize: "var(--font-size-md)", color: "var(--accent-600)" }}>
                    {formatIdr(shoppingList.totalEstimatedCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Daftar belanja kosong</div>
            <div className="empty-state-description">
              Tambahkan menu di rencana minggu ini, lalu klik &quot;Generate dari Menu&quot; untuk membuat daftar belanja otomatis.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
