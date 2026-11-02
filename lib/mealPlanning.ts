import type { Id } from "../convex/_generated/dataModel";

export type IngredientPrice = {
  name: string;
  unit: string;
  kind?: "harian" | "mingguan" | "bulanan";
  currentPriceIdr: number;
  packagePriceIdr?: number;
  packageContent?: number;
};
export type MenuCandidate = {
  recipeId: Id<"recipes">;
  name: string;
  servings: number;
  costIdr: number;
  needs: { ingredientId: Id<"ingredients">; quantity: number; ingredient: IngredientPrice }[];
};

// Remove floating point noise before rounding up whole purchase packages.
export const quantityValue = (quantity: number) => Number(quantity.toPrecision(12));
export function purchaseEstimate(ingredient: IngredientPrice | null, quantity: number) {
  const requiredQuantity = quantityValue(quantity);
  const packaged = ingredient && ingredient.kind !== "harian" && ingredient.kind !== undefined &&
    Number.isFinite(ingredient.packageContent) && (ingredient.packageContent ?? 0) > 0 &&
    Number.isFinite(ingredient.packagePriceIdr) && (ingredient.packagePriceIdr ?? 0) > 0;
  const requiredPackages = packaged ? requiredQuantity / ingredient.packageContent! : null;
  const packagesToBuy = requiredPackages === null ? null : Math.ceil(quantityValue(requiredPackages));
  return {
    requiredQuantity,
    requiredPackages,
    packagesToBuy,
    purchaseQuantity: packagesToBuy === null ? requiredQuantity : quantityValue(packagesToBuy * ingredient!.packageContent!),
    estimatedCostIdr: packagesToBuy === null ? Math.round(requiredQuantity * (ingredient?.currentPriceIdr ?? 0)) : packagesToBuy * ingredient!.packagePriceIdr!,
  };
}

export function planShopping(plan: MenuCandidate[]) {
  const needs = new Map<string, { ingredientId: Id<"ingredients">; ingredient: IngredientPrice; quantity: number }>();
  for (const candidate of plan) for (const need of candidate.needs) {
    const key = `${need.ingredientId}:${need.ingredient.unit}`;
    const previous = needs.get(key);
    needs.set(key, { ingredientId: need.ingredientId, ingredient: need.ingredient, quantity: (previous?.quantity ?? 0) + need.quantity });
  }
  const items = [...needs.values()].map(need => ({ ...need, ...purchaseEstimate(need.ingredient, need.quantity) }));
  return { items, totalIdr: items.reduce((sum, item) => sum + item.estimatedCostIdr, 0) };
}
