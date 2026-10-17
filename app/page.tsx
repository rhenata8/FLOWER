"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  formatIdr,
  getCurrentWeekRange,
  getCurrentMonthRange,
  getTodayRange,
  todayKeyLocal,
  relativeTime,
} from "./lib/utils";
import { useState } from "react";

type RangeMode = "weekly" | "monthly";

export default function DashboardPage() {
  const [rangeMode, setRangeMode] = useState<RangeMode>("weekly");

  const weekRange = getCurrentWeekRange();
  const monthRange = getCurrentMonthRange();
  const todayRange = getTodayRange();
  const todayKey = todayKeyLocal();

  const range = rangeMode === "weekly" ? weekRange : monthRange;

  const summary = useQuery(api.transactions.getSummary, {
    startDate: range.start,
    endDate: range.end,
  });

  const todayTasks = useQuery(api.tasks.getTodayTasks, {
    todayStart: todayRange.start,
    todayEnd: todayRange.end,
  });

  const todayMeals = useQuery(api.meals.getMealPlanByDate, {
    dateKeyLocal: todayKey,
  });

  const teamStatus = useQuery(api.hermes.getTeamStatus);

  const recentTransactions = useQuery(api.transactions.list, {
    startDate: range.start,
    endDate: range.end,
  });

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">
            Selamat datang kembali! Ini ringkasan aktivitasmu 🌸
          </p>
        </div>
        <div className="tabs">
          <button
            className={`tab ${rangeMode === "weekly" ? "active" : ""}`}
            onClick={() => setRangeMode("weekly")}
          >
            Mingguan
          </button>
          <button
            className={`tab ${rangeMode === "monthly" ? "active" : ""}`}
            onClick={() => setRangeMode("monthly")}
          >
            Bulanan
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card animate-in">
          <div className="stat-card-icon income">📈</div>
          <div className="stat-card-label">Pemasukan</div>
          <div className="stat-card-value income">
            {summary ? formatIdr(summary.totalIncome) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
        <div className="stat-card animate-in" style={{ animationDelay: "50ms" }}>
          <div className="stat-card-icon expense">📉</div>
          <div className="stat-card-label">Pengeluaran</div>
          <div className="stat-card-value expense">
            {summary ? formatIdr(summary.totalExpense) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
        <div className="stat-card animate-in" style={{ animationDelay: "100ms" }}>
          <div className="stat-card-icon balance">💰</div>
          <div className="stat-card-label">Saldo Bersih</div>
          <div className="stat-card-value">
            {summary ? formatIdr(summary.netBalance) : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
        <div className="stat-card animate-in" style={{ animationDelay: "150ms" }}>
          <div className="stat-card-icon tasks">📋</div>
          <div className="stat-card-label">Tugas Hari Ini</div>
          <div className="stat-card-value">
            {todayTasks ? todayTasks.today.length : <span className="skeleton skeleton-stat" />}
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Category Breakdown */}
        <div className="card animate-in" style={{ animationDelay: "200ms" }}>
          <div className="card-header">
            <h2 className="card-title">Pengeluaran per Kategori</h2>
          </div>
          {summary && Object.keys(summary.byCategory).length > 0 ? (
            Object.entries(summary.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([category, amount]) => {
                const maxAmount = Math.max(...Object.values(summary.byCategory));
                const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                return (
                  <div key={category} className="category-bar">
                    <div className="category-bar-header">
                      <span className="category-bar-label">{category}</span>
                      <span className="category-bar-value">{formatIdr(amount)}</span>
                    </div>
                    <div className="category-bar-track">
                      <div className="category-bar-fill" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })
          ) : summary ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">Belum ada pengeluaran</div>
              <div className="empty-state-description">
                Tambahkan transaksi untuk melihat ringkasan kategori.
              </div>
            </div>
          ) : (
            <div>
              <div className="skeleton skeleton-text" style={{ width: "100%" }} />
              <div className="skeleton skeleton-text" style={{ width: "80%" }} />
              <div className="skeleton skeleton-text" style={{ width: "60%" }} />
            </div>
          )}
        </div>

        {/* Today&apos;s Tasks */}
        <div className="card animate-in" style={{ animationDelay: "250ms" }}>
          <div className="card-header">
            <h2 className="card-title">Tugas Hari Ini</h2>
            {todayTasks && todayTasks.overdue.length > 0 && (
              <span className="badge badge-overdue">
                {todayTasks.overdue.length} terlambat
              </span>
            )}
          </div>

          {/* Overdue */}
          {todayTasks && todayTasks.overdue.length > 0 && (
            <div style={{ marginBottom: "var(--space-md)" }}>
              <div className="card-subtitle" style={{ color: "var(--error)", marginBottom: "var(--space-sm)" }}>
                ⚠️ Terlambat
              </div>
              {todayTasks.overdue.slice(0, 3).map((task) => (
                <div key={task._id} className="list-item">
                  <div className="list-item-icon" style={{ background: "var(--error-bg)", color: "var(--error)" }}>
                    ⚠️
                  </div>
                  <div className="list-item-content">
                    <div className="list-item-title">{task.title}</div>
                    <div className="list-item-subtitle">
                      {task.dueAt ? relativeTime(task.dueAt) : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Today */}
          {todayTasks && todayTasks.today.length > 0 ? (
            todayTasks.today.map((task) => (
              <div key={task._id} className="list-item">
                <div className="list-item-icon" style={{ background: "var(--accent-50)", color: "var(--accent-600)" }}>
                  ✅
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-subtitle">{task.description ?? ""}</div>
                </div>
              </div>
            ))
          ) : todayTasks ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎉</div>
              <div className="empty-state-title">Tidak ada tugas hari ini</div>
              <div className="empty-state-description">
                Nikmati harimu! Atau tambahkan tugas baru.
              </div>
            </div>
          ) : (
            <div>
              <div className="skeleton skeleton-text" style={{ width: "100%" }} />
              <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            </div>
          )}
        </div>

        {/* Today&apos;s Menu */}
        <div className="card animate-in" style={{ animationDelay: "300ms" }}>
          <div className="card-header">
            <h2 className="card-title">Menu Hari Ini</h2>
            <span className="badge badge-accent">🍽️</span>
          </div>
          {todayMeals && todayMeals.length > 0 ? (
            todayMeals.map((mp) => (
              <div key={mp._id} className="list-item">
                <div className="list-item-icon" style={{ background: "var(--accent-50)", color: "var(--accent-600)" }}>
                  🍽️
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">{mp.recipe?.name ?? "Resep dihapus"}</div>
                  <div className="list-item-subtitle">{mp.servings} porsi</div>
                </div>
              </div>
            ))
          ) : todayMeals ? (
            <div className="empty-state">
              <div className="empty-state-icon">🍽️</div>
              <div className="empty-state-title">Belum ada menu hari ini</div>
              <div className="empty-state-description">
                Rencanakan menu untuk hari ini di halaman Menu.
              </div>
            </div>
          ) : (
            <div>
              <div className="skeleton skeleton-text" style={{ width: "100%" }} />
              <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card animate-in" style={{ animationDelay: "350ms" }}>
          <div className="card-header">
            <h2 className="card-title">Transaksi Terbaru</h2>
          </div>
          {recentTransactions && recentTransactions.length > 0 ? (
            recentTransactions.slice(0, 5).map((tx) => (
              <div key={tx._id} className={`list-item ${tx.voidedAt ? "voided" : ""}`}>
                <div
                  className="list-item-icon"
                  style={{
                    background: tx.kind === "income" ? "var(--income-bg)" : "var(--expense-bg)",
                    color: tx.kind === "income" ? "var(--income)" : "var(--expense)",
                  }}
                >
                  {tx.kind === "income" ? "📈" : "📉"}
                </div>
                <div className="list-item-content">
                  <div className="list-item-title" style={{ textTransform: "capitalize" }}>
                    {tx.category}
                  </div>
                  <div className="list-item-subtitle">{tx.note ?? relativeTime(tx.occurredAt)}</div>
                </div>
                <div className="list-item-right">
                  <div className={`list-item-amount ${tx.kind}`}>
                    {tx.kind === "expense" ? "-" : "+"}{formatIdr(tx.amountIdr)}
                  </div>
                </div>
              </div>
            ))
          ) : recentTransactions ? (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <div className="empty-state-title">Belum ada transaksi</div>
              <div className="empty-state-description">
                Catat transaksi pertamamu di halaman Keuangan.
              </div>
            </div>
          ) : (
            <div>
              <div className="skeleton skeleton-text" style={{ width: "100%" }} />
              <div className="skeleton skeleton-text" style={{ width: "80%" }} />
              <div className="skeleton skeleton-text" style={{ width: "60%" }} />
            </div>
          )}
        </div>
      </div>

      {/* AI Team Panel */}
      <div style={{ marginTop: "var(--space-xl)" }}>
        <div className="card animate-in" style={{ animationDelay: "400ms" }}>
          <div className="card-header">
            <h2 className="card-title">🤖 AI Team</h2>
            {teamStatus && !teamStatus.hermesConnected && (
              <span className="badge badge-disconnected">Belum tersambung</span>
            )}
          </div>

          {teamStatus ? (
            <>
              <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-tertiary)", marginBottom: "var(--space-lg)" }}>
                {teamStatus.message}
              </p>
              <div className="ai-team-grid">
                {teamStatus.roles.map((role) => (
                  <div key={role.id} className="ai-role-card">
                    <div className="ai-role-icon">
                      {role.id === "finance" ? "💰" : role.id === "meals" ? "🍽️" : "✅"}
                    </div>
                    <div className="ai-role-name">{role.name}</div>
                    <div className="ai-role-description">{role.description}</div>
                    <span className="badge badge-disconnected">
                      {role.status === "not_connected" ? "Belum tersambung" : role.status}
                    </span>
                    {role.lastActivity && (
                      <div className="ai-role-activity">
                        Terakhir: {role.lastActivity}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="ai-team-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="ai-role-card">
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "var(--radius-lg)", margin: "0 auto var(--space-sm)" }} />
                  <div className="skeleton skeleton-text" style={{ width: "60%", margin: "0 auto" }} />
                  <div className="skeleton skeleton-text" style={{ width: "80%", margin: "0 auto" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
