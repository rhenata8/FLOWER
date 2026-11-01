// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BudgetList, useBudgetMonth, type BudgetRow } from "../app/keuangan/BudgetList";

const rows = [
  { _id: "belanja", name: "Belanja", categoryId: "monthly", categoryName: "Monthly", amountIdr: 150000, spentIdr: 145000, remainingIdr: 5000 },
  { _id: "tissue", name: "Tissue", categoryId: "daily", categoryName: "Daily", amountIdr: 25000, spentIdr: 0, remainingIdr: 25000 },
] as BudgetRow[];
const props = () => ({ budgets: rows, monthKey: "2026-11", onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() });
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test("both styles show the same amounts, use icon actions and preserve device preference", async () => {
  const callbacks = props();
  const first = render(<BudgetList {...callbacks} />);
  expect(screen.getByText("Belanja").closest("article")?.textContent).toContain("Rp5.000");
  await userEvent.click(screen.getByRole("button", { name: "Edit budget Belanja" }));
  expect(callbacks.onEdit).toHaveBeenCalledWith(rows[0]);
  await userEvent.click(screen.getByRole("button", { name: "Tabel adaptif" }));
  expect(localStorage.getItem("flower-budget-view")).toBe("table");
  expect(screen.getByText("Belanja").closest("tr")?.textContent).toContain("Rp145.000");
  expect(screen.getByText("Belanja").closest("tr")?.textContent).toContain("Rp5.000");
  await userEvent.click(screen.getByRole("button", { name: "Hapus budget Belanja" }));
  expect(callbacks.onDelete).toHaveBeenCalledWith(rows[0]);
  first.unmount();
  render(<BudgetList {...props()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Tabel adaptif" }).getAttribute("aria-pressed")).toBe("true"));
});

test("category groups collapse, over-budget remains visible in both views", async () => {
  render(<BudgetList {...props()} budgets={[{ ...rows[0], spentIdr: 160000, remainingIdr: -10000 }]} />);
  expect(screen.getByText("Melebihi budget")).toBeTruthy();
  const group = screen.getByText("Monthly").closest("details")!;
  await userEvent.click(group.querySelector("summary")!);
  expect(group.open).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Tabel adaptif" }));
  expect(within(screen.getByRole("table")).getByText("Melebihi budget")).toBeTruthy();
});

test("an open page refreshes month at Jakarta midnight on the first", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-30T23:59:45+07:00"));
  function Month() { return <output>{useBudgetMonth()}</output>; }
  render(<Month />);
  expect(screen.getByText("2026-11")).toBeTruthy();
  act(() => { vi.advanceTimersByTime(30_000); });
  expect(screen.getByText("2026-12")).toBeTruthy();
});
