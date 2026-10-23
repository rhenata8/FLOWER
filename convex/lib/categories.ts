import type { QueryCtx } from "../_generated/server";

/** Income categories are fixed; expense categories are user-managed (budgetCategories). */
export const INCOME_CATEGORIES = ["gaji", "bonus", "lainnya"] as const;

export function isIncomeCategory(name: string): boolean {
  return (INCOME_CATEGORIES as readonly string[]).includes(name.trim().toLowerCase());
}

/**
 * Resolve free text ("makanan", "tissue") to a user-defined expense category.
 * Matches the category name first, then any item listed inside a category.
 */
export async function resolveExpenseCategory(
  ctx: QueryCtx,
  raw: string,
  ownerId: string
): Promise<{ name: string; item?: string } | null> {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  const categories = await ctx.db
    .query("budgetCategories")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(200);

  const byName = categories.find((c) => c.name.trim().toLowerCase() === needle);
  if (byName) return { name: byName.name };

  for (const category of categories) {
    const item = category.items.find((i) => i.trim().toLowerCase() === needle);
    if (item) return { name: category.name, item };
  }
  return null;
}
