/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTest = () => convexTest(schema, modules);
const epoch = (date: string) => new Date(`${date}T00:00:00+07:00`).getTime();

describe("expense categories", () => {
  test("an unknown item can be recorded in a fresh account without visiting Budgeting", async () => {
    const t = makeTest();
    const parsed = await t.query(api.hermes.parseQuickTransaction, { input: "obat flu Rp25.000" });
    expect(parsed).toMatchObject({ isValid: true, needsCategory: true, category: "Belum dikategorikan", item: "obat flu", amountIdr: 25_000 });
    await t.mutation(api.transactions.create, {
      kind: "expense", category: parsed.category!, createCategory: true,
      amountIdr: parsed.amountIdr!, note: parsed.item, occurredAt: epoch("2026-10-27"),
    });
    expect(await t.query(api.transactions.list, {})).toMatchObject([{ category: "Belum dikategorikan", note: "obat flu", amountIdr: 25_000 }]);
    expect((await t.query(api.budget.listCategories, {})).map((c) => c.name)).toEqual(["Belum dikategorikan"]);
  });

  test("allows a new category inline and reuses it without duplicates", async () => {
    const t = makeTest();
    const args = { kind: "expense" as const, category: "Kesehatan", createCategory: true, amountIdr: 12_000, occurredAt: epoch("2026-10-27") };
    await t.mutation(api.transactions.create, args);
    await t.mutation(api.transactions.create, { ...args, category: " kesehatan " });
    expect((await t.query(api.budget.listCategories, {})).map((c) => c.name)).toEqual(["Kesehatan"]);
    expect((await t.query(api.transactions.list, {})).map((tx) => tx.category)).toEqual(["Kesehatan", "Kesehatan"]);
  });

  test("still detects existing aliases and salary automatically", async () => {
    const t = makeTest();
    await t.mutation(api.budget.createCategory, { name: "Kebutuhan Rumah", items: ["sabun cuci"] });
    expect(await t.query(api.hermes.parseQuickTransaction, { input: "sabun cuci 12000" })).toMatchObject({ isValid: true, category: "Kebutuhan Rumah", item: "sabun cuci", amountIdr: 12_000 });
    expect(await t.query(api.hermes.parseQuickTransaction, { input: "gaji 5000000" })).toMatchObject({ isValid: true, kind: "income", category: "gaji", amountIdr: 5_000_000 });
  });

  test.each(["obat", "obat -200", "obat 0", "obat 120abc", "obat 9007199254740992"])("rejects invalid input: %s", async (input) => {
    const t = makeTest();
    expect(await t.query(api.hermes.parseQuickTransaction, { input })).toMatchObject({ isValid: false, needsClarification: true });
  });

  test("rejects reserved/empty categories and leaves no partial writes", async () => {
    const t = makeTest();
    for (const category of ["gaji", "  "]) {
      await expect(t.mutation(api.transactions.create, { kind: "expense", category, createCategory: true, amountIdr: 100, occurredAt: 0 })).rejects.toThrow();
    }
    await expect(t.mutation(api.transactions.create, { kind: "expense", category: "Baru", createCategory: true, amountIdr: -100, occurredAt: 0 })).rejects.toThrow();
    expect(await t.query(api.budget.listCategories, {})).toEqual([]);
    expect(await t.query(api.transactions.list, {})).toEqual([]);
  });

  test("an idempotent retry does not create a second category or transaction", async () => {
    const t = makeTest();
    const args = { kind: "expense" as const, category: "Kesehatan", createCategory: true, amountIdr: 100, occurredAt: 0, idempotencyKey: "expense-1" };
    const id = await t.mutation(api.transactions.create, args);
    expect(await t.mutation(api.transactions.create, { ...args, category: "Tidak boleh dibuat" })).toBe(id);
    expect(await t.query(api.budget.listCategories, {})).toHaveLength(1);
    expect(await t.query(api.transactions.list, {})).toHaveLength(1);
  });
});

