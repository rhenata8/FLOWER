import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { INCOME_CATEGORIES, isIncomeCategory, resolveExpenseCategory } from "./lib/categories";

const OWNER_ID = "default-user"; // Single user for MVP

// ─── Helpers ───────────────────────────────────────────────────────────
function validateAmountIdr(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amountIdr harus bilangan bulat positif (integer > 0)");
  }
}

/** Returns the canonical category name (and matched item) or throws. */
async function validateCategory(
  ctx: QueryCtx,
  kind: string,
  category: string
): Promise<{ name: string; item?: string }> {
  if (kind === "income") {
    const match = (INCOME_CATEGORIES as readonly string[]).find(
      (c) => c === category.trim().toLowerCase()
    );
    if (!match) {
      throw new Error(`Kategori pemasukan tidak valid: ${category}. Pilihan: ${INCOME_CATEGORIES.join(", ")}`);
    }
    return { name: match };
  }

  const resolved = await resolveExpenseCategory(ctx, category, OWNER_ID);
  if (!resolved) {
    throw new Error(
      `Kategori pengeluaran "${category}" belum ada. Buat dulu di Keuangan > Budgeting.`
    );
  }
  return resolved;
}

// ─── Mutations ─────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    kind: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    amountIdr: v.number(),
    occurredAt: v.number(),
    note: v.optional(v.string()),
    source: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    createCategory: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    validateAmountIdr(args.amountIdr);

    // Check idempotency
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_idempotency", (q) =>
          q.eq("ownerId", OWNER_ID).eq("idempotencyKey", args.idempotencyKey!)
        )
        .first();
      if (existing) {
        return existing._id;
      }
    }

    const now = Date.now();
    // Create the category and transaction atomically, including the first expense
    // in an empty account. Existing category names/aliases stay canonical.
    const categoryName = args.category.trim();
    if (args.kind === "expense" && args.createCategory) {
      if (!categoryName || isIncomeCategory(categoryName)) {
        throw new Error("Gunakan nama kategori pengeluaran yang berbeda dari kategori pemasukan");
      }
      if (!(await resolveExpenseCategory(ctx, categoryName, OWNER_ID))) {
        await ctx.db.insert("budgetCategories", {
          ownerId: OWNER_ID, name: categoryName, items: [], createdAt: now, updatedAt: now,
        });
      }
    }
    const resolved = await validateCategory(ctx, args.kind, categoryName);
    const id = await ctx.db.insert("transactions", {
      ownerId: OWNER_ID,
      kind: args.kind,
      category: resolved.name,
      amountIdr: args.amountIdr,
      occurredAt: args.occurredAt,
      note: args.note ?? resolved.item,
      source: args.source ?? "manual",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "transaction",
      entityId: id,
      action: "create",
      summary: `Transaksi ${args.kind} ${resolved.name}: Rp${args.amountIdr.toLocaleString("id-ID")}`,
      changedAt: now,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("transactions"),
    kind: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    category: v.optional(v.string()),
    amountIdr: v.optional(v.number()),
    occurredAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.ownerId !== OWNER_ID) {
      throw new Error("Transaksi tidak ditemukan");
    }
    if (tx.voidedAt) {
      throw new Error("Transaksi yang dibatalkan tidak bisa diedit");
    }

    const kind = args.kind ?? tx.kind;
    let category = args.category ?? tx.category;
    if (args.amountIdr !== undefined) validateAmountIdr(args.amountIdr);
    // Legacy rows may carry a category that no longer exists; only re-validate on change.
    if (kind !== tx.kind || category !== tx.category) {
      category = (await validateCategory(ctx, kind, category)).name;
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.kind !== undefined) updates.kind = args.kind;
    if (args.category !== undefined || kind !== tx.kind) updates.category = category;
    if (args.amountIdr !== undefined) updates.amountIdr = args.amountIdr;
    if (args.occurredAt !== undefined) updates.occurredAt = args.occurredAt;
    if (args.note !== undefined) updates.note = args.note;

    await ctx.db.patch(args.id, updates);

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "transaction",
      entityId: args.id,
      action: "update",
      summary: `Transaksi diperbarui`,
      changedAt: now,
    });
  },
});

export const voidTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.ownerId !== OWNER_ID) {
      throw new Error("Transaksi tidak ditemukan");
    }
    if (tx.voidedAt) {
      throw new Error("Transaksi sudah dibatalkan");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, { voidedAt: now, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "transaction",
      entityId: args.id,
      action: "void",
      summary: `Transaksi ${tx.kind} ${tx.category}: Rp${tx.amountIdr.toLocaleString("id-ID")} dibatalkan`,
      changedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.ownerId !== OWNER_ID) {
      throw new Error("Transaksi tidak ditemukan");
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "transaction",
      entityId: args.id,
      action: "delete",
      summary: `Transaksi ${tx.kind} ${tx.category}: Rp${tx.amountIdr.toLocaleString("id-ID")} dihapus permanen`,
      changedAt: Date.now(),
    });
  },
});

// ─── Queries ───────────────────────────────────────────────────────────

export const list = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    category: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    includeVoided: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("transactions")
      .withIndex("by_owner_date", (q) => {
        const query = q.eq("ownerId", OWNER_ID);
        if (args.startDate !== undefined && args.endDate !== undefined) {
          return query.gte("occurredAt", args.startDate).lte("occurredAt", args.endDate);
        }
        if (args.startDate !== undefined) {
          return query.gte("occurredAt", args.startDate);
        }
        if (args.endDate !== undefined) {
          return query.lte("occurredAt", args.endDate);
        }
        return query;
      })
      .order("desc");

    const results = await q.collect();

    return results.filter((tx) => {
      if (!args.includeVoided && tx.voidedAt) return false;
      if (args.category && tx.category !== args.category) return false;
      if (args.kind && tx.kind !== args.kind) return false;
      return true;
    });
  },
});

export const getSummary = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.startDate > args.endDate) throw new Error("Rentang tanggal tidak valid");
    // Include all prior transactions for carry-over. Never copy a balance into a
    // new transaction: edits, voids and deletes must also update later balances.
    const transactions = ctx.db
      .query("transactions")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID)
          .lte("occurredAt", args.endDate)
      );

    let totalIncome = 0;
    let totalExpense = 0;
    let openingBalance = 0;
    let transactionCount = 0;
    const byCategory: Record<string, number> = {};

    for await (const tx of transactions) {
      if (tx.voidedAt !== undefined) continue;
      if (tx.occurredAt < args.startDate) {
        openingBalance += tx.kind === "income" ? tx.amountIdr : -tx.amountIdr;
        continue;
      }
      transactionCount++;
      if (tx.kind === "income") {
        totalIncome += tx.amountIdr;
      } else {
        totalExpense += tx.amountIdr;
        byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amountIdr;
      }
    }

    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      openingBalance,
      closingBalance: openingBalance + totalIncome - totalExpense,
      byCategory,
      transactionCount,
    };
  },
});

export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("budgetCategories")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .take(200);
    const expense = categories.map((c) => c.name).sort((a, b) => a.localeCompare(b, "id"));
    const income = [...INCOME_CATEGORIES];
    return { expense, income, all: [...expense, ...income] };
  },
});
