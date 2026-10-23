import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Constants ─────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = ["makanan", "transportasi", "belanja", "parkir", "tagihan"] as const;
const INCOME_CATEGORIES = ["gaji"] as const;
const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as const;

const OWNER_ID = "default-user"; // Single user for MVP

// ─── Helpers ───────────────────────────────────────────────────────────
function validateAmountIdr(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amountIdr harus bilangan bulat positif (integer > 0)");
  }
}

function validateCategory(kind: string, category: string): void {
  if (kind === "expense" && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Kategori pengeluaran tidak valid: ${category}. Pilihan: ${EXPENSE_CATEGORIES.join(", ")}`);
  }
  if (kind === "income" && !(INCOME_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Kategori pemasukan tidak valid: ${category}. Pilihan: ${INCOME_CATEGORIES.join(", ")}`);
  }
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
  },
  handler: async (ctx, args) => {
    validateAmountIdr(args.amountIdr);
    validateCategory(args.kind, args.category);

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
    const id = await ctx.db.insert("transactions", {
      ownerId: OWNER_ID,
      kind: args.kind,
      category: args.category,
      amountIdr: args.amountIdr,
      occurredAt: args.occurredAt,
      note: args.note,
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
      summary: `Transaksi ${args.kind} ${args.category}: Rp${args.amountIdr.toLocaleString("id-ID")}`,
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
    const category = args.category ?? tx.category;
    if (args.amountIdr !== undefined) validateAmountIdr(args.amountIdr);
    if (args.category !== undefined || args.kind !== undefined) {
      validateCategory(kind, category);
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.kind !== undefined) updates.kind = args.kind;
    if (args.category !== undefined) updates.category = args.category;
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
    let q = ctx.db
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
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", OWNER_ID)
          .gte("occurredAt", args.startDate)
          .lte("occurredAt", args.endDate)
      )
      .collect();

    const active = transactions.filter((tx) => !tx.voidedAt);

    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<string, number> = {};

    for (const tx of active) {
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
      byCategory,
      transactionCount: active.length,
    };
  },
});

export const getCategories = query({
  args: {},
  handler: async () => {
    return {
      expense: [...EXPENSE_CATEGORIES],
      income: [...INCOME_CATEGORIES],
      all: [...ALL_CATEGORIES],
    };
  },
});
