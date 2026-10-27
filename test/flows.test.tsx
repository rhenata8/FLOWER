// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { QuickAddFab } from "../app/components/QuickAddFab";
import KeuanganPage from "../app/keuangan/page";
import MenuPage from "../app/menu/page";
import TugasPage from "../app/tugas/page";

const mocks = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue("tx-1") }));

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("test-location", notify);
    return () => window.removeEventListener("test-location", notify);
  };
  const router = {
    replace: (href: string) => {
      window.history.replaceState(null, "", href);
      window.dispatchEvent(new Event("test-location"));
    },
  };
  return {
    usePathname: () => window.location.pathname,
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  };
});

vi.mock("convex/react", () => ({
  useMutation: () => mocks.create,
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args?: { input?: string } | "skip") => {
    if (args === "skip") return undefined;
    switch (getFunctionName(ref)) {
      case "transactions:getSummary": return { openingBalance: 4_000_000, totalIncome: 0, totalExpense: 50_000, closingBalance: 3_950_000, netBalance: -50_000, byCategory: {}, transactionCount: 0 };
      case "transactions:getCategories": return { expense: ["Makanan"], income: ["gaji", "bonus", "lainnya"] };
      case "tasks:getTodayTasks": return { today: [], overdue: [], upcoming: [] };
      case "meals:getShoppingList": return { items: [], totalEstimatedCost: 0 };
      case "hermes:parseQuickTransaction": return args?.input
        ? { isValid: true, kind: "expense", category: "Belum dikategorikan", item: "obat flu", amountIdr: 25_000, needsCategory: true }
        : undefined;
      default: return [];
    }
  },
}));

function navigate(url: string) {
  act(() => {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("test-location"));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

test("quick actions link to the specific tab and create action", async () => {
  render(<QuickAddFab />);
  await userEvent.click(screen.getByRole("button", { name: "Tambah cepat" }));
  for (const [name, href] of [
    ["Catat Pengeluaran", "/keuangan?tab=expenses&action=create"],
    ["Tambah Bahan", "/menu?tab=ingredients&action=create"],
    ["Tambah Resep", "/menu?tab=recipes&action=create"],
    ["Tambah Tugas", "/tugas?action=create"],
  ]) expect(screen.getByRole("menuitem", { name }).getAttribute("href")).toBe(href);
});

test("expense quick action selects the tab, focuses input and can be used again on the same page", async () => {
  navigate("/keuangan?tab=expenses&action=create");
  render(<KeuanganPage />);
  const input = screen.getByRole("textbox", { name: "Input cepat transaksi" });
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(window.location.search).toBe("?tab=expenses");
  await userEvent.click(screen.getByRole("tab", { name: "Budgeting" }));
  expect(window.location.search).toBe("?tab=budgeting");
  navigate("/keuangan?tab=expenses&action=create");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Input cepat transaksi" })));
});

test("a new item can be saved with an inline custom category", async () => {
  navigate("/keuangan?tab=expenses");
  render(<KeuanganPage />);
  await userEvent.type(screen.getByRole("textbox", { name: "Input cepat transaksi" }), "obat flu 25000");
  await userEvent.click(screen.getByRole("combobox", { name: "Kategori pengeluaran baru" }));
  await userEvent.click(screen.getByRole("option", { name: "+ Buat kategori baru" }));
  expect((screen.getByRole("button", { name: "Catat" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.type(screen.getByRole("textbox", { name: "Nama kategori baru" }), "Kesehatan");
  await userEvent.click(screen.getByRole("button", { name: "Catat" }));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ category: "Kesehatan", createCategory: true, amountIdr: 25_000, note: "obat flu" }));
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Input cepat transaksi" }) as HTMLInputElement).value).toBe(""));
});

test("an unknown item can be recorded immediately or assigned to an existing category", async () => {
  navigate("/keuangan?tab=expenses");
  render(<KeuanganPage />);
  const input = screen.getByRole("textbox", { name: "Input cepat transaksi" });
  await userEvent.type(input, "obat flu 25000");
  await userEvent.click(screen.getByRole("button", { name: "Catat" }));
  expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Belum dikategorikan", createCategory: true }));
  await userEvent.type(input, "obat flu 25000");
  await userEvent.click(screen.getByRole("combobox", { name: "Kategori pengeluaran baru" }));
  await userEvent.click(screen.getByRole("option", { name: "Makanan" }));
  await userEvent.click(screen.getByRole("button", { name: "Catat" }));
  expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Makanan", note: "obat flu" }));
});

test("income/expense totals stay separate from carried and available balances", () => {
  navigate("/keuangan?tab=expenses");
  render(<KeuanganPage />);
  expect(screen.getByText("Saldo sebelumnya").parentElement?.textContent).toContain("Rp4.000.000");
  expect(screen.getByText("Saldo tersedia").parentElement?.textContent).toContain("Rp3.950.000");
});

test.each([
  ["ingredients", "Tambah Bahan Baru", "Contoh: Daging Ayam, Ikan Tongkol, Tempe"],
  ["recipes", "Tambah Resep Baru", "Contoh: Ayam Goreng Lengkuas, Sayur Sop, Nasi Goreng..."],
])("menu action opens and focuses the %s form, including after cancellation", async (tab, title, placeholder) => {
  navigate(`/menu?tab=${tab}&action=create`);
  render(<MenuPage />);
  await waitFor(() => expect(screen.queryByText(title)).not.toBeNull());
  expect(document.activeElement).toBe(screen.getByPlaceholderText(placeholder));
  expect(window.location.search).toBe(`?tab=${tab}`);
  await userEvent.click(screen.getAllByRole("button", { name: "Batal" })[0]);
  expect(screen.queryByText(title)).toBeNull();
  navigate(`/menu?tab=${tab}&action=create`);
  await waitFor(() => expect(screen.queryByText(title)).not.toBeNull());
});

test("task action opens a fresh task form and focuses its title", async () => {
  navigate("/tugas?action=create");
  render(<TugasPage />);
  const title = await screen.findByPlaceholderText("Contoh: Bayar tagihan listrik PLN");
  expect(document.activeElement).toBe(title);
  expect(window.location.search).toBe("");
});
