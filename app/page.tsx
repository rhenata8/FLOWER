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
import { useEffect, useState } from "react";

type RangeMode = "weekly" | "monthly";

export default function DashboardPage() {
  const [rangeMode, setRangeMode] = useState<RangeMode>("weekly");
  const [dateNumber, setDateNumber] = useState("—");
  const [dateLabel, setDateLabel] = useState("Memuat tanggal");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const now = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jakarta" };
      setDateNumber(new Intl.DateTimeFormat("id-ID", { ...dateOptions, day: "2-digit" }).format(now));
      setDateLabel(new Intl.DateTimeFormat("id-ID", { ...dateOptions, weekday: "long", month: "long", year: "numeric" }).format(now));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const weekRange = getCurrentWeekRange();
  const monthRange = getCurrentMonthRange();
  const todayRange = getTodayRange();
  const todayKey = todayKeyLocal();
  const range = rangeMode === "weekly" ? weekRange : monthRange;

  const summary = useQuery(api.transactions.getSummary, { startDate: range.start, endDate: range.end });
  const todayTasks = useQuery(api.tasks.getTodayTasks, { todayStart: todayRange.start, todayEnd: todayRange.end });
  const todayMeals = useQuery(api.meals.getMealPlanByDate, { dateKeyLocal: todayKey });
  const recentTransactions = useQuery(api.transactions.list, { startDate: range.start, endDate: range.end });

  const categories = summary ? Object.entries(summary.byCategory).sort(([, a], [, b]) => b - a) : [];
  const maxCategory = Math.max(1, ...categories.map(([, amount]) => amount));

  return (
    <div className="editorial-dashboard">
      <header className="dashboard-masthead" style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Ringkasan aktivitas dan keuangan</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div className="period-control" role="group" aria-label="Periode ringkasan keuangan">
            <button
              type="button"
              className={rangeMode === "weekly" ? "period-button active" : "period-button"}
              aria-pressed={rangeMode === "weekly"}
              onClick={() => setRangeMode("weekly")}
            >
              Mingguan
            </button>
            <button
              type="button"
              className={rangeMode === "monthly" ? "period-button active" : "period-button"}
              aria-pressed={rangeMode === "monthly"}
              onClick={() => setRangeMode("monthly")}
            >
              Bulanan
            </button>
          </div>
          <div className="masthead-date"><span>{dateNumber}</span><p>{dateLabel}</p></div>
        </div>
      </header>

      <section className="overview-grid" aria-label="Ringkasan keuangan">
        <article className="feature-panel">
          <div className="panel-topline"><span className="eyebrow">ARUS KEUANGAN</span></div>
          <div className="balance-block">
            <p className="metric-label">Saldo bersih periode ini</p>
            <div className="feature-value">
              {summary === undefined ? (
                <div className="skeleton skeleton-stat" />
              ) : (
                formatIdr(summary.netBalance)
              )}
            </div>
          </div>
          <div className="money-pair">
            <div className="money-cell">
              <span className="metric-label">Pemasukan</span>
              <strong>
                {summary === undefined ? (
                  <div className="skeleton skeleton-text" style={{ width: 80, height: 18 }} />
                ) : (
                  formatIdr(summary.totalIncome)
                )}
              </strong>
              <span className="money-mark">＋</span>
            </div>
            <div className="money-cell">
              <span className="metric-label">Pengeluaran</span>
              <strong>
                {summary === undefined ? (
                  <div className="skeleton skeleton-text" style={{ width: 80, height: 18 }} />
                ) : (
                  formatIdr(summary.totalExpense)
                )}
              </strong>
              <span className="money-mark">−</span>
            </div>
          </div>
          <div className="feature-foot">
            <span>Periode {rangeMode === "weekly" ? "minggu ini" : "bulan ini"}</span>
            <span className="foot-line" />
          </div>
        </article>

        <article className="category-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PECAHAN PENGELUARAN</p>
              <h2>Ke mana<br />perginya.</h2>
            </div>
          </div>
          {summary === undefined ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          ) : categories.length ? (
            <div className="category-list">
              {categories.slice(0, 5).map(([category, amount]) => (
                <div key={category} className="category-row">
                  <div className="category-label-line">
                    <span className="category-bar-label">{category}</span>
                    <strong>{formatIdr(amount)}</strong>
                  </div>
                  <div className="category-bar-track" aria-label={`${category}: ${formatIdr(amount)}`}>
                    <div className="category-bar-fill" style={{ width: `${(amount / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <span className="empty-index">—</span>
              <div>
                <strong>Belum ada pengeluaran</strong>
                <p>Tambahkan transaksi untuk melihat ringkasan kategori.</p>
              </div>
            </div>
          )}
          <div className="category-caption">Proporsi ditampilkan relatif terhadap kategori tertinggi.</div>
        </article>
      </section>

      <section className="day-grid" aria-label="Rencana hari ini" style={{ marginTop: 24 }}>
        <article className="day-panel tasks-panel">
          <div className="panel-topline"><span className="eyebrow">DAFTAR HARI INI</span></div>
          <div className="section-heading-row">
            <h2>Yang perlu<br /><em>dibereskan.</em></h2>
            {todayTasks && <span className="count-stamp">{todayTasks.today.length.toString().padStart(2, "0")}<small>tugas</small></span>}
          </div>
          {todayTasks?.overdue && todayTasks.overdue.length > 0 && (
            <div className="task-group">
              <p className="list-overline">TERLAMBAT <span>{todayTasks.overdue.length}</span></p>
              {todayTasks.overdue.slice(0, 3).map((task) => (
                <div key={task._id} className="editorial-list-item overdue-item">
                  <span className="list-marker">!</span>
                  <div className="list-copy">
                    <strong>{task.title}</strong>
                    <span>{task.dueAt ? relativeTime(task.dueAt) : "Perlu ditinjau"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {todayTasks === undefined ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          ) : todayTasks.today.length ? (
            <div className="task-group">
              {todayTasks.today.map((task) => (
                <div key={task._id} className="editorial-list-item">
                  <div className="list-copy">
                    <strong>{task.title}</strong>
                    <span>{task.description ?? "Tugas hari ini"}</span>
                  </div>
                  <span className="list-end-mark">↗</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <span className="empty-index">✓</span>
              <div>
                <strong>Ruang untuk bernapas.</strong>
                <p>Tidak ada tugas hari ini. Kamu bisa menikmati jeda, atau menambahkan rencana baru.</p>
              </div>
            </div>
          )}
        </article>

        <div className="side-stack">
          <article className="day-panel meals-panel">
            <div className="panel-topline"><span className="eyebrow">MEJA HARI INI</span></div>
            <h2>Menu yang<br /><em>direncanakan.</em></h2>
            {todayMeals === undefined ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
                <div className="skeleton skeleton-row" />
              </div>
            ) : todayMeals.length ? (
              <div className="editorial-list">
                {todayMeals.map((mp) => (
                  <div key={mp._id} className="editorial-list-item">
                    <div className="list-copy">
                      <strong>{mp.recipe?.name ?? "Resep dihapus"}</strong>
                      <span>{mp.servings} porsi</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="quiet-empty compact-empty">
                <span className="empty-index">＋</span>
                <div>
                  <strong>Belum ada menu hari ini</strong>
                  <p>Rencanakan menu dari halaman Menu.</p>
                </div>
              </div>
            )}
          </article>
          <article className="day-panel transactions-panel">
            <div className="panel-topline"><span className="eyebrow">JEJAK TERBARU</span></div>
            <h2>Transaksi<br /><em>terakhir.</em></h2>
            {recentTransactions === undefined ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            ) : recentTransactions.length ? (
              <div className="editorial-list">
                {recentTransactions.slice(0, 5).map((tx) => (
                  <div key={tx._id} className={`editorial-list-item ${tx.voidedAt ? "voided" : ""}`}>
                    <span className="list-marker">{tx.kind === "income" ? "+" : "−"}</span>
                    <div className="list-copy">
                      <strong className="transaction-category">{tx.category}</strong>
                      <span>{tx.note ?? relativeTime(tx.occurredAt)}</span>
                    </div>
                    <span className="transaction-amount">
                      {tx.kind === "expense" ? "−" : "+"}{formatIdr(tx.amountIdr)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="quiet-empty compact-empty">
                <span className="empty-index">—</span>
                <div>
                  <strong>Belum ada transaksi</strong>
                  <p>Catat transaksi pertama di halaman Keuangan.</p>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
