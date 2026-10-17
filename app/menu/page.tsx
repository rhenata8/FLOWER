"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatIdr, todayKeyLocal, getCurrentWeekRange, getWeekDates } from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type ActiveTab = "recipes" | "ingredients" | "mealplan" | "shopping";

export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("recipes");

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Menu & Belanja</h1>
          <p className="section-subtitle">Resep, bahan, rencana menu, dan daftar belanja</p>
        </div>
      </div>

      <div className="tabs">
        {([
          { key: "recipes", label: "🍳 Resep" },
          { key: "ingredients", label: "🥕 Bahan" },
          { key: "mealplan", label: "📅 Rencana Menu" },
          { key: "shopping", label: "🛒 Belanja" },
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

      {activeTab === "recipes" && <RecipesTab />}
      {activeTab === "ingredients" && <IngredientsTab />}
      {activeTab === "mealplan" && <MealPlanTab />}
      {activeTab === "shopping" && <ShoppingTab />}
    </div>
  );
}

// ─── Recipes Tab ───────────────────────────────────────────────────────

function RecipesTab() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recipes = useQuery(api.meals.listRecipes, {});
  const createRecipe = useMutation(api.meals.createRecipe);
  const archiveRecipe = useMutation(api.meals.archiveRecipe);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      setError(err instanceof Error ? err.message : "Error");
    }
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
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nama Resep</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nasi Goreng" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Porsi</label>
                <input className="form-input" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Instruksi (opsional)</label>
              <textarea className="form-textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Langkah-langkah memasak..." />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary">Simpan Resep</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {recipes && recipes.length > 0 ? (
          recipes.map((recipe) => (
            <RecipeItem key={recipe._id} recipe={recipe} onArchive={() => archiveRecipe({ id: recipe._id })} />
          ))
        ) : recipes ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍳</div>
            <div className="empty-state-title">Belum ada resep</div>
            <div className="empty-state-description">Tambahkan resep pertamamu!</div>
          </div>
        ) : (
          <LoadingSkeleton />
        )}
      </div>
    </div>
  );
}

