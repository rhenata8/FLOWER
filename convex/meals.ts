import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { planShopping, purchaseEstimate, quantityValue, type MenuCandidate } from "../lib/mealPlanning";

const OWNER_ID = "default-user";

const ingredientKind = v.union(
  v.literal("harian"),
  v.literal("mingguan"),
  v.literal("bulanan")
);

// ─── Recipe Mutations ──────────────────────────────────────────────────

export const createRecipe = mutation({
  args: {
    name: v.string(),
    servings: v.number(),
    instructions: v.optional(v.string()),
    ingredients: v.optional(v.array(v.object({ ingredientId: v.id("ingredients"), quantity: v.number() }))),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("Nama resep tidak boleh kosong");
    if (!Number.isInteger(args.servings) || args.servings <= 0) {
      throw new Error("Porsi harus bilangan bulat positif");
    }

    const ingredients = [];
    const seen = new Set<string>();
    if (args.ingredients && (!args.ingredients.length || args.ingredients.length > 100)) throw new Error("Pilih 1 sampai 100 bahan untuk resep");
    for (const item of args.ingredients ?? []) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Takaran harus lebih dari 0");
      if (seen.has(item.ingredientId)) throw new Error("Bahan yang sama cukup dipilih sekali");
      seen.add(item.ingredientId);
      const ingredient = await ctx.db.get(item.ingredientId);
      if (!ingredient || ingredient.ownerId !== OWNER_ID) throw new Error("Bahan tidak ditemukan");
      if (!ingredient.unit.trim()) throw new Error(`Satuan ${ingredient.name} belum diisi`);
      ingredients.push({ ingredientId: item.ingredientId, quantity: item.quantity, unit: ingredient.unit });
    }

    const now = Date.now();
    const id = await ctx.db.insert("recipes", {
      ownerId: OWNER_ID,
      name: args.name.trim(),
      servings: args.servings,
      instructions: args.instructions?.trim(),
      createdAt: now,
      updatedAt: now,
    });
    for (const item of ingredients) await ctx.db.insert("recipeIngredients", { recipeId: id, ...item });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "recipe",
      entityId: id,
      action: "create",
      summary: `Resep dibuat: ${args.name.trim()}`,
      changedAt: now,
    });

    return id;
  },
});

export const updateRecipe = mutation({
  args: {
    id: v.id("recipes"),
    name: v.optional(v.string()),
    servings: v.optional(v.number()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.servings !== undefined) updates.servings = args.servings;
    if (args.instructions !== undefined) updates.instructions = args.instructions?.trim();

    await ctx.db.patch(args.id, updates);

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "recipe",
      entityId: args.id,
      action: "update",
      summary: `Resep diperbarui: ${args.name ?? recipe.name}`,
      changedAt: now,
    });
  },
});

export const archiveRecipe = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { archivedAt: now, updatedAt: now });
  },
});

