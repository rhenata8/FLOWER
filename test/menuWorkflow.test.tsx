// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MenuCandidate } from "../lib/mealPlanning";
import { todayKeyLocal } from "../app/lib/utils";
import { NewRecipeForm } from "../app/menu/NewRecipeForm";
import { ShoppingTab } from "../app/menu/ShoppingTab";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), approve: vi.fn(), check: vi.fn(), listeners: new Set<() => void>(), version: 0,
  shopping: null as null | Record<string, unknown>, candidates: [] as MenuCandidate[],
  proposal: undefined as unknown, queries: [] as { name: string; args: unknown }[],
}));
vi.mock("convex/react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "meals:createRecipe" ? mocks.create : getFunctionName(ref) === "meals:applyWeeklyMenu" ? mocks.approve : mocks.check,
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      useSyncExternalStore(notify => { mocks.listeners.add(notify); return () => { mocks.listeners.delete(notify); }; }, () => mocks.version);
      if (args === "skip") return undefined;
      const name = getFunctionName(ref); mocks.queries.push({ name, args });
      if (name === "meals:getActiveShoppingList") return mocks.shopping;
      if (name === "meals:listMenuCandidates") return mocks.candidates;
      if (name === "meals:proposeWeeklyMenu") return mocks.proposal;
      return undefined;
    },
  };
});
const ingredient = { _id: "garlic", _creationTime: 0, ownerId: "default-user", name: "Bawang", unit: "siung", kind: "mingguan", currentPriceIdr: 1000, packageContent: 10, packagePriceIdr: 10000, usagePerCook: 2, updatedAt: 0 } as Doc<"ingredients">;
const start = todayKeyLocal();
const dates = Array.from({ length: 7 }, (_, i) => new Date(new Date(`${start}T00:00:00Z`).getTime() + i * 86400000).toISOString().slice(0,10));
const candidate = (id: string, name: string, quantity: number): MenuCandidate => ({ recipeId: id as Id<"recipes">, name, servings: 2, costIdr: quantity * 1000, needs: [{ ingredientId: ingredient._id, quantity, ingredient }] });

beforeEach(() => {
  mocks.create.mockReset(); mocks.approve.mockReset(); mocks.check.mockReset(); mocks.shopping = null; mocks.queries = [];
  mocks.candidates = [candidate("sop", "Sop", 2), candidate("tumis", "Tumis", 3), candidate("mahal", "Mahal", 200)];
  mocks.proposal = { status: "ok", days: dates.map(dateKeyLocal => ({ dateKeyLocal, recipeId: "sop", recipeName: "Sop", servings: 2, costIdr: 2000 })), totalIdr: 20000, remainingIdr: 100000, signature: Array(7).fill("sop").join(","), sameAsPrevious: false };
  mocks.create.mockResolvedValue("new-recipe");
  mocks.approve.mockImplementation(async (args: { startDate: string }) => {
    mocks.shopping = { startDate: args.startDate, endDate: dates[6], totalEstimatedCost: 20000, items: [{ _id: "item", ingredient, unit: "siung", quantity: 15, requiredQuantity: 15, requiredPackages: 1.5, packagesToBuy: 2, purchaseQuantity: 20, estimatedCostIdr: 20000 }] };
    mocks.version++; mocks.listeners.forEach(notify => notify());
    return { startDate: args.startDate, endDate: dates[6], totalIdr: 20000 };
  });
});
afterEach(cleanup);

