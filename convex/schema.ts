import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Financial Transactions ──────────────────────────────────────────
  transactions: defineTable({
    ownerId: v.string(),
    kind: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    amountIdr: v.number(), // integer IDR, enforced in mutations
    occurredAt: v.number(), // epoch ms, Asia/Jakarta local date
    note: v.optional(v.string()),
    source: v.string(), // "manual", "chat", "api"
    voidedAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "occurredAt"])
    .index("by_owner_category", ["ownerId", "category"])
    .index("by_idempotency", ["ownerId", "idempotencyKey"]),

  // ─── Tasks & Reminders ──────────────────────────────────────────────
  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.optional(v.number()), // epoch ms
    remindAt: v.optional(v.number()), // epoch ms
    timezone: v.string(), // e.g. "Asia/Jakarta"
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    repeatRule: v.optional(v.string()), // "daily", "weekly", "monthly", or null
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_due", ["ownerId", "dueAt"])
    .index("by_remind", ["remindAt"]),

  // ─── Recipes ────────────────────────────────────────────────────────
  recipes: defineTable({
    ownerId: v.string(),
    name: v.string(),
    servings: v.number(), // integer
    instructions: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"]),

  // ─── Ingredients ────────────────────────────────────────────────────
  ingredients: defineTable({
    ownerId: v.string(),
    name: v.string(),
    unit: v.string(), // "gram", "ml", "buah", "bungkus", etc.
    currentPriceIdr: v.number(), // integer IDR
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_name", ["ownerId", "name"]),

  // ─── Recipe Ingredients (junction) ──────────────────────────────────
  recipeIngredients: defineTable({
    recipeId: v.id("recipes"),
    ingredientId: v.id("ingredients"),
    quantity: v.number(), // can be decimal (e.g. 1.5)
    unit: v.string(),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_ingredient", ["ingredientId"]),

  // ─── Meal Plans ─────────────────────────────────────────────────────
  mealPlans: defineTable({
    ownerId: v.string(),
    dateKeyLocal: v.string(), // "2026-10-15" in Asia/Jakarta
    recipeId: v.id("recipes"),
    servings: v.number(), // integer
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "dateKeyLocal"]),

  // ─── Shopping List Items ────────────────────────────────────────────
  shoppingListItems: defineTable({
    ownerId: v.string(),
    weekKey: v.string(), // e.g. "2026-W42"
    ingredientId: v.id("ingredients"),
    quantity: v.number(),
    unit: v.string(),
    checkedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner_week", ["ownerId", "weekKey"])
    .index("by_owner", ["ownerId"]),

  // ─── Notification Logs ──────────────────────────────────────────────
  notificationLogs: defineTable({
    ownerId: v.string(),
    taskId: v.optional(v.id("tasks")),
    channel: v.string(), // "dashboard", "whatsapp", "mock"
    scheduledAt: v.number(),
    sentAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    providerMessageId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    idempotencyKey: v.string(), // taskId + scheduledAt
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_task", ["taskId"]),

  // ─── Audit Logs ─────────────────────────────────────────────────────
  auditLogs: defineTable({
    ownerId: v.string(),
    entityType: v.string(), // "transaction", "task", "recipe", etc.
    entityId: v.string(),
    action: v.string(), // "create", "update", "void", "complete", etc.
    summary: v.string(), // human-readable summary, no sensitive data
    changedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_entity", ["entityType", "entityId"]),
});