export const removeRecipe = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }

    // Delete associated recipeIngredients
    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.id))
      .collect();
    for (const ri of ingredients) {
      await ctx.db.delete(ri._id);
    }

    // Delete associated meal plans
    const mealPlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .filter((q) => q.eq(q.field("recipeId"), args.id))
      .collect();
    for (const mp of mealPlans) {
      await ctx.db.delete(mp._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ─── Ingredient Mutations ──────────────────────────────────────────────

export const createIngredient = mutation({
  args: {
    name: v.string(),
    unit: v.string(),
    kind: v.optional(ingredientKind),
    // harian: price per unit and how many units to buy
    currentPriceIdr: v.optional(v.number()),
    buyQuantity: v.optional(v.number()),
    // mingguan / bulanan: one purchase = packagePriceIdr for packageContent units,
    // and usagePerCook units are consumed each time the dish is cooked
    packagePriceIdr: v.optional(v.number()),
    packageContent: v.optional(v.number()),
    usagePerCook: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("Nama bahan tidak boleh kosong");
    const kind = args.kind ?? "harian";

    let pricePerUnit: number;
    let buyQuantity: number | undefined;
    let packagePriceIdr: number | undefined;
    let packageContent: number | undefined;
    let usagePerCook: number | undefined;

    if (kind === "harian") {
      const price = args.currentPriceIdr;
      if (price === undefined || !Number.isInteger(price) || price < 0) {
        throw new Error("Harga per satuan harus bilangan bulat non-negatif");
      }
      if (args.buyQuantity !== undefined && !(args.buyQuantity > 0)) {
        throw new Error("Jumlah yang dibeli harus lebih dari 0");
      }
      pricePerUnit = price;
      buyQuantity = args.buyQuantity;
    } else {
      if (
        args.packagePriceIdr === undefined ||
        !Number.isInteger(args.packagePriceIdr) ||
        args.packagePriceIdr <= 0
      ) {
        throw new Error("Harga beli harus bilangan bulat positif");
      }
      if (args.packageContent === undefined || !(args.packageContent > 0)) {
        throw new Error("Isi per pembelian harus lebih dari 0");
      }
      if (args.usagePerCook === undefined || !(args.usagePerCook > 0)) {
        throw new Error("Pemakaian sekali masak harus lebih dari 0");
      }
      if (args.usagePerCook > args.packageContent) {
        throw new Error("Pemakaian sekali masak tidak boleh melebihi isi per pembelian");
      }
      packagePriceIdr = args.packagePriceIdr;
      packageContent = args.packageContent;
      usagePerCook = args.usagePerCook;
      pricePerUnit = args.packagePriceIdr / args.packageContent;
    }

    const now = Date.now();
    return await ctx.db.insert("ingredients", {
      ownerId: OWNER_ID,
      name: args.name.trim(),
      unit: args.unit,
      currentPriceIdr: pricePerUnit,
      kind,
      buyQuantity,
      packagePriceIdr,
      packageContent,
      usagePerCook,
      updatedAt: now,
    });
  },
});

export const updateIngredient = mutation({
  args: {
    id: v.id("ingredients"),
    name: v.optional(v.string()),
    unit: v.optional(v.string()),
    kind: v.optional(ingredientKind),
    currentPriceIdr: v.optional(v.number()),
    buyQuantity: v.optional(v.union(v.number(), v.null())),
    packagePriceIdr: v.optional(v.number()),
    packageContent: v.optional(v.number()),
    usagePerCook: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ing = await ctx.db.get(args.id);
    if (!ing || ing.ownerId !== OWNER_ID) {
      throw new Error("Bahan tidak ditemukan");
    }

    const name = args.name?.trim() ?? ing.name;
    const unit = args.unit?.trim() ?? ing.unit;
    const kind = args.kind ?? ing.kind ?? "harian";
    if (!name) throw new Error("Nama bahan tidak boleh kosong");
    if (!unit) throw new Error("Satuan bahan tidak boleh kosong");
    if (unit !== ing.unit) {
      const linked = await ctx.db.query("recipeIngredients").withIndex("by_ingredient", q => q.eq("ingredientId", args.id)).first();
      if (linked) throw new Error("Satuan bahan sudah dipakai dalam resep. Lepaskan bahan dari resep terkait sebelum mengganti satuan agar takaran dan biaya tidak salah.");
    }
    const base = { name, unit, kind, updatedAt: Date.now() };
    if (kind === "harian") {
      const price = args.currentPriceIdr ?? ing.currentPriceIdr;
      const quantity = args.buyQuantity === null ? undefined : args.buyQuantity ?? ing.buyQuantity;
      if (!Number.isSafeInteger(price) || price < 0) throw new Error("Harga per satuan harus bilangan bulat non-negatif");
      if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) throw new Error("Jumlah yang dibeli harus lebih dari 0");
      await ctx.db.patch(args.id, { ...base, currentPriceIdr: price, buyQuantity: quantity, packagePriceIdr: undefined, packageContent: undefined, usagePerCook: undefined });
    } else {
      const price = args.packagePriceIdr ?? ing.packagePriceIdr;
      const content = args.packageContent ?? ing.packageContent;
      const usage = args.usagePerCook ?? ing.usagePerCook;
      if (price === undefined || !Number.isSafeInteger(price) || price <= 0) throw new Error("Harga beli harus bilangan bulat positif");
      if (content === undefined || !Number.isFinite(content) || content <= 0) throw new Error("Isi per pembelian harus lebih dari 0");
      if (usage === undefined || !Number.isFinite(usage) || usage <= 0 || usage > content) throw new Error("Pemakaian sekali masak harus lebih dari 0 dan tidak boleh melebihi isi per pembelian");
      await ctx.db.patch(args.id, { ...base, packagePriceIdr: price, packageContent: content, usagePerCook: usage, currentPriceIdr: price / content, buyQuantity: undefined });
    }
  },
});

export const removeIngredient = mutation({
  args: { id: v.id("ingredients") },
  handler: async (ctx, args) => {
    const ing = await ctx.db.get(args.id);
    if (!ing || ing.ownerId !== OWNER_ID) {
      throw new Error("Bahan tidak ditemukan");
    }

    // Delete recipe ingredients references
    const ris = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", args.id))
      .collect();
    for (const ri of ris) {
      await ctx.db.delete(ri._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ─── Recipe Ingredients ────────────────────────────────────────────────

export const addRecipeIngredient = mutation({
  args: {
    recipeId: v.id("recipes"),
    ingredientId: v.id("ingredients"),
    quantity: v.number(),
    unit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.quantity <= 0) throw new Error("Jumlah harus lebih dari 0");

    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient || ingredient.ownerId !== OWNER_ID) {
      throw new Error("Bahan tidak ditemukan");
    }

    // Prices are stored per the ingredient's own unit, so the recipe line must use it too.
    return await ctx.db.insert("recipeIngredients", {
      recipeId: args.recipeId,
      ingredientId: args.ingredientId,
      quantity: args.quantity,
      unit: ingredient.unit,
    });
  },
});

// One transaction keeps a multi-selection together; units always come from stored ingredients.
export const addRecipeIngredients = mutation({
  args: {
    recipeId: v.id("recipes"),
    items: v.array(v.object({ ingredientId: v.id("ingredients"), quantity: v.number() })),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID || recipe.archivedAt) throw new Error("Resep tidak ditemukan");
    if (!args.items.length || args.items.length > 100) throw new Error("Pilih 1 sampai 100 bahan sekaligus");
    const existing = await ctx.db.query("recipeIngredients").withIndex("by_recipe", q => q.eq("recipeId", args.recipeId)).take(101);
    const linked = new Set(existing.map(item => item.ingredientId));
    let addedCount = 0;
    for (const item of args.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Jumlah takaran harus lebih dari 0");
      const ingredient = await ctx.db.get(item.ingredientId);
      if (!ingredient || ingredient.ownerId !== OWNER_ID) throw new Error("Bahan tidak ditemukan. Muat ulang katalog dan coba lagi.");
      if (!ingredient.unit.trim()) throw new Error(`Satuan ${ingredient.name} belum diisi. Edit di tab Bahan terlebih dahulu.`);
      if (linked.has(item.ingredientId)) continue;
      if (existing.length + addedCount >= 100) throw new Error("Maksimal 100 bahan dalam satu resep");
      await ctx.db.insert("recipeIngredients", { recipeId: args.recipeId, ingredientId: item.ingredientId, quantity: item.quantity, unit: ingredient.unit });
      linked.add(item.ingredientId);
      addedCount++;
    }
    return { addedCount, skippedCount: args.items.length - addedCount };
  },
});

export const removeRecipeIngredient = mutation({
  args: { id: v.id("recipeIngredients") },
  handler: async (ctx, args) => {
    const ri = await ctx.db.get(args.id);
    if (!ri) throw new Error("Item tidak ditemukan");
    const recipe = await ctx.db.get(ri.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID) throw new Error("Resep tidak ditemukan");
    await ctx.db.delete(args.id);
  },
});

// ─── Meal Plan ─────────────────────────────────────────────────────────

export const addMealPlan = mutation({
  args: {
    dateKeyLocal: v.string(), // "2026-10-15"
    recipeId: v.id("recipes"),
    servings: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.dateKeyLocal.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error("Format tanggal harus YYYY-MM-DD");
    }
    if (!Number.isInteger(args.servings) || args.servings <= 0) {
      throw new Error("Porsi harus bilangan bulat positif");
    }

    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }

    return await ctx.db.insert("mealPlans", {
      ownerId: OWNER_ID,
      dateKeyLocal: args.dateKeyLocal,
      recipeId: args.recipeId,
      servings: args.servings,
      createdAt: Date.now(),
    });
  },
});

export const removeMealPlan = mutation({
  args: { id: v.id("mealPlans") },
  handler: async (ctx, args) => {
    const mp = await ctx.db.get(args.id);
    if (!mp || mp.ownerId !== OWNER_ID) {
      throw new Error("Rencana menu tidak ditemukan");
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Shopping List ─────────────────────────────────────────────────────

export const addShoppingItem = mutation({
  args: {
    weekKey: v.string(),
    ingredientId: v.id("ingredients"),
    quantity: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.quantity <= 0) throw new Error("Jumlah harus lebih dari 0");

    return await ctx.db.insert("shoppingListItems", {
      ownerId: OWNER_ID,
      weekKey: args.weekKey,
      ingredientId: args.ingredientId,
      quantity: args.quantity,
      unit: args.unit,
      createdAt: Date.now(),
    });
  },
});

export const checkShoppingItem = mutation({
  args: { id: v.id("shoppingListItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item || item.ownerId !== OWNER_ID) {
      throw new Error("Item belanja tidak ditemukan");
    }
    await ctx.db.patch(args.id, {
      checkedAt: item.checkedAt ? undefined : Date.now(),
    });
  },
});

/**
 * Aggregate every ingredient needed by the meal plans inside [startDate, endDate]
 * and store them as the shopping list for `weekKey` (replacing any previous one).
 */
async function rebuildShoppingList(
  ctx: MutationCtx,
  startDate: string,
  endDate: string,
  weekKey: string
): Promise<number> {
  const mealPlans = await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_date", (q) =>
      q.eq("ownerId", OWNER_ID).gte("dateKeyLocal", startDate).lte("dateKeyLocal", endDate)
    )
    .take(500);

  const needs = new Map<
    string,
    { ingredientId: Id<"ingredients">; totalQuantity: number; unit: string }
  >();

  for (const mp of mealPlans) {
    const recipe = await ctx.db.get(mp.recipeId);
    if (!recipe) continue;

    const recipeIngredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", mp.recipeId))
      .take(100);

    const servingMultiplier = mp.servings / recipe.servings;

    for (const ri of recipeIngredients) {
      const key = `${ri.ingredientId}-${ri.unit}`;
      const neededQuantity = ri.quantity * servingMultiplier;
      const existing = needs.get(key);
      if (existing) {
        existing.totalQuantity += neededQuantity;
      } else {
        needs.set(key, {
          ingredientId: ri.ingredientId,
          totalQuantity: neededQuantity,
          unit: ri.unit,
        });
      }
    }
  }

  const existingItems = await ctx.db
    .query("shoppingListItems")
    .withIndex("by_owner_week", (q) => q.eq("ownerId", OWNER_ID).eq("weekKey", weekKey))
    .take(1000);
  for (const item of existingItems) {
    await ctx.db.delete(item._id);
  }

  const now = Date.now();
  for (const need of needs.values()) {
    await ctx.db.insert("shoppingListItems", {
      ownerId: OWNER_ID,
      weekKey,
      ingredientId: need.ingredientId,
      quantity: quantityValue(need.totalQuantity),
      unit: need.unit,
      createdAt: now,
    });
  }
  return needs.size;
}

export const generateShoppingList = mutation({
  args: {
    startDate: v.string(), // "2026-10-14"
    endDate: v.string(),   // "2026-10-20"
    weekKey: v.string(),
  },
  handler: async (ctx, args) => {
    const itemCount = await rebuildShoppingList(ctx, args.startDate, args.endDate, args.weekKey);
    return { itemCount };
  },
});

// ─── Queries ───────────────────────────────────────────────────────────

export const listRecipes = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .collect();

    const filtered = args.includeArchived ? recipes : recipes.filter((r) => !r.archivedAt);

    return await Promise.all(
      filtered.map(async (recipe) => {
        const recipeIngredients = await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
          .collect();

        let estimatedCostIdr = 0;
        const ingredients = await Promise.all(
          recipeIngredients.map(async (ri) => {
            const ing = await ctx.db.get(ri.ingredientId);
            const costIdr = ing ? Math.round(ri.quantity * ing.currentPriceIdr) : 0;
            estimatedCostIdr += costIdr;
            return {
              _id: ri._id,
              ingredientId: ri.ingredientId,
              name: ing?.name ?? "?",
              quantity: ri.quantity,
              unit: ri.unit,
              costIdr,
            };
          })
        );

        return {
          ...recipe,
          ingredients,
          estimatedCostIdr,
          costPerServing: Math.round(estimatedCostIdr / Math.max(1, recipe.servings)),
        };
      })
    );
  },
});

