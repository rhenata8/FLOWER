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
  const teamStatus = useQuery(api.hermes.getTeamStatus);
  const recentTransactions = useQuery(api.transactions.list, { startDate: range.start, endDate: range.end });
  const categories = summary ? Object.entries(summary.byCategory).sort(([, a], [, b]) => b - a) : [];
  const maxCategory = Math.max(1, ...categories.map(([, amount]) => amount));

  return (
    <div className="editorial-dashboard">
      <header className="dashboard-masthead">
        <div className="masthead-kicker"><span className="kicker-rule" /> Ruang personal <span className="kicker-dot" /> FLOWER / 01</div>
        <div className="masthead-date"><span>{dateNumber}</span><p>{dateLabel}</p></div>
      </header>

      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">CATATAN HARI INI</p>
          <h1 id="dashboard-title">Pelan-pelan,<br /><em>semua tertata.</em></h1>
        </div>
        <div className="intro-aside">
          <p>Ringkasan kecil untuk menjaga hal-hal penting tetap terlihat—keuangan, rutinitas, dan rencana hari ini.</p>
          <div className="period-control" role="group" aria-label="Periode ringkasan keuangan">
            <button type="button" className={rangeMode === "weekly" ? "period-button active" : "period-button"} aria-pressed={rangeMode === "weekly"} onClick={() => setRangeMode("weekly")}>Mingguan</button>
            <button type="button" className={rangeMode === "monthly" ? "period-button active" : "period-button"} aria-pressed={rangeMode === "monthly"} onClick={() => setRangeMode("monthly")}>Bulanan</button>
          </div>
        </div>
      </section>

      <section className="overview-grid" aria-label="Ringkasan keuangan">
        <article className="feature-panel">
          <div className="panel-topline"><span className="eyebrow">ARUS KEUANGAN</span><span className="panel-index">01 — 04</span></div>
          <div className="balance-block">
            <p className="metric-label">Saldo bersih periode ini</p>
            <p className="feature-value">{summary ? formatIdr(summary.netBalance) : <span className="skeleton skeleton-stat" />}</p>
          </div>
          <div className="money-pair">
            <div className="money-cell"><span className="metric-label">Pemasukan</span><strong>{summary ? formatIdr(summary.totalIncome) : <span className="skeleton skeleton-text" />}</strong><span className="money-mark">＋</span></div>
            <div className="money-cell"><span className="metric-label">Pengeluaran</span><strong>{summary ? formatIdr(summary.totalExpense) : <span className="skeleton skeleton-text" />}</strong><span className="money-mark">−</span></div>
          </div>
          <div className="feature-foot"><span>Periode {rangeMode === "weekly" ? "minggu ini" : "bulan ini"}</span><span className="foot-line" /><span>01</span></div>
        </article>

        <article className="category-panel">
          <div className="panel-heading"><div><p className="eyebrow">PECAHAN PENGELUARAN</p><h2>Ke mana<br />perginya.</h2></div><span className="panel-index">02</span></div>
          {categories.length ? (
            <div className="category-list">{categories.slice(0, 5).map(([category, amount], index) => (
              <div key={category} className="category-row">
                <div className="category-label-line"><span className="category-number">0{index + 1}</span><span className="category-bar-label">{category}</span><strong>{formatIdr(amount)}</strong></div>
                <div className="category-bar-track" aria-label={`${category}: ${formatIdr(amount)}`}><div className="category-bar-fill" style={{ width: `${(amount / maxCategory) * 100}%` }} /></div>
              </div>
            ))}</div>
          ) : summary ? <div className="quiet-empty"><span className="empty-index">—</span><div><strong>Belum ada pengeluaran</strong><p>Tambahkan transaksi untuk melihat ringkasan kategori.</p></div></div> : <div className="loading-lines"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /></div>}
          <div className="category-caption">Proporsi ditampilkan relatif terhadap kategori tertinggi.</div>
        </article>
      </section>

      <section className="day-grid" aria-label="Rencana hari ini">
        <article className="day-panel tasks-panel">
          <div className="panel-topline"><span className="eyebrow">DAFTAR HARI INI</span><span className="panel-index">03</span></div>
          <div className="section-heading-row"><h2>Yang perlu<br /><em>dibereskan.</em></h2>{todayTasks && <span className="count-stamp">{todayTasks.today.length.toString().padStart(2, "0")}<small>tugas</small></span>}</div>
          {todayTasks?.overdue && todayTasks.overdue.length > 0 && <div className="task-group"><p className="list-overline">TERLAMBAT <span>{todayTasks.overdue.length}</span></p>{todayTasks.overdue.slice(0, 3).map((task) => <div key={task._id} className="editorial-list-item overdue-item"><span className="list-marker">!</span><div className="list-copy"><strong>{task.title}</strong><span>{task.dueAt ? relativeTime(task.dueAt) : "Perlu ditinjau"}</span></div></div>)}</div>}
          {todayTasks?.today.length ? <div className="task-group">{todayTasks.today.map((task, index) => <div key={task._id} className="editorial-list-item"><span className="list-marker">{String(index + 1).padStart(2, "0")}</span><div className="list-copy"><strong>{task.title}</strong><span>{task.description ?? "Tugas hari ini"}</span></div><span className="list-end-mark">↗</span></div>)}</div> : todayTasks ? <div className="quiet-empty"><span className="empty-index">✓</span><div><strong>Ruang untuk bernapas.</strong><p>Tidak ada tugas hari ini. Kamu bisa menikmati jeda, atau menambahkan rencana baru.</p></div></div> : <div className="loading-lines"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /></div>}
        </article>

        <div className="side-stack">
          <article className="day-panel meals-panel">
            <div className="panel-topline"><span className="eyebrow">MEJA HARI INI</span><span className="panel-index">04</span></div>
            <h2>Menu yang<br /><em>direncanakan.</em></h2>
            {todayMeals?.length ? <div className="editorial-list">{todayMeals.map((mp, index) => <div key={mp._id} className="editorial-list-item"><span className="list-marker">{String(index + 1).padStart(2, "0")}</span><div className="list-copy"><strong>{mp.recipe?.name ?? "Resep dihapus"}</strong><span>{mp.servings} porsi</span></div></div>)}</div> : todayMeals ? <div className="quiet-empty compact-empty"><span className="empty-index">＋</span><div><strong>Belum ada menu hari ini</strong><p>Rencanakan menu dari halaman Menu.</p></div></div> : <div className="loading-lines"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /></div>}
          </article>
          <article className="day-panel transactions-panel">
            <div className="panel-topline"><span className="eyebrow">JEJAK TERBARU</span><span className="panel-index">{recentTransactions?.length.toString().padStart(2, "0") ?? "—"}</span></div>
            <h2>Transaksi<br /><em>terakhir.</em></h2>
            {recentTransactions?.length ? <div className="editorial-list">{recentTransactions.slice(0, 5).map((tx) => <div key={tx._id} className={`editorial-list-item ${tx.voidedAt ? "voided" : ""}`}><span className="list-marker">{tx.kind === "income" ? "+" : "−"}</span><div className="list-copy"><strong className="transaction-category">{tx.category}</strong><span>{tx.note ?? relativeTime(tx.occurredAt)}</span></div><span className="transaction-amount">{tx.kind === "expense" ? "−" : "+"}{formatIdr(tx.amountIdr)}</span></div>)}</div> : recentTransactions ? <div className="quiet-empty compact-empty"><span className="empty-index">—</span><div><strong>Belum ada transaksi</strong><p>Catat transaksi pertama di halaman Keuangan.</p></div></div> : <div className="loading-lines"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /></div>}
          </article>
        </div>
      </section>

      <section className="ai-editorial" aria-label="Status AI Team">
        <div className="ai-title-block"><p className="eyebrow">DI BALIK LAYAR</p><h2>Tim yang<br /><em>mendampingi.</em></h2><span className="ai-footnote">FLOWER / SISTEM PENDUKUNG</span></div>
        <div className="ai-content">{teamStatus && !teamStatus.hermesConnected && <span className="badge badge-disconnected">Belum tersambung</span>}{teamStatus ? <><p className="ai-message">{teamStatus.message}</p><div className="ai-role-list">{teamStatus.roles.map((role, index) => <div key={role.id} className="ai-role-row"><span className="role-index">0{index + 1}</span><div className="role-copy"><strong>{role.name}</strong><span>{role.description}</span></div><span className="role-state">{role.status === "not_connected" ? "Belum tersambung" : role.status}</span>{role.lastActivity && <span className="role-activity">Terakhir: {role.lastActivity}</span>}</div>)}</div></> : <div className="loading-lines"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text" /></div>}</div>
      </section>
      <footer className="dashboard-colophon"><span>FLOWER · RUANG UNTUK YANG PENTING</span><span>DIRANCANG UNTUK HARI INI</span></footer>
    </div>
  );
}
