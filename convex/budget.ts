import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isIncomeCategory } from "./lib/categories";

const OWNER_ID = "default-user";

// ─── Helpers ───────────────────────────────────────────────────────────

function cleanItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/** Name and items must be unique across categories so quick input maps deterministically. */
async function assertCategoryUnique(
  ctx: MutationCtx,
  name: string,
  items: string[],
  selfId?: Id<"budgetCategories">
) {
  if (isIncomeCategory(name)) {
    throw new Error(`"${name}" dipakai untuk pemasukan, gunakan nama lain`);
  }
  const others = (
    await ctx.db
      .query("budgetCategories")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .take(200)
  ).filter((c) => c._id !== selfId);

  const used = new Map<string, string>();
  for (const other of others) {
    used.set(other.name.trim().toLowerCase(), other.name);
    for (const item of other.items) used.set(item.trim().toLowerCase(), other.name);
  }

  const nameKey = name.trim().toLowerCase();
  if (used.has(nameKey)) {
    throw new Error(`"${name}" sudah dipakai di kategori "${used.get(nameKey)}"`);
  }
  for (const item of items) {
    const key = item.toLowerCase();
    if (key === nameKey) {
      throw new Error(`Item "${item}" tidak boleh sama dengan nama kategorinya`);
    }
    if (used.has(key)) {
      throw new Error(`Item "${item}" sudah ada di kategori "${used.get(key)}"`);
    }
  }
}