export const getRecipeWithIngredients = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID) return null;

    const recipeIngredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();

    const ingredients = await Promise.all(
      recipeIngredients.map(async (ri) => {
        const ingredient = await ctx.db.get(ri.ingredientId);
        return {
          ...ri,
          ingredient,
        };
      })
    );

    // Deterministic cost calculation
    let estimatedCostIdr = 0;
    for (const ri of ingredients) {
      if (ri.ingredient) {
        estimatedCostIdr += Math.round(ri.quantity * ri.ingredient.currentPriceIdr);
      }
    }

    return {
      ...recipe,
      ingredients,
      estimatedCostIdr,
      costPerServing: Math.round(estimatedCostIdr / recipe.servings),
    };
  },
});

export const listIngredients = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("ingredients")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .collect();
  },
});

export const getMealPlanByDate = query({
  args: { dateKeyLocal: v.string() },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID).eq("dateKeyLocal", args.dateKeyLocal)
      )
      .collect();

    const result = await Promise.all(
      plans.map(async (mp) => {
        const recipe = await ctx.db.get(mp.recipeId);
        return { ...mp, recipe };
      })
    );

    return result;
  },
});

export const getMealPlanRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID)
          .gte("dateKeyLocal", args.startDate)
          .lte("dateKeyLocal", args.endDate)
      )
      .collect();

    const result = await Promise.all(
      plans.map(async (mp) => {
        const recipe = await ctx.db.get(mp.recipeId);
        let estimatedCostIdr = 0;

        if (recipe) {
          const recipeIngredients = await ctx.db
            .query("recipeIngredients")
            .withIndex("by_recipe", (q) => q.eq("recipeId", mp.recipeId))
            .collect();

          for (const ri of recipeIngredients) {
            const ingredient = await ctx.db.get(ri.ingredientId);
            if (ingredient) {
              const multiplier = mp.servings / recipe.servings;
              estimatedCostIdr += Math.round(ri.quantity * multiplier * ingredient.currentPriceIdr);
            }
          }
        }

        return { ...mp, recipe, estimatedCostIdr };
      })
    );

    return result;
  },
});

