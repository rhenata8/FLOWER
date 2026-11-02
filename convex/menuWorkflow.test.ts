/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { planShopping, purchaseEstimate } from "../lib/mealPlanning";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${String(3 + i).padStart(2,"0")}`);

async function fixture() {
  const t = convexTest(schema, modules);
  const garlic = await t.mutation(api.meals.createIngredient, { name: "Bawang", unit: "siung", kind: "mingguan", packageContent: 10, packagePriceIdr: 10000, usagePerCook: 2 });
  const two = await t.mutation(api.meals.createRecipe, { name: "Sop", servings: 2, ingredients: [{ ingredientId: garlic, quantity: 2 }] });
  const three = await t.mutation(api.meals.createRecipe, { name: "Tumis", servings: 2, ingredients: [{ ingredientId: garlic, quantity: 3 }] });
  return { t, garlic, two, three };
}

test("create recipe and ingredient quantities atomically with stored units", async () => {
  const { t, two, garlic } = await fixture();
  const recipe = await t.query(api.meals.getRecipeWithIngredients, { recipeId: two });
  expect(recipe?.ingredients).toMatchObject([{ ingredientId: garlic, quantity: 2, unit: "siung" }]);
  const before = await t.query(api.meals.listRecipes, {});
  for (const ingredients of [[], [{ ingredientId: garlic, quantity: -1 }], [{ ingredientId: garlic, quantity: 1 }, { ingredientId: garlic, quantity: 2 }]]) {
    await expect(t.mutation(api.meals.createRecipe, { name: "Invalid", servings: 2, ingredients })).rejects.toThrow();
  }
  const foreign = await t.run(ctx => ctx.db.insert("ingredients", { ownerId: "other", name: "Other", unit: "kg", currentPriceIdr: 1, updatedAt: 0 }));
  await expect(t.mutation(api.meals.createRecipe, { name: "Invalid", servings: 2, ingredients: [{ ingredientId: garlic, quantity: 1 }, { ingredientId: foreign, quantity: 1 }] })).rejects.toThrow("Bahan tidak ditemukan");
  expect(await t.query(api.meals.listRecipes, {})).toEqual(before);
});

test("15 siung across seven days requires 1.5 packages; buy two and show the whole purchase total", async () => {
  const { t, two, three } = await fixture();
  const result = await t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 120000, entries: dates.map((dateKeyLocal, i) => ({ dateKeyLocal, recipeId: i === 0 ? three : two })) });
  expect(result).toEqual({ startDate: "2026-11-03", endDate: "2026-11-09", totalIdr: 20000 });
  const shopping = await t.query(api.meals.getActiveShoppingList, {});
  expect(shopping).toMatchObject({ startDate: "2026-11-03", endDate: "2026-11-09", totalEstimatedCost: 20000 });
  expect(shopping?.items).toHaveLength(1);
  expect(shopping?.items[0]).toMatchObject({ quantity: 15, requiredQuantity: 15, requiredPackages: 1.5, packagesToBuy: 2, purchaseQuantity: 20, estimatedCostIdr: 20000 });
  expect((await t.query(api.meals.getMealPlanRange, { startDate: dates[0], endDate: dates[6] })).map(item => item.dateKeyLocal)).toEqual(dates);
  expect((await t.query(api.meals.getShoppingList, { weekKey: dates[0] })).totalEstimatedCost).toBe(result.totalIdr);
});

test("approval enforces purchase budget and rolls back without replacing an approved plan", async () => {
  const { t, two, three } = await fixture();
  const entries = dates.map(dateKeyLocal => ({ dateKeyLocal, recipeId: two }));
  await t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 120000, entries });
  const before = await t.query(api.meals.getActiveShoppingList, {});
  await expect(t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 16000, entries: entries.map((entry,i) => ({ ...entry, recipeId: i ? two : three })) })).rejects.toThrow("melebihi budget");
  expect(await t.query(api.meals.getActiveShoppingList, {})).toEqual(before);
  expect((await t.query(api.meals.getMealPlanRange, { startDate: dates[0], endDate: dates[6] })).every(day => day.recipeId === two)).toBe(true);
});

test("generator and approval use the same package totals; reroll differs when possible", async () => {
  const { t } = await fixture();
  for (const seed of [1, 2, 17]) {
    const proposal = await t.query(api.meals.proposeWeeklyMenu, { startDate: dates[0], budgetIdr: 20000, seed });
    expect(proposal.status).toBe("ok");
    if (proposal.status !== "ok") throw new Error("Expected a plan");
    const candidates = await t.query(api.meals.listMenuCandidates, {});
    expect(proposal.totalIdr).toBe(planShopping(proposal.days.map(day => candidates.find(item => item.recipeId === day.recipeId)!)).totalIdr);
    const result = await t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 20000, entries: proposal.days.map(day => ({ dateKeyLocal: day.dateKeyLocal, recipeId: day.recipeId })) });
    expect(result.totalIdr).toBe(proposal.totalIdr);
    const next = await t.query(api.meals.proposeWeeklyMenu, { startDate: dates[0], budgetIdr: 20000, seed: seed + 1, avoid: proposal.signature });
    expect(next.status === "ok" && next.signature !== proposal.signature).toBe(true);
  }
  const impossible = await t.query(api.meals.proposeWeeklyMenu, { startDate: dates[0], budgetIdr: 19000, seed: 1 });
  expect(impossible.status).toBe("over_budget");
});

test("active list follows the last approval, retains checkmarks on reads, and aggregates identical ingredients", async () => {
  const { t, two } = await fixture();
  await t.mutation(api.meals.applyWeeklyMenu, { startDate: "2026-11-10", budgetIdr: 120000, entries: dates.map((_,i) => ({ dateKeyLocal: `2026-11-${10+i}`, recipeId: two })) });
  await t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 120000, entries: dates.map(dateKeyLocal => ({ dateKeyLocal, recipeId: two })) });
  const list = await t.query(api.meals.getActiveShoppingList, {});
  expect(list?.startDate).toBe(dates[0]);
  expect(list?.items[0]).toMatchObject({ quantity: 14, packagesToBuy: 2 });
  await t.mutation(api.meals.checkShoppingItem, { id: list!.items[0]._id });
  expect((await t.query(api.meals.getActiveShoppingList, {}))?.items[0].checkedAt).toBeTypeOf("number");
  expect((await t.query(api.meals.getActiveShoppingList, {}))?.totalEstimatedCost).toBe(20000);
});

test("package boundaries ignore floating point noise, daily quantities stay fractional", () => {
  const packaged = { name: "Bahan", unit: "kg", kind: "mingguan" as const, currentPriceIdr: 10000, packageContent: .1, packagePriceIdr: 1000 };
  expect(purchaseEstimate(packaged, .1 + .2)).toMatchObject({ packagesToBuy: 3, estimatedCostIdr: 3000 });
  expect(purchaseEstimate({ ...packaged, kind: "harian" }, .15)).toMatchObject({ packagesToBuy: null, purchaseQuantity: .15, estimatedCostIdr: 1500 });
  expect(purchaseEstimate(packaged, 1e-10).packagesToBuy).toBe(1);
});

test("invalid calendar dates and duplicate menu days cannot be approved", async () => {
  const { t, two } = await fixture();
  await expect(t.query(api.meals.proposeWeeklyMenu, { startDate: "2026-02-30", budgetIdr: 120000, seed: 1 })).rejects.toThrow("Format tanggal");
  await expect(t.mutation(api.meals.applyWeeklyMenu, { startDate: dates[0], budgetIdr: 120000, entries: dates.map(() => ({ dateKeyLocal: dates[0], recipeId: two })) })).rejects.toThrow("Tanggal menu tidak valid");
  expect(await t.query(api.meals.getActiveShoppingList, {})).toBeNull();
});