describe("balance carry-over", () => {
  test("carries salary and remaining money across weeks, months and empty periods", async () => {
    const t = makeTest();
    await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 5_000_000, occurredAt: epoch("2026-09-25") });
    await t.mutation(api.transactions.create, { kind: "expense", category: "Makan", createCategory: true, amountIdr: 1_000_000, occurredAt: epoch("2026-10-18") });
    await t.mutation(api.transactions.create, { kind: "expense", category: "Makan", amountIdr: 50_000, occurredAt: epoch("2026-10-19") });
    const week = await t.query(api.transactions.getSummary, { startDate: epoch("2026-10-19"), endDate: epoch("2026-10-26") - 1 });
    expect(week).toMatchObject({ openingBalance: 4_000_000, totalIncome: 0, totalExpense: 50_000, netBalance: -50_000, closingBalance: 3_950_000, transactionCount: 1, byCategory: { Makan: 50_000 } });
    const next = await t.query(api.transactions.getSummary, { startDate: epoch("2026-10-26"), endDate: epoch("2026-11-02") - 1 });
    expect(next).toMatchObject({ openingBalance: week.closingBalance, closingBalance: week.closingBalance, totalIncome: 0, totalExpense: 0, transactionCount: 0 });
    const month = await t.query(api.transactions.getSummary, { startDate: epoch("2026-11-01"), endDate: epoch("2026-12-01") - 1 });
    expect(month.closingBalance).toBe(3_950_000);
    expect(await t.query(api.transactions.list, {})).toHaveLength(3);
  });

  test("excludes future, voided and other-owner transactions and handles exact boundaries", async () => {
    const t = makeTest();
    const startDate = epoch("2026-10-26");
    const endDate = epoch("2026-11-02") - 1;
    await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 100, occurredAt: startDate - 1 });
    await t.mutation(api.transactions.create, { kind: "income", category: "bonus", amountIdr: 200, occurredAt: startDate });
    await t.mutation(api.transactions.create, { kind: "income", category: "bonus", amountIdr: 300, occurredAt: endDate });
    await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 9999, occurredAt: endDate + 1 });
    const voidId = await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 500, occurredAt: startDate - 10 });
    await t.mutation(api.transactions.voidTransaction, { id: voidId });
    await t.run(async (ctx) => { await ctx.db.insert("transactions", { ownerId: "someone-else", kind: "income", category: "gaji", amountIdr: 9999, occurredAt: startDate - 1, source: "manual", createdAt: 0, updatedAt: 0 }); });
    expect(await t.query(api.transactions.getSummary, { startDate, endDate })).toMatchObject({ openingBalance: 100, totalIncome: 500, closingBalance: 600, transactionCount: 2 });
  });

  test("historical edits/deletes/voids recalculate carry-over, including negative balances", async () => {
    const t = makeTest();
    const id = await t.mutation(api.transactions.create, { kind: "income", category: "gaji", amountIdr: 100_000, occurredAt: epoch("2026-10-18") });
    const expense = await t.mutation(api.transactions.create, { kind: "expense", category: "Makan", createCategory: true, amountIdr: 150_000, occurredAt: epoch("2026-10-19") });
    const range = { startDate: epoch("2026-10-26"), endDate: epoch("2026-11-02") - 1 };
    expect((await t.query(api.transactions.getSummary, range)).closingBalance).toBe(-50_000);
    await t.mutation(api.transactions.update, { id, amountIdr: 200_000 });
    expect((await t.query(api.transactions.getSummary, range)).closingBalance).toBe(50_000);
    await t.mutation(api.transactions.voidTransaction, { id: expense });
    expect((await t.query(api.transactions.getSummary, range)).closingBalance).toBe(200_000);
    await t.mutation(api.transactions.remove, { id });
    expect((await t.query(api.transactions.getSummary, range)).closingBalance).toBe(0);
  });
});