export const getShoppingList = query({
  args: { weekKey: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_week", (q) =>
        q.eq("ownerId", OWNER_ID).eq("weekKey", args.weekKey)
      )
      .take(1000);

    const result = await Promise.all(
      items.map(async (item) => {
        const ingredient = await ctx.db.get(item.ingredientId);
        return { ...item, ingredient, ...purchaseEstimate(ingredient, item.quantity) };
      })
    );

    const totalEstimatedCost = result.reduce((sum, item) => sum + item.estimatedCostIdr, 0);

    return { items: result, totalEstimatedCost };
  },
});

// ─── Recipes with ingredients + estimate inline (recipe table) ─────────

export const listRecipesDetailed = query({
  args: {},
  handler: async (ctx) => {
    const recipes = (
      await ctx.db
        .query("recipes")
        .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
        .order("desc")
        .take(200)
    ).filter((r) => !r.archivedAt);

    return await Promise.all(
      recipes.map(async (recipe) => {
        const recipeIngredients = await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
          .take(100);

        const ingredients = await Promise.all(
          recipeIngredients.map(async (ri) => {
            const ingredient = await ctx.db.get(ri.ingredientId);
            return {
              _id: ri._id,
              name: ingredient?.name ?? "?",
              kind: ingredient?.kind ?? "harian",
              quantity: ri.quantity,
              unit: ri.unit,
              costIdr: ingredient ? Math.round(ri.quantity * ingredient.currentPriceIdr) : 0,
            };
          })
        );

        const estimatedCostIdr = ingredients.reduce((sum, i) => sum + i.costIdr, 0);
        return {
          ...recipe,
          ingredients,
          estimatedCostIdr,
          costPerServing: Math.round(estimatedCostIdr / recipe.servings),
        };
      })
    );
  },
});

