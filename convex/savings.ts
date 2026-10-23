import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const OWNER_ID = "default-user";

function validatePositiveInt(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} harus bilangan bulat positif`);
  }
}

// ─── Savings goals ─────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const savings = await ctx.db
      .query("savings")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(200);

    return savings.map((s) => ({
      ...s,
      remainingIdr: Math.max(0, s.targetIdr - s.savedIdr),
      percent: Math.min(100, Math.round((s.savedIdr / s.targetIdr) * 100)),
      isDone: s.savedIdr >= s.targetIdr,
    }));
  },
});

export const create = mutation({
  args: { name: v.string(), targetIdr: v.number() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Nama tabungan tidak boleh kosong");
    validatePositiveInt(args.targetIdr, "Target tabungan");

    const now = Date.now();
    return await ctx.db.insert("savings", {
      ownerId: OWNER_ID,
      name,
      targetIdr: args.targetIdr,
      savedIdr: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("savings"),
    name: v.optional(v.string()),
    targetIdr: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const saving = await ctx.db.get(args.id);
    if (!saving || saving.ownerId !== OWNER_ID) throw new Error("Tabungan tidak ditemukan");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Nama tabungan tidak boleh kosong");
      updates.name = name;
    }
    if (args.targetIdr !== undefined) {
      validatePositiveInt(args.targetIdr, "Target tabungan");
      updates.targetIdr = args.targetIdr;
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("savings") },
  handler: async (ctx, args) => {
    const saving = await ctx.db.get(args.id);
    if (!saving || saving.ownerId !== OWNER_ID) throw new Error("Tabungan tidak ditemukan");

    const contributions = await ctx.db
      .query("savingContributions")
      .withIndex("by_saving", (q) => q.eq("savingId", args.id))
      .take(2000);
    for (const c of contributions) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Contributions (recorded from the Budgeting tab) ───────────────────

export const contribute = mutation({
  args: {
    savingId: v.id("savings"),
    amountIdr: v.number(),
    note: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validatePositiveInt(args.amountIdr, "Jumlah menabung");
    const saving = await ctx.db.get(args.savingId);
    if (!saving || saving.ownerId !== OWNER_ID) throw new Error("Tabungan tidak ditemukan");

    const now = Date.now();
    await ctx.db.insert("savingContributions", {
      ownerId: OWNER_ID,
      savingId: args.savingId,
      amountIdr: args.amountIdr,
      note: args.note?.trim() || undefined,
      occurredAt: args.occurredAt ?? now,
      createdAt: now,
    });
    await ctx.db.patch(args.savingId, {
      savedIdr: saving.savedIdr + args.amountIdr,
      updatedAt: now,
    });
  },
});

export const removeContribution = mutation({
  args: { id: v.id("savingContributions") },
  handler: async (ctx, args) => {
    const contribution = await ctx.db.get(args.id);
    if (!contribution || contribution.ownerId !== OWNER_ID) {
      throw new Error("Catatan menabung tidak ditemukan");
    }
    const saving = await ctx.db.get(contribution.savingId);
    if (saving) {
      await ctx.db.patch(saving._id, {
        savedIdr: Math.max(0, saving.savedIdr - contribution.amountIdr),
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(args.id);
  },
});

export const listContributions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const contributions = await ctx.db
      .query("savingContributions")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(Math.min(args.limit ?? 10, 100));

    return await Promise.all(
      contributions.map(async (c) => {
        const saving = await ctx.db.get(c.savingId);
        return { ...c, savingName: saving?.name ?? "Tabungan dihapus" };
      })
    );
  },
});
