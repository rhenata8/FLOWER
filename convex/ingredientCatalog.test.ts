/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

test("batch links multiple ingredients with stored units and correct costs; retries do not duplicate", async () => {
  const t = convexTest(schema, modules);
  const recipeId = await t.mutation(api.meals.createRecipe, { name: "Taichan", servings: 2 });
  const chicken = await t.mutation(api.meals.createIngredient, { name: "Ayam", unit: "kg", currentPriceIdr: 40000 });
  const garlic = await t.mutation(api.meals.createIngredient, { name: "Bawang", unit: "siung", currentPriceIdr: 500 });
  const items = [{ ingredientId: chicken, quantity: .5 }, { ingredientId: garlic, quantity: 3 }];
  expect(await t.mutation(api.meals.addRecipeIngredients, { recipeId, items })).toEqual({ addedCount: 2, skippedCount: 0 });
  expect(await t.mutation(api.meals.addRecipeIngredients, { recipeId, items })).toEqual({ addedCount: 0, skippedCount: 2 });
  const recipe = await t.query(api.meals.getRecipeWithIngredients, { recipeId });
  expect(recipe?.estimatedCostIdr).toBe(21500);
  expect(recipe?.ingredients.map(item => [item.quantity, item.unit])).toEqual([[.5, "kg"], [3, "siung"]]);
});

test("invalid quantity or foreign ingredient rolls the entire batch back", async () => {
  const t = convexTest(schema, modules);
  const recipeId = await t.mutation(api.meals.createRecipe, { name: "Sop", servings: 2 });
  const ingredientId = await t.mutation(api.meals.createIngredient, { name: "Wortel", unit: "buah", currentPriceIdr: 1000 });
  const foreignId = await t.run(ctx => ctx.db.insert("ingredients", { ownerId: "other", name: "Other", unit: "kg", currentPriceIdr: 1, updatedAt: 0 }));
  for (const item of [{ ingredientId, quantity: 0 }, { ingredientId, quantity: Infinity }, { ingredientId: foreignId, quantity: 1 }]) {
    await expect(t.mutation(api.meals.addRecipeIngredients, { recipeId, items: [{ ingredientId, quantity: 2 }, item] })).rejects.toThrow();
    expect((await t.query(api.meals.getRecipeWithIngredients, { recipeId }))?.ingredients).toHaveLength(0);
  }
});

test("distinct ingredients with the same name stay distinct; repeated IDs are added once", async () => {
  const t = convexTest(schema, modules);
  const recipeId = await t.mutation(api.meals.createRecipe, { name: "Sop", servings: 2 });
  const a = await t.mutation(api.meals.createIngredient, { name: "Bawang", unit: "siung", currentPriceIdr: 100 });
  const b = await t.mutation(api.meals.createIngredient, { name: "Bawang", unit: "gram", currentPriceIdr: 50 });
  expect(await t.mutation(api.meals.addRecipeIngredients, { recipeId, items: [{ ingredientId: a, quantity: 2 }, { ingredientId: a, quantity: 9 }, { ingredientId: b, quantity: 10 }] })).toEqual({ addedCount: 2, skippedCount: 1 });
});

test("foreign recipes cannot be changed by adding or removing ingredients", async () => {
  const t = convexTest(schema, modules);
  const recipeId = await t.run(ctx => ctx.db.insert("recipes", { ownerId: "other", name: "Private", servings: 1, createdAt: 0, updatedAt: 0 }));
  const ingredientId = await t.mutation(api.meals.createIngredient, { name: "Garam", unit: "gram", currentPriceIdr: 50 });
  const id = await t.run(ctx => ctx.db.insert("recipeIngredients", { recipeId, ingredientId, quantity: 1, unit: "gram" }));
  await expect(t.mutation(api.meals.addRecipeIngredients, { recipeId, items: [{ ingredientId, quantity: 1 }] })).rejects.toThrow("Resep tidak ditemukan");
  await expect(t.mutation(api.meals.removeRecipeIngredient, { id })).rejects.toThrow("Resep tidak ditemukan");
  expect(await t.run(ctx => ctx.db.get(id))).not.toBeNull();
});