// ─── Weekly menu generator (budget-capped, needs user approval) ────────

const MENU_DAYS = 7;

function assertDateKey(key: string) {
  const timestamp = Date.parse(`${key}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== key) {
    throw new Error("Format tanggal harus YYYY-MM-DD");
  }
}

/** Pure calendar math on "YYYY-MM-DD" keys (timezone independent). */
function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Complete, owned recipes only. Missing ingredients cannot silently become free. */
async function loadMenuCandidates(ctx: QueryCtx): Promise<MenuCandidate[]> {
  const recipes = (await ctx.db.query("recipes").withIndex("by_owner", q => q.eq("ownerId", OWNER_ID)).take(200)).filter(recipe => !recipe.archivedAt);
  const cache = new Map<Id<"ingredients">, Doc<"ingredients"> | null>();
  const candidates: MenuCandidate[] = [];
  for (const recipe of recipes) {
    const rows = await ctx.db.query("recipeIngredients").withIndex("by_recipe", q => q.eq("recipeId", recipe._id)).take(101);
    if (!rows.length || rows.length > 100 || recipe.servings <= 0) continue;
    const needs: MenuCandidate["needs"] = [];
    let complete = true;
    for (const row of rows) {
      if (!cache.has(row.ingredientId)) cache.set(row.ingredientId, await ctx.db.get(row.ingredientId));
      const ingredient = cache.get(row.ingredientId);
      if (!ingredient || ingredient.ownerId !== OWNER_ID || ingredient.unit !== row.unit || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(ingredient.currentPriceIdr) || ingredient.currentPriceIdr < 0) { complete = false; break; }
      needs.push({ ingredientId: ingredient._id, quantity: row.quantity, ingredient: {
        name: ingredient.name, unit: ingredient.unit, kind: ingredient.kind,
        currentPriceIdr: ingredient.currentPriceIdr, packagePriceIdr: ingredient.packagePriceIdr, packageContent: ingredient.packageContent,
      } });
    }
    if (complete) candidates.push({ recipeId: recipe._id, name: recipe.name, servings: recipe.servings, costIdr: needs.reduce((sum, need) => sum + Math.round(need.quantity * need.ingredient.currentPriceIdr), 0), needs });
  }
  return candidates;
}

export const listMenuCandidates = query({ args: {}, handler: loadMenuCandidates });

export const proposeWeeklyMenu = query({
  args: { startDate: v.string(), budgetIdr: v.number(), seed: v.number(), avoid: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertDateKey(args.startDate);
    if (!Number.isSafeInteger(args.budgetIdr) || args.budgetIdr <= 0) throw new Error("Budget harus bilangan bulat positif");
    const candidates = await loadMenuCandidates(ctx);
    if (!candidates.length) return { status: "no_recipes" as const, budgetIdr: args.budgetIdr };
    const rand = mulberry32(args.seed);
    const signature = (plan: MenuCandidate[]) => plan.map(item => item.recipeId).join(",");
    const seeds = candidates.map(candidate => Array<MenuCandidate>(MENU_DAYS).fill(candidate));
    // Package sharing can make a mixed plan cheaper than repeating one recipe.
    const cheap = [...candidates].sort((a,b) => a.costIdr - b.costIdr).slice(0, 12);
    for (let attempt = 0; attempt < 96; attempt++) seeds.push(Array.from({ length: MENU_DAYS }, () => cheap[Math.floor(rand() * cheap.length)]));
    const priced = seeds.map(plan => ({ plan, total: planShopping(plan).totalIdr })).sort((a,b) => a.total - b.total);
    const feasible = priced.filter(item => item.total <= args.budgetIdr);
    if (!feasible.length) return { status: "over_budget" as const, budgetIdr: args.budgetIdr, minimumTotalIdr: priced[0].total };
    let plan = [...feasible[Math.floor(rand() * feasible.length)].plan];
    for (let day = 0; day < MENU_DAYS; day++) {
      const used = new Set(plan.filter((_, i) => i !== day).map(item => item.recipeId));
      const choices = candidates.map(candidate => ({ candidate, rank: (used.has(candidate.recipeId) ? 1 : 0) + rand() })).sort((a,b) => a.rank - b.rank);
      for (const { candidate } of choices) {
        const alternative = plan.map((item, i) => i === day ? candidate : item);
        if (planShopping(alternative).totalIdr <= args.budgetIdr) { plan = alternative; break; }
      }
    }
    if (args.avoid && signature(plan) === args.avoid) {
      outer: for (let day = 0; day < MENU_DAYS; day++) for (const candidate of candidates) {
        if (candidate.recipeId === plan[day].recipeId) continue;
        const alternative = plan.map((item, i) => i === day ? candidate : item);
        if (planShopping(alternative).totalIdr <= args.budgetIdr) { plan = alternative; break outer; }
      }
    }
    const totalIdr = planShopping(plan).totalIdr;
    return {
      status: "ok" as const, budgetIdr: args.budgetIdr, totalIdr, remainingIdr: args.budgetIdr - totalIdr,
      signature: signature(plan), sameAsPrevious: Boolean(args.avoid) && signature(plan) === args.avoid,
      days: plan.map((candidate, i) => ({ dateKeyLocal: addDaysToKey(args.startDate, i), recipeId: candidate.recipeId, recipeName: candidate.name, servings: candidate.servings, costIdr: candidate.costIdr })),
    };
  },
});

export const applyWeeklyMenu = mutation({
  args: {
    startDate: v.string(),
    budgetIdr: v.number(),
    entries: v.array(
      v.object({ dateKeyLocal: v.string(), recipeId: v.id("recipes") })
    ),
  },
  handler: async (ctx, args) => {
    assertDateKey(args.startDate);
    if (!Number.isInteger(args.budgetIdr) || args.budgetIdr <= 0) {
      throw new Error("Budget harus bilangan bulat positif");
    }

    const dates = Array.from({ length: MENU_DAYS }, (_, i) => addDaysToKey(args.startDate, i));
    if (args.entries.length !== MENU_DAYS) {
      throw new Error("Menu harus berisi tepat 7 hari");
    }
    const seen = new Set<string>();
    for (const entry of args.entries) {
      if (!dates.includes(entry.dateKeyLocal) || seen.has(entry.dateKeyLocal)) {
        throw new Error("Tanggal menu tidak valid");
      }
      seen.add(entry.dateKeyLocal);
    }

    // Re-check the budget on the server so a stale client can never exceed it.
    const candidates = await loadMenuCandidates(ctx);
    const byId = new Map(candidates.map((c) => [c.recipeId, c]));
    const plan = args.entries.map(entry => {
      const candidate = byId.get(entry.recipeId);
      if (!candidate) throw new Error("Ada resep yang sudah tidak tersedia, generate ulang menu");
      return candidate;
    });
    const totalIdr = planShopping(plan).totalIdr;
    if (totalIdr > args.budgetIdr) {
      throw new Error(
        `Total belanja Rp${totalIdr.toLocaleString("id-ID")} melebihi budget Rp${args.budgetIdr.toLocaleString("id-ID")}`
      );
    }

    const endDate = dates[MENU_DAYS - 1];
    const existing = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID).gte("dateKeyLocal", args.startDate).lte("dateKeyLocal", endDate)
      )
      .take(500);
    for (const plan of existing) {
      await ctx.db.delete(plan._id);
    }

    const now = Date.now();
    for (const entry of args.entries) {
      const candidate = byId.get(entry.recipeId)!;
      await ctx.db.insert("mealPlans", {
        ownerId: OWNER_ID,
        dateKeyLocal: entry.dateKeyLocal,
        recipeId: entry.recipeId,
        servings: candidate.servings,
        createdAt: now,
      });
    }

    await rebuildShoppingList(ctx, args.startDate, endDate, args.startDate);
    const savedPlan = await ctx.db.query("shoppingPlans").withIndex("by_owner_startDate", q => q.eq("ownerId", OWNER_ID).eq("startDate", args.startDate)).unique();
    if (savedPlan) await ctx.db.patch(savedPlan._id, { endDate, approvedAt: now });
    else await ctx.db.insert("shoppingPlans", { ownerId: OWNER_ID, startDate: args.startDate, endDate, approvedAt: now });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "mealPlan",
      entityId: args.startDate,
      action: "create",
      summary: `Menu 7 hari (${args.startDate} s/d ${endDate}) disetujui: Rp${totalIdr.toLocaleString("id-ID")}`,
      changedAt: now,
    });

    return { totalIdr, startDate: args.startDate, endDate };
  },
});

/** Shopping list of the most recently approved menu window. */
export const getActiveShoppingList = query({
  args: {},
  handler: async (ctx) => {
    const approved = await ctx.db.query("shoppingPlans").withIndex("by_owner_approvedAt", q => q.eq("ownerId", OWNER_ID)).order("desc").first();
    const latest = approved ? null : await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_week", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .first();
    if (!approved && !latest) return null;

    const weekKey = approved?.startDate ?? latest!.weekKey;
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_week", (q) => q.eq("ownerId", OWNER_ID).eq("weekKey", weekKey))
      .take(1000);

    const enriched = await Promise.all(
      items.map(async (item) => {
        const ingredient = await ctx.db.get(item.ingredientId);
        return { ...item, ingredient, ...purchaseEstimate(ingredient, item.quantity) };
      })
    );

    const isDateKey = /^\d{4}-\d{2}-\d{2}$/.test(weekKey);
    return {
      weekKey,
      startDate: isDateKey ? weekKey : null,
      endDate: approved?.endDate ?? (isDateKey ? addDaysToKey(weekKey, MENU_DAYS - 1) : null),
      items: enriched,
      totalEstimatedCost: enriched.reduce((sum, item) => sum + item.estimatedCostIdr, 0),
    };
  },
});

