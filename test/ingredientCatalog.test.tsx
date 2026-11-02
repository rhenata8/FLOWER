// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeIngredientCatalog } from "../app/menu/RecipeIngredientCatalog";
import type { Doc, Id } from "../convex/_generated/dataModel";
const mocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.add }));
const ingredient = (id: string, name: string, unit: string, kind: "harian" | "mingguan" = "harian", usagePerCook?: number) => ({ _id: id, _creationTime: 0, ownerId: "default-user", name, unit, kind, usagePerCook, currentPriceIdr: 100, updatedAt: 0 }) as Doc<"ingredients">;
const ingredients = [ingredient("ayam", "Dada ayam", "kg"), ingredient("bawang", "Bawang putih", "siung", "mingguan", 3), ingredient("garam", "Garam", "gram")];
const recipe = { _id: "recipe" as Id<"recipes">, name: "Taichan" };
beforeEach(() => { mocks.add.mockReset(); mocks.add.mockResolvedValue({ addedCount: 2, skippedCount: 0 }); });
afterEach(cleanup);

test("search and frequency filters preserve selections; stored units and quantities are submitted together", async () => {
  const user = userEvent.setup();
  render(<RecipeIngredientCatalog recipe={recipe} lines={[]} ingredients={ingredients} onClose={vi.fn()} onRemove={vi.fn()} />);
  await user.click(screen.getByRole("checkbox", { name: "Pilih Dada ayam (kg)" }));
  await user.type(screen.getByRole("spinbutton", { name: "Takaran Dada ayam" }), "0.5");
  await user.type(screen.getByRole("searchbox"), "BAWANG");
  expect(screen.queryByRole("checkbox", { name: "Pilih Dada ayam (kg)" })).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: "Pilih Bawang putih (siung)" }));
  expect((screen.getByRole("spinbutton", { name: "Takaran Bawang putih" }) as HTMLInputElement).value).toBe("3");
  await user.click(screen.getByRole("button", { name: "harian" }));
  expect(screen.getByText(/Tidak ada bahan yang cocok/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Tambahkan 2 bahan" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledWith({ recipeId: "recipe", items: [{ ingredientId: "ayam", quantity: .5 }, { ingredientId: "bawang", quantity: 3 }] }));
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "2 bahan ditambahkan.");
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

test("existing ingredients cannot be selected again; failed saves retain quantities for retry", async () => {
  const user = userEvent.setup();
  mocks.add.mockRejectedValueOnce(new Error("Koneksi gagal"));
  render(<RecipeIngredientCatalog recipe={recipe} lines={[{ _id: "line" as Id<"recipeIngredients">, ingredientId: ingredients[2]._id, name: "Garam", quantity: 2, unit: "gram", costIdr: 200 }]} ingredients={ingredients} onClose={vi.fn()} onRemove={vi.fn()} />);
  expect((screen.getByRole("checkbox", { name: "Pilih Garam (gram)" }) as HTMLInputElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: "Pilih Dada ayam (kg)" }));
  expect((screen.getByRole("button", { name: "Tambahkan 1 bahan" }) as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByRole("spinbutton", { name: "Takaran Dada ayam" }), "0.5");
  await user.click(screen.getByRole("button", { name: "Tambahkan 1 bahan" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Koneksi gagal");
  expect((screen.getByRole("spinbutton", { name: "Takaran Dada ayam" }) as HTMLInputElement).value).toBe("0.5");
  expect((screen.getByRole("button", { name: "Tambahkan 1 bahan" }) as HTMLButtonElement).disabled).toBe(false);
});

test("pending saves block repeated submissions and closing; Escape restores previous focus", async () => {
  const user = userEvent.setup();
  let finish!: (result: { addedCount: number; skippedCount: number }) => void;
  mocks.add.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const onClose = vi.fn();
  render(<RecipeIngredientCatalog recipe={recipe} lines={[]} ingredients={ingredients} onClose={onClose} onRemove={vi.fn()} />);
  expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  await user.click(screen.getByRole("checkbox", { name: "Pilih Bawang putih (siung)" }));
  await user.click(screen.getByRole("button", { name: "Tambahkan 1 bahan" }));
  await user.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Selesai" }) as HTMLButtonElement).disabled).toBe(true);
  expect(mocks.add).toHaveBeenCalledTimes(1);
  finish({ addedCount: 1, skippedCount: 0 });
  await screen.findByRole("status");
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});
