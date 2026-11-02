/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

test("editing an ingredient preserves its ID and recipe link while recalculating recipe cost", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.meals.createIngredient, { name: "Ayam", unit: "kg", kind: "harian", currentPriceIdr: 40000, buyQuantity: 0.5 });
  const recipeId = await t.mutation(api.meals.createRecipe, { name: "Taichan", servings: 2 });
  await t.mutation(api.meals.addRecipeIngredient, { recipeId, ingredientId: id, quantity: 0.5, unit: "kg" });
  await t.mutation(api.meals.updateIngredient, { id, name: "Dada ayam fillet", currentPriceIdr: 50000, buyQuantity: 1 });
  const ingredients = await t.query(api.meals.listIngredients, {});
  expect(ingredients).toHaveLength(1);
  expect(ingredients[0]).toMatchObject({ _id: id, name: "Dada ayam fillet", currentPriceIdr: 50000, buyQuantity: 1 });
  const recipe = await t.query(api.meals.getRecipeWithIngredients, { recipeId });
  expect(recipe?.estimatedCostIdr).toBe(25000);
  await expect(t.mutation(api.meals.updateIngredient, { id, unit: "gram" })).rejects.toThrow("Satuan bahan sudah dipakai");
});

test("partial package edits recalculate unit price from merged values", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.meals.createIngredient, { name: "Bawang putih", unit: "siung", kind: "mingguan", packagePriceIdr: 15000, packageContent: 15, usagePerCook: 3 });
  await t.mutation(api.meals.updateIngredient, { id, packageContent: 30 });
  expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ currentPriceIdr: 500, packageContent: 30, packagePriceIdr: 15000 });
  await t.mutation(api.meals.updateIngredient, { id, kind: "bulanan", packagePriceIdr: 18000 });
  expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ currentPriceIdr: 600, usagePerCook: 3, kind: "bulanan" });
});

test("switching frequency clears incompatible fields and supports clearing daily quantity", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.meals.createIngredient, { name: "Cabai", unit: "gram", kind: "mingguan", packagePriceIdr: 10000, packageContent: 200, usagePerCook: 10 });
  await t.mutation(api.meals.updateIngredient, { id, kind: "harian", currentPriceIdr: 100, buyQuantity: 20 });
  let ingredient = await t.run(async ctx => ctx.db.get(id));
  expect(ingredient).toMatchObject({ kind: "harian", currentPriceIdr: 100, buyQuantity: 20 });
  expect(ingredient?.packagePriceIdr).toBeUndefined();
  await t.mutation(api.meals.updateIngredient, { id, buyQuantity: null });
  ingredient = await t.run(async ctx => ctx.db.get(id));
  expect(ingredient?.buyQuantity).toBeUndefined();
});

test("invalid edits and foreign ingredient IDs cannot modify stored data", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.meals.createIngredient, { name: "Garam", unit: "gram", kind: "bulanan", packagePriceIdr: 5000, packageContent: 100, usagePerCook: 2 });
  for (const patch of [{ name: " " }, { unit: " " }, { packageContent: 0 }, { packagePriceIdr: -10 }, { usagePerCook: 101 }]) {
    await expect(t.mutation(api.meals.updateIngredient, { id, ...patch })).rejects.toThrow();
  }
  expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ name: "Garam", currentPriceIdr: 50 });
  const foreign = await t.run(async ctx => ctx.db.insert("ingredients", { ownerId: "someone-else", name: "Other", unit: "gram", currentPriceIdr: 1, updatedAt: 0 }));
  await expect(t.mutation(api.meals.updateIngredient, { id: foreign, name: "Changed" })).rejects.toThrow("Bahan tidak ditemukan");
});
