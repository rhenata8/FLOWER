import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const OWNER_ID = "default-user";

// ─── Mutations ─────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    remindAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    repeatRule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.title.trim()) {
      throw new Error("Judul tugas tidak boleh kosong");
    }

    const validRepeatRules = ["daily", "weekly", "monthly"];
    if (args.repeatRule && !validRepeatRules.includes(args.repeatRule)) {
      throw new Error(`repeatRule tidak valid: ${args.repeatRule}. Pilihan: ${validRepeatRules.join(", ")}`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      ownerId: OWNER_ID,
      title: args.title.trim(),
      description: args.description?.trim(),
      dueAt: args.dueAt,
      remindAt: args.remindAt,
      timezone: args.timezone ?? "Asia/Jakarta",
      status: "pending",
      repeatRule: args.repeatRule,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: id,
      action: "create",
      summary: `Tugas dibuat: ${args.title.trim()}`,
      changedAt: now,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    remindAt: v.optional(v.number()),
    repeatRule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== OWNER_ID) {
      throw new Error("Tugas tidak ditemukan");
    }

    if (args.title !== undefined && !args.title.trim()) {
      throw new Error("Judul tugas tidak boleh kosong");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) updates.title = args.title.trim();
    if (args.description !== undefined) updates.description = args.description.trim();
    if (args.dueAt !== undefined) updates.dueAt = args.dueAt;
    if (args.remindAt !== undefined) updates.remindAt = args.remindAt;
    if (args.repeatRule !== undefined) updates.repeatRule = args.repeatRule;

    await ctx.db.patch(args.id, updates);

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: args.id,
      action: "update",
      summary: `Tugas diperbarui: ${args.title ?? task.title}`,
      changedAt: now,
    });
  },
});

export const complete = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== OWNER_ID) {
      throw new Error("Tugas tidak ditemukan");
    }
    if (task.status !== "pending") {
      throw new Error("Hanya tugas pending yang bisa diselesaikan");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: args.id,
      action: "complete",
      summary: `Tugas diselesaikan: ${task.title}`,
      changedAt: now,
    });

    // Mark task as completed
  },
});

export const cancel = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== OWNER_ID) {
      throw new Error("Tugas tidak ditemukan");
    }
    if (task.status !== "pending") {
      throw new Error("Hanya tugas pending yang bisa dibatalkan");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: args.id,
      action: "cancel",
      summary: `Tugas dibatalkan: ${task.title}`,
      changedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== OWNER_ID) {
      throw new Error("Tugas tidak ditemukan");
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: args.id,
      action: "delete",
      summary: `Tugas dihapus: ${task.title}`,
      changedAt: Date.now(),
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== OWNER_ID) {
      throw new Error("Tugas tidak ditemukan");
    }

    const now = Date.now();
    const isCompleted = task.status === "completed";
    const nextStatus = isCompleted ? "pending" : "completed";

    await ctx.db.patch(args.id, {
      status: nextStatus,
      completedAt: nextStatus === "completed" ? now : undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: args.id,
      action: nextStatus === "completed" ? "complete" : "reopen",
      summary: nextStatus === "completed" ? `Tugas diselesaikan: ${task.title}` : `Tugas dibuka kembali: ${task.title}`,
      changedAt: now,
    });

    return nextStatus;
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }
    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "task",
      entityId: "all",
      action: "delete",
      summary: `Semua tugas (${tasks.length}) dibersihkan`,
      changedAt: Date.now(),
    });
    return tasks.length;
  },
});

// ─── Queries ───────────────────────────────────────────────────────────

export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", OWNER_ID).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .collect();
  },
});

export const getTodayTasks = query({
  args: {
    todayStart: v.number(), // epoch ms for today 00:00 Asia/Jakarta
    todayEnd: v.number(),   // epoch ms for today 23:59:59 Asia/Jakarta
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", OWNER_ID).eq("status", "pending")
      )
      .collect();

    const today: typeof tasks = [];
    const overdue: typeof tasks = [];
    const upcoming: typeof tasks = [];

    for (const task of tasks) {
      if (!task.dueAt) {
        upcoming.push(task); // no due date = upcoming
        continue;
      }
      if (task.dueAt < args.todayStart) {
        overdue.push(task);
      } else if (task.dueAt <= args.todayEnd) {
        today.push(task);
      } else {
        upcoming.push(task);
      }
    }

    return { today, overdue, upcoming };
  },
});

export const getDueReminders = query({
  args: {
    beforeTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_remind")
      .filter((q) =>
        q.and(
          q.eq(q.field("ownerId"), OWNER_ID),
          q.eq(q.field("status"), "pending"),
          q.neq(q.field("remindAt"), undefined),
          q.lte(q.field("remindAt"), args.beforeTime)
        )
      )
      .collect();
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────

function calculateNextDue(currentDue: number, rule: string): number {
  const date = new Date(currentDue);
  switch (rule) {
    case "daily":
      date.setDate(date.getDate() + 1);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      throw new Error(`Unknown repeat rule: ${rule}`);
  }
  return date.getTime();
}