test("new recipe includes ingredients before its single save, and cancellation writes nothing", async () => {
  const user = userEvent.setup(), onSaved = vi.fn(), onCancel = vi.fn();
  render(<NewRecipeForm ingredients={[ingredient]} onSaved={onSaved} onCancel={onCancel} />);
  await user.type(screen.getByRole("textbox", { name: "Nama resep" }), "Taichan");
  expect((screen.getByRole("button", { name: "Simpan resep & bahan" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: "Pilih Bawang (siung)" }));
  expect((screen.getByRole("spinbutton", { name: "Takaran Bawang" }) as HTMLInputElement).value).toBe("2");
  expect(mocks.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Batal" }));
  expect(onCancel).toHaveBeenCalledOnce(); expect(mocks.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Simpan resep & bahan" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith({ name: "Taichan", servings: 2, instructions: undefined, ingredients: [{ ingredientId: "garlic", quantity: 2 }] });
});

test("failed recipe saves retain draft ingredients and quantities", async () => {
  const user = userEvent.setup(); mocks.create.mockRejectedValue(new Error("Koneksi gagal"));
  render(<NewRecipeForm ingredients={[ingredient]} onSaved={vi.fn()} onCancel={vi.fn()} />);
  await user.type(screen.getByRole("textbox", { name: "Nama resep" }), "Taichan");
  await user.click(screen.getByRole("checkbox", { name: "Pilih Bawang (siung)" }));
  await user.click(screen.getByRole("button", { name: "Simpan resep & bahan" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Koneksi gagal");
  expect((screen.getByRole("spinbutton", { name: "Takaran Bawang" }) as HTMLInputElement).value).toBe("2");
});

test("manual and random replacements affect one day; whole-menu regeneration remains available", async () => {
  const user = userEvent.setup(); render(<ShoppingTab />);
  await user.click(screen.getByRole("button", { name: "Generate Menu" }));
  await user.click(screen.getByRole("button", { name: `Pilih resep untuk ${dates[0]}` }));
  const first = within(screen.getByRole("region", { name: `Menu ${dates[0]}` }));
  expect((first.getByRole("button", { name: /^Mahal / }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(first.getByRole("button", { name: /^Tumis / }));
  expect(first.getByRole("heading", { name: "Tumis" })).toBeTruthy();
  for (const date of dates.slice(1)) expect(within(screen.getByRole("region", { name: `Menu ${date}` })).getByRole("heading", { name: "Sop" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: `Acak menu ${dates[1]}` }));
  expect(within(screen.getByRole("region", { name: `Menu ${dates[1]}` })).getByRole("heading", { name: "Tumis" })).toBeTruthy();
  for (const date of dates.slice(2)) expect(within(screen.getByRole("region", { name: `Menu ${date}` })).getByRole("heading", { name: "Sop" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Ganti semua menu" }));
  expect(mocks.queries.filter(query => query.name === "meals:proposeWeeklyMenu").at(-1)?.args).toMatchObject({ avoid: ["tumis","tumis",...Array(5).fill("sop")].join(",") });
  expect(screen.getAllByRole("heading", { name: "Sop" })).toHaveLength(7);
});

test("approval shows the combined purchase list and total without navigating away", async () => {
  const user = userEvent.setup(); render(<ShoppingTab />);
  await user.click(screen.getByRole("button", { name: "Generate Menu" }));
  await user.click(screen.getByRole("button", { name: `Acak menu ${dates[0]}` }));
  await user.click(screen.getByRole("button", { name: "Setuju & lihat belanja" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByText("Beli 2 kemasan")).toBeTruthy();
  expect(screen.getByText("Dibutuhkan 15 siung")).toBeTruthy();
  expect(screen.getByText(/Kebutuhan 1,5 kemasan/)).toBeTruthy();
  expect(screen.getByText(/Total dibeli 20 siung · sisa 5 siung/)).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Sudah beli Bawang" })).toBeTruthy();
  expect(mocks.approve).toHaveBeenCalledWith({ startDate: start, budgetIdr: 120000, entries: dates.map((dateKeyLocal,i) => ({ dateKeyLocal, recipeId: i === 0 ? "tumis" : "sop" })) });
});

test("failed approval keeps the edited proposal open for retry", async () => {
  const user = userEvent.setup(); mocks.approve.mockRejectedValue(new Error("Harga berubah, melebihi budget"));
  render(<ShoppingTab />); await user.click(screen.getByRole("button", { name: "Generate Menu" }));
  await user.click(screen.getByRole("button", { name: `Acak menu ${dates[0]}` }));
  await user.click(screen.getByRole("button", { name: "Setuju & lihat belanja" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Harga berubah, melebihi budget");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: `Menu ${dates[0]}` })).getByRole("heading", { name: "Tumis" })).toBeTruthy();
});