function validatePositiveInt(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} harus bilangan bulat positif`);
  }
}

// ─── Categories ────────────────────────────────────────────────────────

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("budgetCategories")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .take(200);
    return categories.sort((a, b) => a.name.localeCompare(b.name, "id"));
  },
});

export const createCategory = mutation({
  args: { name: v.string(), items: v.array(v.string()) },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Nama kategori tidak boleh kosong");
    const items = cleanItems(args.items);
    await assertCategoryUnique(ctx, name, items);

    const now = Date.now();
    return await ctx.db.insert("budgetCategories", {
      ownerId: OWNER_ID,
      name,
      items,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("budgetCategories"),
    name: v.optional(v.string()),
    items: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    if (!category || category.ownerId !== OWNER_ID) {
      throw new Error("Kategori tidak ditemukan");
    }

    const name = args.name !== undefined ? args.name.trim() : category.name;
    if (!name) throw new Error("Nama kategori tidak boleh kosong");
    const items = args.items !== undefined ? cleanItems(args.items) : category.items;
    await assertCategoryUnique(ctx, name, items, args.id);

    await ctx.db.patch(args.id, { name, items, updatedAt: Date.now() });

    // Keep existing transactions attached to the renamed category.
    if (name !== category.name) {
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_owner_category", (q) =>
          q.eq("ownerId", OWNER_ID).eq("category", category.name)
        )
        .take(2000);
      for (const tx of transactions) {
        await ctx.db.patch(tx._id, { category: name });
      }
    }
  },
});

export const removeCategory = mutation({
  args: { id: v.id("budgetCategories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    if (!category || category.ownerId !== OWNER_ID) {
      throw new Error("Kategori tidak ditemukan");
    }

    // Budgets stay, just detach them from the removed category.
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_category", (q) => q.eq("categoryId", args.id))
      .take(500);
    for (const budget of budgets) {
      await ctx.db.patch(budget._id, { categoryId: undefined });
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Budgets ───────────────────────────────────────────────────────────

export const listBudgets = query({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.monthKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.monthKey)) throw new Error("Bulan tidak valid: gunakan YYYY-MM");
    const monthStart = args.monthKey ? Date.parse(`${args.monthKey}-01T00:00:00+07:00`) : null;
    const [year, month] = (args.monthKey ?? "2000-01").split("-").map(Number);
    const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthEnd = Date.parse(`${nextMonth}-01T00:00:00+07:00`);
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(300);

    return await Promise.all(
      budgets.map(async (budget) => {
        const category = budget.categoryId ? await ctx.db.get(budget.categoryId) : null;
        let spentIdr = 0;
        if (monthStart !== null) {
          const expenses = ctx.db.query("transactions").withIndex("by_budget_date", q =>
            q.eq("budgetId", budget._id).gte("occurredAt", monthStart).lt("occurredAt", monthEnd));
          for await (const tx of expenses) {
            if (tx.ownerId === OWNER_ID && tx.kind === "expense" && tx.voidedAt === undefined) spentIdr += tx.amountIdr;
          }
        }
        return {
          ...budget,
          categoryName: category?.name ?? null,
          perDayIdr: Math.round(budget.amountIdr / budget.periodDays),
          spentIdr,
          remainingIdr: budget.amountIdr - spentIdr,
        };
      })
    );
  },
});

async function assertBudgetName(ctx: MutationCtx, name: string, categoryId?: Id<"budgetCategories">, selfId?: Id<"budgets">) {
  if (isIncomeCategory(name)) throw new Error("Nama subkategori tidak boleh sama dengan kategori pemasukan");
  const budgets = await ctx.db.query("budgets").withIndex("by_owner", q => q.eq("ownerId", OWNER_ID)).take(300);
  if (budgets.some(b => b._id !== selfId && b.name.toLowerCase() === name.toLowerCase())) throw new Error("Nama subkategori sudah memiliki budget");
  const categories = await ctx.db.query("budgetCategories").withIndex("by_owner", q => q.eq("ownerId", OWNER_ID)).take(200);
  if (categories.some(c => c._id !== categoryId && (c.name.toLowerCase() === name.toLowerCase() || c.items.some(item => item.toLowerCase() === name.toLowerCase())))) {
    throw new Error("Nama subkategori sudah dipakai di kategori lain");
  }
}

export const createBudget = mutation({
  args: {
    name: v.string(),
    categoryId: v.optional(v.id("budgetCategories")),
    amountIdr: v.number(),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Nama budget tidak boleh kosong");
    validatePositiveInt(args.amountIdr, "Nominal budget");
    validatePositiveInt(args.periodDays ?? 30, "Jumlah hari");
    if (args.categoryId) {
      const category = await ctx.db.get(args.categoryId);
      if (!category || category.ownerId !== OWNER_ID) throw new Error("Kategori tidak ditemukan");
    }

    await assertBudgetName(ctx, name, args.categoryId);
    const now = Date.now();
    return await ctx.db.insert("budgets", {
      ownerId: OWNER_ID,
      name,
      categoryId: args.categoryId,
      amountIdr: args.amountIdr,
      periodDays: args.periodDays ?? 30,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateBudget = mutation({
  args: {
    id: v.id("budgets"),
    name: v.optional(v.string()),
    categoryId: v.optional(v.id("budgetCategories")),
    clearCategory: v.optional(v.boolean()),
    amountIdr: v.optional(v.number()),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const budget = await ctx.db.get(args.id);
    if (!budget || budget.ownerId !== OWNER_ID) throw new Error("Budget tidak ditemukan");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    const nextName = args.name?.trim() ?? budget.name;
    const nextCategory = args.clearCategory ? undefined : args.categoryId ?? budget.categoryId;
    await assertBudgetName(ctx, nextName, nextCategory, budget._id);
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Nama budget tidak boleh kosong");
      updates.name = name;
    }
    if (args.amountIdr !== undefined) {
      validatePositiveInt(args.amountIdr, "Nominal budget");
      updates.amountIdr = args.amountIdr;
    }
    if (args.periodDays !== undefined) {
      validatePositiveInt(args.periodDays, "Jumlah hari");
      updates.periodDays = args.periodDays;
    }
    if (args.clearCategory) {
      updates.categoryId = undefined;
    } else if (args.categoryId !== undefined) {
      const category = await ctx.db.get(args.categoryId);
      if (!category || category.ownerId !== OWNER_ID) throw new Error("Kategori tidak ditemukan");
      updates.categoryId = args.categoryId;
    }

    await ctx.db.patch(args.id, updates);
  },
});

// Explicit, idempotent opt-in for the single historical expense requested by the
// owner. No bulk matching, no new transaction and no change to cash balances.
export const linkHistoricalExpense = internalMutation({
  args: { transactionId: v.id("transactions"), budgetId: v.id("budgets"), expectedAmount: v.number(), expectedDate: v.string() },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    const budget = await ctx.db.get(args.budgetId);
    const date = tx ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(tx.occurredAt)) : "";
    if (!tx || !budget || tx.ownerId !== OWNER_ID || budget.ownerId !== OWNER_ID || tx.kind !== "expense" || tx.voidedAt !== undefined || tx.amountIdr !== args.expectedAmount || date !== args.expectedDate) throw new Error("Transaksi historis tidak sesuai");
    if (tx.budgetId === budget._id) return { linked: false, alreadyLinked: true };
    if (tx.budgetId) throw new Error("Transaksi sudah terhubung ke budget lain");
    const category = budget.categoryId ? await ctx.db.get(budget.categoryId) : null;
    if (category && category.name !== tx.category) throw new Error("Kategori tidak sesuai");
    await ctx.db.patch(tx._id, { budgetId: budget._id, subcategory: budget.name });
    await ctx.db.insert("auditLogs", { ownerId: OWNER_ID, entityType: "transaction", entityId: tx._id, action: "link_budget", summary: "Transaksi terpilih ditautkan ke budget subkategori", changedAt: Date.now() });
    return { linked: true, alreadyLinked: false };
  },
});

export const removeBudget = mutation({
  args: { id: v.id("budgets") },
  handler: async (ctx, args) => {
    const budget = await ctx.db.get(args.id);
    if (!budget || budget.ownerId !== OWNER_ID) throw new Error("Budget tidak ditemukan");
    await ctx.db.delete(args.id);
  },
});
