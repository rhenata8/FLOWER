import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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
  const budgets = await ctx.db.query("budgets").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(300);
  const matched = budgets.filter(b => b.name.trim().toLowerCase() === needle && b.categoryId);
  const categoryIds = new Set(matched.map(b => b.categoryId));
  if (categoryIds.size === 1) {
    const category = categories.find(c => c._id === matched[0].categoryId);
    if (category) return { name: category.name, item: matched[0].name };
  }
  return null;
}

export async function resolveBudgetSelection(
  ctx: QueryCtx,
  ownerId: string,
  categoryName: string,
  label: string,
  explicitId?: Id<"budgets">
) {
  const categories = await ctx.db.query("budgetCategories").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(200);
  const category = categories.find(c => c.name.toLowerCase() === categoryName.trim().toLowerCase());
  if (explicitId) {
    const budget = await ctx.db.get(explicitId);
    if (!budget || budget.ownerId !== ownerId || budget.categoryId !== category?._id) {
      throw new Error("Subkategori tidak sesuai dengan kategori transaksi");
    }
    return { budgetId: budget._id, subcategory: budget.name, options: [] };
  }
  const budgets = category ? await ctx.db.query("budgets").withIndex("by_category", q => q.eq("categoryId", category._id)).take(300) : [];
  const owned = budgets.filter(b => b.ownerId === ownerId);
  const needle = label.trim().toLowerCase();
  const exact = owned.filter(b => b.name.trim().toLowerCase() === needle);
  const matches = exact.length ? exact : needle === categoryName.trim().toLowerCase() ? owned : [];
  if (matches.length === 1) return { budgetId: matches[0]._id, subcategory: matches[0].name, options: [] };
  return {
    budgetId: undefined,
    subcategory: label.trim() && needle !== categoryName.toLowerCase() ? label.trim() : undefined,
    options: matches.map(b => ({ id: b._id, name: b.name })),
  };
}