function RecipeItem({ recipe, onArchive }: { recipe: { _id: Id<"recipes">; name: string; servings: number; instructions?: string }; onArchive: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const detail = useQuery(
    api.meals.getRecipeWithIngredients,
    showDetail ? { recipeId: recipe._id } : "skip"
  );

  return (
    <div>
      <div className="list-item" onClick={() => setShowDetail(!showDetail)} style={{ cursor: "pointer" }}>
        <div className="list-item-icon" style={{ background: "var(--accent-50)", color: "var(--accent-600)" }}>
          🍳
        </div>
        <div className="list-item-content">
          <div className="list-item-title">{recipe.name}</div>
          <div className="list-item-subtitle">{recipe.servings} porsi</div>
        </div>
        <div className="list-item-right" style={{ display: "flex", gap: "var(--space-xs)", alignItems: "center" }}>
          {detail && <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--accent-600)" }}>{formatIdr(detail.estimatedCostIdr)}</span>}
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onArchive(); }} title="Arsipkan">🗑️</button>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{showDetail ? "▲" : "▼"}</span>
        </div>
      </div>
      {showDetail && detail && (
        <div style={{ padding: "0 var(--space-lg) var(--space-md)", fontSize: "var(--font-size-sm)" }}>
          {detail.instructions && <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>{detail.instructions}</p>}
          {detail.ingredients.length > 0 ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: "var(--space-xs)" }}>Bahan:</div>
              {detail.ingredients.map((ri) => (
                <div key={ri._id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "var(--text-secondary)" }}>
                  <span>{ri.ingredient?.name ?? "?"} — {ri.quantity} {ri.unit}</span>
                  <span>{ri.ingredient ? formatIdr(Math.round(ri.quantity * ri.ingredient.currentPriceIdr)) : "-"}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: "var(--space-sm)", borderTop: "1px solid var(--border-light)", paddingTop: "var(--space-xs)" }}>
                <span>Total ({detail.servings} porsi)</span>
                <span>{formatIdr(detail.estimatedCostIdr)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)" }}>
                <span>Per porsi</span>
                <span>{formatIdr(detail.costPerServing)}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>Belum ada bahan. Tambahkan bahan di tab Bahan.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ingredients Tab ───────────────────────────────────────────────────

function IngredientsTab() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("gram");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Recipe ingredient linking
  const [linkRecipeId, setLinkRecipeId] = useState<Id<"recipes"> | "">("");
  const [linkIngredientId, setLinkIngredientId] = useState<Id<"ingredients"> | "">("");
  const [linkQuantity, setLinkQuantity] = useState("");
  const [linkUnit, setLinkUnit] = useState("gram");
  const [showLinkForm, setShowLinkForm] = useState(false);

  const ingredients = useQuery(api.meals.listIngredients);
  const recipes = useQuery(api.meals.listRecipes, {});
  const createIngredient = useMutation(api.meals.createIngredient);
  const addRecipeIngredient = useMutation(api.meals.addRecipeIngredient);

  const UNITS = ["gram", "kg", "ml", "liter", "buah", "bungkus", "lembar", "butir", "sdm", "sdt", "siung"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      setError(err instanceof Error ? err.message : "Error");
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
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <button className="btn btn-secondary" onClick={() => { setShowLinkForm(!showLinkForm); setShowForm(false); }}>
          🔗 Hubungkan ke Resep
        </button>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowLinkForm(false); }}>
          {showForm ? "Batal" : "+ Bahan Baru"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nama Bahan</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Beras" required />
              </div>
              <div className="form-group">
                <label className="form-label">Satuan</label>
                <select className="form-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Harga per satuan (Rp)</label>
              <input className="form-input" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15000" required />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {showLinkForm && (
        <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
          <h3 className="card-title" style={{ marginBottom: "var(--space-md)" }}>Hubungkan Bahan ke Resep</h3>
          <form onSubmit={handleLink}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Resep</label>
                <select className="form-select" value={linkRecipeId} onChange={(e) => setLinkRecipeId(e.target.value as Id<"recipes">)} required>
                  <option value="">Pilih resep...</option>
                  {recipes?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Bahan</label>
                <select className="form-select" value={linkIngredientId} onChange={(e) => setLinkIngredientId(e.target.value as Id<"ingredients">)} required>
                  <option value="">Pilih bahan...</option>
                  {ingredients?.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Jumlah</label>
                <input className="form-input" type="number" step="0.01" min="0.01" value={linkQuantity} onChange={(e) => setLinkQuantity(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Satuan</label>
                <select className="form-select" value={linkUnit} onChange={(e) => setLinkUnit(e.target.value)}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary">Hubungkan</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {ingredients && ingredients.length > 0 ? (
          ingredients.map((ing) => (
            <div key={ing._id} className="list-item">
              <div className="list-item-icon" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                🥕
              </div>
              <div className="list-item-content">
                <div className="list-item-title">{ing.name}</div>
                <div className="list-item-subtitle">{ing.unit}</div>
              </div>
              <div className="list-item-right">
                <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                  {formatIdr(ing.currentPriceIdr)}/{ing.unit}
                </div>
              </div>
            </div>
          ))
        ) : ingredients ? (
          <div className="empty-state">
            <div className="empty-state-icon">🥕</div>
            <div className="empty-state-title">Belum ada bahan</div>
            <div className="empty-state-description">Tambahkan bahan untuk memulai perencanaan menu.</div>
          </div>
        ) : (
          <LoadingSkeleton />
        )}
      </div>
    </div>
  );
}

// ─── Meal Plan Tab ─────────────────────────────────────────────────────

function MealPlanTab() {
  const weekRange = getCurrentWeekRange();
  const weekDates = getWeekDates(weekRange.start);
  const todayKey = todayKeyLocal();

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<Id<"recipes"> | "">("");
  const [selectedServings, setSelectedServings] = useState("1");
  const [error, setError] = useState<string | null>(null);

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
    if (!selectedRecipeId) return;
    try {
      await addMealPlan({
        dateKeyLocal: selectedDate,
        recipeId: selectedRecipeId as Id<"recipes">,
        servings: parseInt(selectedServings, 10),
      });
      setShowAddForm(false);
      setSelectedRecipeId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div>
      {/* Week Calendar */}
      <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-lg)", overflowX: "auto" }}>
        {weekDates.map((date, i) => {
          const isToday = date === todayKey;
          const isSelected = date === selectedDate;
          const dayPlans = mealPlans?.filter((mp) => mp.dateKeyLocal === date) ?? [];

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              style={{
                flex: "1 0 auto",
                minWidth: 56,
                padding: "var(--space-sm)",
                borderRadius: "var(--radius-md)",
                border: isSelected ? "2px solid var(--accent-500)" : "1px solid var(--border-light)",
                background: isSelected ? "var(--accent-50)" : isToday ? "var(--bg-secondary)" : "var(--bg-card)",
                cursor: "pointer",
                textAlign: "center",
                fontFamily: "var(--font-family)",
                transition: "all var(--transition-fast)",
              }}
            >
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {dayNames[i]}
              </div>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: isSelected ? "var(--accent-600)" : "var(--text-primary)" }}>
                {date.split("-")[2]}
              </div>
              {dayPlans.length > 0 && (
                <div style={{ fontSize: 8, color: "var(--accent-500)", marginTop: 2 }}>
                  {"●".repeat(Math.min(dayPlans.length, 3))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            Menu {selectedDate === todayKey ? "Hari Ini" : selectedDate}
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            + Tambah Menu
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAdd} style={{ marginBottom: "var(--space-md)", padding: "var(--space-md)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Resep</label>
                <select className="form-select" value={selectedRecipeId} onChange={(e) => setSelectedRecipeId(e.target.value as Id<"recipes">)} required>
                  <option value="">Pilih resep...</option>
                  {recipes?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Porsi</label>
                <input className="form-input" type="number" min="1" value={selectedServings} onChange={(e) => setSelectedServings(e.target.value)} required />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-sm">Tambah</button>
          </form>
        )}

        {(() => {
          const dayPlans = mealPlans?.filter((mp) => mp.dateKeyLocal === selectedDate) ?? [];
          const totalCost = dayPlans.reduce((sum, mp) => sum + mp.estimatedCostIdr, 0);

          if (dayPlans.length > 0) {
            return (
              <>
                {dayPlans.map((mp) => (
                  <div key={mp._id} className="list-item">
                    <div className="list-item-icon" style={{ background: "var(--accent-50)", color: "var(--accent-600)" }}>🍽️</div>
                    <div className="list-item-content">
                      <div className="list-item-title">{mp.recipe?.name ?? "Resep dihapus"}</div>
                      <div className="list-item-subtitle">{mp.servings} porsi</div>
                    </div>
                    <div className="list-item-right" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--accent-600)" }}>
                        {formatIdr(mp.estimatedCostIdr)}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeMealPlan({ id: mp._id })}>🗑️</button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "var(--space-md)", textAlign: "right", fontWeight: 600, color: "var(--accent-600)" }}>
                  Estimasi total: {formatIdr(totalCost)}
                </div>
              </>
            );
          }

          return mealPlans ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <div className="empty-state-title">Belum ada menu untuk hari ini</div>
              <div className="empty-state-description">Tambahkan resep ke rencana menu.</div>
            </div>
          ) : (
            <LoadingSkeleton />
          );
        })()}
      </div>
    </div>
  );
}

// ─── Shopping Tab ──────────────────────────────────────────────────────

function ShoppingTab() {
  const weekRange = getCurrentWeekRange();
  const weekDates = getWeekDates(weekRange.start);
  const [error, setError] = useState<string | null>(null);

  const shoppingList = useQuery(api.meals.getShoppingList, { weekKey: weekRange.weekKey });
  const generateList = useMutation(api.meals.generateShoppingList);
  const checkItem = useMutation(api.meals.checkShoppingItem);

  const handleGenerate = async () => {
    setError(null);
    try {
      await generateList({
        startDate: weekDates[0],
        endDate: weekDates[6],
        weekKey: weekRange.weekKey,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🛒 Daftar Belanja — {weekRange.weekKey}</h2>
          <button className="btn btn-secondary" onClick={handleGenerate}>
            🔄 Generate dari Menu
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: "var(--space-md)" }}>{error}</div>}

        {shoppingList && shoppingList.items.length > 0 ? (
          <>
            {shoppingList.items.map((item) => (
              <div
                key={item._id}
                className={`shopping-item ${item.checkedAt ? "checked" : ""}`}
                onClick={() => checkItem({ id: item._id })}
                style={{ cursor: "pointer" }}
              >
                <div className={`checkbox ${item.checkedAt ? "checked" : ""}`}>
                  {item.checkedAt && "✓"}
                </div>
                <span className="shopping-item-name">
                  {item.ingredient?.name ?? "?"}
                </span>
                <span className="shopping-item-quantity">
                  {item.quantity} {item.unit}
                </span>
                <span className="shopping-item-cost">
                  {formatIdr(item.estimatedCostIdr)}
                </span>
              </div>
            ))}
            <div style={{
              padding: "var(--space-md)",
              textAlign: "right",
              fontWeight: 700,
              fontSize: "var(--font-size-lg)",
              color: "var(--accent-600)",
              borderTop: "1px solid var(--border-light)",
              marginTop: "var(--space-sm)",
            }}>
              Total: {formatIdr(shoppingList.totalEstimatedCost)}
            </div>
          </>
        ) : shoppingList ? (
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <div className="empty-state-title">Daftar belanja kosong</div>
            <div className="empty-state-description">
              Tambahkan menu di rencana minggu ini, lalu klik &quot;Generate dari Menu&quot; untuk membuat daftar belanja otomatis.
            </div>
          </div>
        ) : (
          <LoadingSkeleton />
        )}
      </div>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
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
  );
}
