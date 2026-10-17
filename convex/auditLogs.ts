import { v } from "convex/values";
import { query } from "./_generated/server";

const OWNER_ID = "default-user";

export const list = query({
  args: {
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.entityType && args.entityId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", args.entityType!).eq("entityId", args.entityId!)
        )
        .order("desc")
        .take(args.limit ?? 50);
    }

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
