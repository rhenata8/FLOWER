import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const OWNER_ID = "default-user";

// ─── Recipe Mutations ──────────────────────────────────────────────────

export const createRecipe = mutation({
  args: {
    name: v.string(),
    servings: v.number(),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("Nama resep tidak boleh kosong");
    if (!Number.isInteger(args.servings) || args.servings <= 0) {
      throw new Error("Porsi harus bilangan bulat positif");
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

// ─── Ingredient Mutations ──────────────────────────────────────────────

export const createIngredient = mutation({
  args: {
    name: v.string(),
    unit: v.string(),
    currentPriceIdr: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("Nama bahan tidak boleh kosong");
    if (!Number.isInteger(args.currentPriceIdr) || args.currentPriceIdr < 0) {
      throw new Error("Harga harus bilangan bulat non-negatif");
    }

    const now = Date.now();
    return await ctx.db.insert("ingredients", {
      ownerId: OWNER_ID,
      name: args.name.trim(),
      unit: args.unit,
      currentPriceIdr: args.currentPriceIdr,
      updatedAt: now,
    });
  },
});

export const updateIngredient = mutation({
  args: {
    id: v.id("ingredients"),
    name: v.optional(v.string()),
    unit: v.optional(v.string()),
    currentPriceIdr: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ing = await ctx.db.get(args.id);
    if (!ing || ing.ownerId !== OWNER_ID) {
      throw new Error("Bahan tidak ditemukan");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.unit !== undefined) updates.unit = args.unit;
    if (args.currentPriceIdr !== undefined) {
      if (!Number.isInteger(args.currentPriceIdr) || args.currentPriceIdr < 0) {
        throw new Error("Harga harus bilangan bulat non-negatif");
      }
      updates.currentPriceIdr = args.currentPriceIdr;
    }

    await ctx.db.patch(args.id, updates);
  },
});

// ─── Recipe Ingredients ────────────────────────────────────────────────

export const addRecipeIngredient = mutation({
  args: {
    recipeId: v.id("recipes"),
    ingredientId: v.id("ingredients"),
    quantity: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.quantity <= 0) throw new Error("Jumlah harus lebih dari 0");

    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.ownerId !== OWNER_ID) {
      throw new Error("Resep tidak ditemukan");
    }

    return await ctx.db.insert("recipeIngredients", {
      recipeId: args.recipeId,
      ingredientId: args.ingredientId,
      quantity: args.quantity,
      unit: args.unit,
    });
  },
});

export const removeRecipeIngredient = mutation({
  args: { id: v.id("recipeIngredients") },
  handler: async (ctx, args) => {
    const ri = await ctx.db.get(args.id);
    if (!ri) throw new Error("Item tidak ditemukan");
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

export const generateShoppingList = mutation({
  args: {
    startDate: v.string(), // "2026-10-14"
    endDate: v.string(),   // "2026-10-20"
    weekKey: v.string(),   // "2026-W42"
  },
  handler: async (ctx, args) => {
    // Get meal plans in date range
    const mealPlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID)
          .gte("dateKeyLocal", args.startDate)
          .lte("dateKeyLocal", args.endDate)
      )
      .collect();

    // Aggregate ingredients
    const ingredientNeeds: Map<string, { ingredientId: string; totalQuantity: number; unit: string }> = new Map();

    for (const mp of mealPlans) {
      const recipe = await ctx.db.get(mp.recipeId);
      if (!recipe) continue;

      const recipeIngredients = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (q) => q.eq("recipeId", mp.recipeId))
        .collect();

      const servingMultiplier = mp.servings / recipe.servings;

      for (const ri of recipeIngredients) {
        const key = `${ri.ingredientId}-${ri.unit}`;
        const existing = ingredientNeeds.get(key);
        const neededQuantity = ri.quantity * servingMultiplier;

        if (existing) {
          existing.totalQuantity += neededQuantity;
        } else {
          ingredientNeeds.set(key, {
            ingredientId: ri.ingredientId as string,
            totalQuantity: neededQuantity,
            unit: ri.unit,
          });
        }
      }
    }

    // Clear existing shopping items for this week
    const existingItems = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_week", (q) =>
        q.eq("ownerId", OWNER_ID).eq("weekKey", args.weekKey)
      )
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    // Create new shopping list items
    const createdIds = [];
    for (const [, need] of ingredientNeeds) {
      const id = await ctx.db.insert("shoppingListItems", {
        ownerId: OWNER_ID,
        weekKey: args.weekKey,
        ingredientId: need.ingredientId as any,
        quantity: Math.ceil(need.totalQuantity * 100) / 100, // round up to 2 decimal
        unit: need.unit,
        createdAt: Date.now(),
      });
      createdIds.push(id);
    }

    return { itemCount: createdIds.length };
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

    if (args.includeArchived) return recipes;
    return recipes.filter((r) => !r.archivedAt);
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
      .collect();

    const result = await Promise.all(
      items.map(async (item) => {
        const ingredient = await ctx.db.get(item.ingredientId);
        const estimatedCostIdr = ingredient
          ? Math.round(item.quantity * ingredient.currentPriceIdr)
          : 0;
        return { ...item, ingredient, estimatedCostIdr };
      })
    );

    const totalEstimatedCost = result.reduce((sum, item) => sum + item.estimatedCostIdr, 0);

    return { items: result, totalEstimatedCost };
  },
});
