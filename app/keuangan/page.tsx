"use client";

import { useUrlTab } from "../components/useNavigationActions";
import { BudgetingTab } from "./BudgetingTab";
import { ExpensesTab } from "./ExpensesTab";
import { SavingsTab } from "./SavingsTab";

export type KeuanganTab = "budgeting" | "expenses" | "savings";

export default function KeuanganPage() {
  const [activeTab, setActiveTab] = useUrlTab<KeuanganTab>(["budgeting", "expenses", "savings"], "budgeting");

  return (
    <div className="feature-page">
      <div className="section-header">
        <div>
          <h1 className="section-title">Keuangan</h1>
          <p className="section-subtitle">
            Alokasi budget kebutuhan, catatan pengeluaran harian, dan pencapaian target saving
          </p>
        </div>
      </div>

      <div className="menu-tabs" role="tablist" aria-label="Navigasi Fitur Keuangan">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "budgeting"}
          className={`tab ${activeTab === "budgeting" ? "active" : ""}`}
          onClick={() => setActiveTab("budgeting")}
        >
          Budgeting
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "expenses"}
          className={`tab ${activeTab === "expenses" ? "active" : ""}`}
          onClick={() => setActiveTab("expenses")}
        >
          Pengeluaran
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "savings"}
          className={`tab ${activeTab === "savings" ? "active" : ""}`}
          onClick={() => setActiveTab("savings")}
        >
          Saving
        </button>
      </div>

      {activeTab === "budgeting" && (
        <BudgetingTab onGoSaving={() => setActiveTab("savings")} />
      )}
      {activeTab === "expenses" && (
        <ExpensesTab onGoBudgeting={() => setActiveTab("budgeting")} />
      )}
      {activeTab === "savings" && (
        <SavingsTab onGoBudgeting={() => setActiveTab("budgeting")} />
      )}
    </div>
  );
}
