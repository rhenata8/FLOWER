import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const OWNER_ID = "default-user";

/**
 * Notification Provider Interface
 *
 * This module implements a provider-agnostic notification system.
 * Currently supports:
 * - "dashboard": Shows notifications in the dashboard UI (always active)
 * - "mock": Development-only mock provider (clearly labeled)
 * - "whatsapp": WhatsApp Business Cloud API (DISABLED until WABA restored)
 *
 * WhatsApp Status: Account disabled, pending Meta review.
 * DO NOT enable WhatsApp sending until official approval.
 *
 * Budget guard: Configurable monthly limit (default Rp50,000).
 * System fails closed if cost unknown or limit exceeded.
 */

// Budget configuration (stored as constants for MVP; move to env vars later)
const MONTHLY_BUDGET_IDR = 50_000;
const WHATSAPP_ENABLED = false; // MUST remain false until WABA restored

// ─── Send Notification ─────────────────────────────────────────────────

export const sendNotification = mutation({
  args: {
    taskId: v.optional(v.id("tasks")),
    channel: v.string(),
    scheduledAt: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check idempotency - prevent duplicate reminders
    const existing = await ctx.db
      .query("notificationLogs")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();

    if (existing) {
      return { status: "skipped", reason: "duplicate", logId: existing._id };
    }

    const now = Date.now();

    // Channel routing
    if (args.channel === "whatsapp") {
      if (!WHATSAPP_ENABLED) {
        const logId = await ctx.db.insert("notificationLogs", {
          ownerId: OWNER_ID,
          taskId: args.taskId,
          channel: "whatsapp",
          scheduledAt: args.scheduledAt,
          status: "skipped",
          errorCode: "CHANNEL_DISABLED",
          idempotencyKey: args.idempotencyKey,
          createdAt: now,
        });
        return { status: "skipped", reason: "WhatsApp belum aktif", logId };
      }

      // Budget check would go here
      // For now, fail closed
      const logId = await ctx.db.insert("notificationLogs", {
        ownerId: OWNER_ID,
        taskId: args.taskId,
        channel: "whatsapp",
        scheduledAt: args.scheduledAt,
        status: "failed",
        errorCode: "BUDGET_CHECK_FAILED",
        idempotencyKey: args.idempotencyKey,
        createdAt: now,
      });
      return { status: "failed", reason: "Budget check not implemented", logId };
    }

    if (args.channel === "mock") {
      // Development-only mock provider
      console.log(`[MOCK NOTIFICATION] Task: ${args.taskId}, Scheduled: ${new Date(args.scheduledAt).toISOString()}`);
      const logId = await ctx.db.insert("notificationLogs", {
        ownerId: OWNER_ID,
        taskId: args.taskId,
        channel: "mock",
        scheduledAt: args.scheduledAt,
        sentAt: now,
        status: "sent",
        providerMessageId: `mock-${now}`,
        idempotencyKey: args.idempotencyKey,
        createdAt: now,
      });
      return { status: "sent", logId };
    }

    // Dashboard notification (always active)
    const logId = await ctx.db.insert("notificationLogs", {
      ownerId: OWNER_ID,
      taskId: args.taskId,
      channel: "dashboard",
      scheduledAt: args.scheduledAt,
      sentAt: now,
      status: "sent",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });
    return { status: "sent", logId };
  },
});

// ─── Queries ───────────────────────────────────────────────────────────

export const getRecentNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("notificationLogs")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(args.limit ?? 20);

    // Enrich with task data
    return Promise.all(
      notifications.map(async (n) => {
        const task = n.taskId ? await ctx.db.get(n.taskId) : null;
        return { ...n, task };
      })
    );
  },
});

export const getBudgetStatus = query({
  args: {
    monthStart: v.number(),
    monthEnd: v.number(),
  },
  handler: async () => {
    // For MVP, return configuration and status
    return {
      monthlyBudgetIdr: MONTHLY_BUDGET_IDR,
      whatsappEnabled: WHATSAPP_ENABLED,
      usedIdr: 0, // No WhatsApp costs yet
      remainingIdr: MONTHLY_BUDGET_IDR,
      channels: {
        dashboard: { status: "active", description: "Notifikasi di dashboard" },
        whatsapp: { status: "disabled", description: "Menunggu review Meta WABA" },
        mock: { status: "development-only", description: "Mock provider untuk testing" },
      },
    };
  },
});
