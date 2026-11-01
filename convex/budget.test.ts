/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const epoch = (day: string) => Date.parse(`${day}T00:00:00+07:00`);
async function setup() {
  const t = convexTest(schema, modules);
  const categoryId = await t.mutation(api.budget.createCategory, { name: "Monthly", items: ["bulanan"] });
  const budgetId = await t.mutation(api.budget.createBudget, { name: "Belanja", categoryId, amountIdr: 150_000 });
  const rice = await t.mutation(api.budget.createBudget, { name: "Beras", categoryId, amountIdr: 35_000 });
  return { t, categoryId, budgetId, rice };
}

describe("monthly subcategory budgets", () => {
  test("recognizes budget names even when absent from old category items", async () => {
    const { t, budgetId } = await setup();
    const parsed = await t.query(api.hermes.parseQuickTransaction, { input: "Belanja 145000" });
    expect(parsed).toMatchObject({ isValid: true, category: "Monthly", item: "Belanja", budgetId });
    await t.mutation(api.transactions.create, { kind: "expense", category: parsed.category!, subcategory: parsed.item, budgetId: parsed.budgetId, amountIdr: parsed.amountIdr!, occurredAt: epoch("2026-11-01") });
    const rows = await t.query(api.budget.listBudgets, { monthKey: "2026-11" });
    expect(rows.find(b => b._id === budgetId)).toMatchObject({ amountIdr: 150_000, spentIdr: 145_000, remainingIdr: 5_000 });
    expect(rows.find(b => b.name === "Beras")).toMatchObject({ spentIdr: 0, remainingIdr: 35_000 });
  });

  test("category-only input asks for a subcategory instead of charging every budget", async () => {
    const { t, budgetId, rice } = await setup();
    expect(await t.query(api.hermes.parseQuickTransaction, { input: "Monthly 12000" })).toMatchObject({ budgetOptions: expect.arrayContaining([{ id: budgetId, name: "Belanja" }, { id: rice, name: "Beras" }]) });
    await expect(t.mutation(api.transactions.create, { kind: "expense", category: "Monthly", amountIdr: 12000, occurredAt: epoch("2026-11-01") })).rejects.toThrow("Pilih subkategori");
    await t.mutation(api.transactions.create, { kind: "expense", category: "Monthly", budgetId: rice, amountIdr: 12000, occurredAt: epoch("2026-11-01") });
    expect((await t.query(api.budget.listBudgets, { monthKey: "2026-11" })).find(b => b._id === rice)?.remainingIdr).toBe(23000);
  });

  test("resets at midnight Jakarta on the first without creating income or changing carry-over", async () => {
    const { t, budgetId } = await setup();
    await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 1_000_000, occurredAt: epoch("2026-11-01") });
    await t.mutation(api.transactions.create, { kind: "expense", category: "Belanja", amountIdr: 145_000, occurredAt: epoch("2026-12-01") - 1 });
    expect((await t.query(api.budget.listBudgets, { monthKey: "2026-11" })).find(b => b._id === budgetId)?.spentIdr).toBe(145000);
    expect((await t.query(api.budget.listBudgets, { monthKey: "2026-12" })).find(b => b._id === budgetId)).toMatchObject({ spentIdr: 0, remainingIdr: 150000 });
    const cash = await t.query(api.transactions.getSummary, { startDate: epoch("2026-12-01"), endDate: epoch("2027-01-01") - 1 });
    expect(cash).toMatchObject({ openingBalance: 855000, totalIncome: 0, closingBalance: 855000 });
    await t.mutation(api.transactions.create, { kind: "expense", category: "Belanja", amountIdr: 1000, occurredAt: epoch("2026-12-01") });
    expect((await t.query(api.budget.listBudgets, { monthKey: "2026-12" })).find(b => b._id === budgetId)?.spentIdr).toBe(1000);
    expect(await t.query(api.transactions.list, {})).toHaveLength(3);
  });

  test("edits, dates, voids and deletes recalculate the linked budget and permit overspending", async () => {
    const { t, budgetId, rice } = await setup();
    const id = await t.mutation(api.transactions.create, { kind: "expense", category: "Belanja", amountIdr: 160_000, occurredAt: epoch("2026-11-02") });
    const current = async () => (await t.query(api.budget.listBudgets, { monthKey: "2026-11" })).find(b => b._id === budgetId)!;
    expect((await current()).remainingIdr).toBe(-10000);
    await t.mutation(api.transactions.update, { id, amountIdr: 145000 });
    expect((await current()).remainingIdr).toBe(5000);
    await t.mutation(api.transactions.update, { id, budgetId: rice });
    expect((await current()).spentIdr).toBe(0);
    await t.mutation(api.transactions.update, { id, budgetId, occurredAt: epoch("2026-12-01") });
    expect((await current()).spentIdr).toBe(0);
    await t.mutation(api.transactions.update, { id, occurredAt: epoch("2026-11-02") });
    expect((await current()).spentIdr).toBe(145000);
    await t.mutation(api.transactions.voidTransaction, { id });
    expect((await current()).spentIdr).toBe(0);
    await t.mutation(api.transactions.remove, { id });
    expect((await current()).spentIdr).toBe(0);
  });

  test("historical records stay excluded except the explicit selected expense, linked once", async () => {
    const { t, budgetId } = await setup();
    const [selected, old] = await t.run(async ctx => Promise.all([145000, 4000].map(amountIdr => ctx.db.insert("transactions", { ownerId: "default-user", kind: "expense", category: "Monthly", note: "bulanan", amountIdr, occurredAt: epoch("2026-11-01"), source: "chat", createdAt: 0, updatedAt: 0 }))));
    const row = async () => (await t.query(api.budget.listBudgets, { monthKey: "2026-11" })).find(b => b._id === budgetId)!;
    expect((await row()).spentIdr).toBe(0);
    const args = { transactionId: selected, budgetId, expectedAmount: 145000, expectedDate: "2026-11-01" };
    expect(await t.mutation(internal.budget.linkHistoricalExpense, args)).toMatchObject({ linked: true });
    expect(await t.mutation(internal.budget.linkHistoricalExpense, args)).toMatchObject({ alreadyLinked: true });
    expect((await row()).spentIdr).toBe(145000);
    expect(await t.run(async ctx => ctx.db.get(old))).not.toHaveProperty("budgetId");
    expect(await t.query(api.transactions.list, {})).toHaveLength(2);
    await expect(t.mutation(internal.budget.linkHistoricalExpense, { ...args, expectedAmount: 1 })).rejects.toThrow();
  });

  test("stable links survive renaming and cannot charge another user's budget", async () => {
    const { t, budgetId, categoryId } = await setup();
    await t.mutation(api.transactions.create, { kind: "expense", category: "Belanja", amountIdr: 1000, occurredAt: epoch("2026-11-02") });
    await t.mutation(api.budget.updateBudget, { id: budgetId, name: "Belanja Rumah" });
    expect((await t.query(api.budget.listBudgets, { monthKey: "2026-11" })).find(b => b._id === budgetId)?.spentIdr).toBe(1000);
    const foreign = await t.run(async ctx => ctx.db.insert("budgets", { ownerId: "another-user", name: "Foreign", categoryId, amountIdr: 10000, periodDays: 30, createdAt: 0, updatedAt: 0 }));
    await expect(t.mutation(api.transactions.create, { kind: "expense", category: "Monthly", budgetId: foreign, amountIdr: 1000, occurredAt: epoch("2026-11-02") })).rejects.toThrow("Subkategori tidak sesuai");
    await expect(t.mutation(api.budget.createBudget, { name: "Belanja Rumah", categoryId, amountIdr: 1 })).rejects.toThrow("sudah");
  });
});
