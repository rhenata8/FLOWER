"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { planShopping } from "../../lib/mealPlanning";
import { formatIdr, formatDateKeyLong, todayKeyLocal, WEEKLY_MENU_BUDGET_IDR } from "../lib/utils";
import "./meal-workflow.css";

const number = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 6 });
export function ShoppingTab() {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKeyLocal);
  const [seed, setSeed] = useState(1);
  const [avoid, setAvoid] = useState<string | undefined>();
  const [overrides, setOverrides] = useState<Record<string, Id<"recipes">>>({});
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dayMessage, setDayMessage] = useState<{ date: string; text: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedStart, setSavedStart] = useState<string | null>(null);
  const shopping = useQuery(api.meals.getActiveShoppingList, {});
  const proposal = useQuery(api.meals.proposeWeeklyMenu, open ? { startDate, seed, avoid, budgetIdr: WEEKLY_MENU_BUDGET_IDR } : "skip");
  const candidates = useQuery(api.meals.listMenuCandidates, open ? {} : "skip");
  const approve = useMutation(api.meals.applyWeeklyMenu);
  const check = useMutation(api.meals.checkShoppingItem);
  const checking = useRef(new Set<string>());
  const [checkError, setCheckError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending.current) setOpen(false);
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  const available = candidates ?? [];
  const days = proposal?.status === "ok" ? proposal.days : [];
  const plan = days.flatMap(day => {
    const candidate = available.find(item => item.recipeId === (overrides[day.dateKeyLocal] ?? day.recipeId));
    return candidate ? [candidate] : [];
  });
  const complete = plan.length === 7;
  const total = planShopping(plan).totalIdr;
  const withinBudget = complete && total <= WEEKLY_MENU_BUDGET_IDR;
  const waitingForList = shopping === undefined || Boolean(savedStart && shopping?.startDate !== savedStart);
  const openGenerator = () => {
    setStartDate(todayKeyLocal()); setSeed(Date.now()); setAvoid(undefined); setOverrides({});
    setError(null); setDayMessage(null); setEditingDay(null); setOpen(true);
  };
  const reroll = () => {
    setAvoid(complete ? plan.map(item => item.recipeId).join(",") : undefined);
    setSeed(current => current + 1); setOverrides({}); setError(null); setEditingDay(null); setDayMessage(null);
  };
  const apply = async () => {
    if (!withinBudget || pending.current) return;
    pending.current = true; setApplying(true); setError(null);
    try {
      const result = await approve({ startDate, budgetIdr: WEEKLY_MENU_BUDGET_IDR, entries: days.map((day, index) => ({ dateKeyLocal: day.dateKeyLocal, recipeId: plan[index].recipeId })) });
      setSavedStart(result.startDate); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyetujui menu"); }
    finally { pending.current = false; setApplying(false); }
  };
  return <div className="shopping-workflow">
    <div className="card">
      <div className="card-header"><div><h2 className="card-title">Daftar belanja 7 hari</h2><p className="card-subtitle">{shopping?.startDate && shopping.endDate ? `${formatDateKeyLong(shopping.startDate)} – ${formatDateKeyLong(shopping.endDate)}` : "Gabungan semua bahan dari menu yang disetujui"}</p></div><button type="button" className="btn btn-primary" onClick={openGenerator}>Generate Menu</button></div>
      {savedStart && !waitingForList && <p className="menu-success" role="status">Menu disetujui. Ini semua bahan yang perlu dibeli untuk 7 hari.</p>}
      {waitingForList ? <div className="skeleton skeleton-row" aria-label="Memuat daftar belanja" /> : shopping?.items.length ? <>
        <div className="shopping-total"><span>Total estimasi pembelian</span><strong>{formatIdr(shopping.totalEstimatedCost)}</strong><small>Kemasan dibulatkan ke atas agar kebutuhan seminggu terpenuhi.</small></div>
        <ul className="shopping-needs">{shopping.items.map(item => <li key={item._id} className={item.checkedAt ? "is-bought" : ""}>
          <label className="shopping-check"><input type="checkbox" aria-label={`Sudah beli ${item.ingredient?.name ?? "bahan"}`} checked={Boolean(item.checkedAt)} onChange={async () => {
            if (checking.current.has(item._id)) return;
            checking.current.add(item._id); setCheckError(null);
            try { await check({ id: item._id }); } catch (err) { setCheckError(err instanceof Error ? err.message : "Gagal memperbarui checklist"); }
            finally { checking.current.delete(item._id); }
          }} /><span><strong>{item.ingredient?.name ?? "Bahan sudah dihapus"}</strong><small>Dibutuhkan {number(item.requiredQuantity)} {item.unit}</small></span></label>
          <div className="shopping-purchase">{item.packagesToBuy !== null ? <><strong>Beli {number(item.packagesToBuy)} kemasan</strong><small>Kebutuhan {number(item.requiredPackages!)} kemasan · isi {number(item.ingredient?.packageContent ?? 0)} {item.unit}/kemasan</small><small>Total dibeli {number(item.purchaseQuantity)} {item.unit} · sisa {number(item.purchaseQuantity - item.requiredQuantity)} {item.unit}</small></> : <strong>Beli {number(item.purchaseQuantity)} {item.unit}</strong>}</div>
          <strong className="shopping-price">{formatIdr(item.estimatedCostIdr)}</strong>
        </li>)}</ul>
      </> : <div className="empty-state"><div className="empty-state-title">Daftar belanja masih kosong</div><p className="empty-state-description">Generate menu, sesuaikan tiap hari, lalu setujui untuk membuat daftar belanja 7 hari.</p></div>}
      {checkError && <p className="form-error" role="alert">{checkError}</p>}
    </div>
    {open && <div className="modal-overlay"><div className="modal menu-generator" role="dialog" aria-modal="true" aria-labelledby="menu-generator-title" tabIndex={-1} ref={dialog}>
      <header><h2 id="menu-generator-title" className="card-title">Rencana menu 7 hari</h2><p className="card-subtitle">Mulai {formatDateKeyLong(startDate)} · maksimal {formatIdr(WEEKLY_MENU_BUDGET_IDR)} untuk pembelian bahan</p></header>
      <div className="menu-generator-body">
        {proposal === undefined || candidates === undefined ? <p className="catalog-empty">Menghitung menu dan kebutuhan belanja…</p> : proposal.status === "no_recipes" ? <p className="catalog-empty">Belum ada resep siap pakai. Buat resep beserta bahan dan takarannya di tab Resep.</p> : proposal.status === "over_budget" ? <p className="form-error" role="alert">Belum ditemukan kombinasi dalam budget. Estimasi terendah yang ditemukan {formatIdr(proposal.minimumTotalIdr)}, termasuk pembelian kemasan utuh. Tambahkan resep lebih hemat atau rapikan harga bahan.</p> : !complete ? <p className="form-error" role="alert">Ada resep yang berubah atau tidak tersedia. Ganti semua menu untuk menghitung ulang.</p> : <>
          <p className="menu-cost-note">Biaya masak per hari dihitung dari bahan terpakai. Total belanja di bawah mengikuti jumlah kemasan yang perlu dibeli.</p>
          <div className="menu-day-list">{days.map((day, index) => {
            const current = plan[index];
            const alternatives = available.map(candidate => ({ candidate, total: planShopping(plan.map((item, i) => i === index ? candidate : item)).totalIdr }));
            return <section key={day.dateKeyLocal} className="menu-day" aria-label={`Menu ${day.dateKeyLocal}`}>
              <div className="menu-day-heading"><div><small>{formatDateKeyLong(day.dateKeyLocal)}</small><h3>{current.name}</h3><span>{current.servings} porsi · biaya masak {formatIdr(current.costIdr)}</span></div><div className="menu-day-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={applying} onClick={() => { setEditingDay(editingDay === day.dateKeyLocal ? null : day.dateKeyLocal); setSearch(""); }} aria-expanded={editingDay === day.dateKeyLocal} aria-label={`Pilih resep untuk ${day.dateKeyLocal}`}>Pilih resep</button><button type="button" className="btn btn-ghost btn-sm" disabled={applying} aria-label={`Acak menu ${day.dateKeyLocal}`} onClick={() => {
                const options = alternatives.filter(option => option.candidate.recipeId !== current.recipeId && option.total <= WEEKLY_MENU_BUDGET_IDR);
                if (!options.length) { setDayMessage({ date: day.dateKeyLocal, text: "Belum ada pengganti berbeda yang sesuai budget. Tambahkan resep lain atau ganti semua menu." }); return; }
                const next = options[Math.floor(Math.random() * options.length)].candidate;
                setOverrides(value => ({ ...value, [day.dateKeyLocal]: next.recipeId })); setError(null); setDayMessage({ date: day.dateKeyLocal, text: `Menu diganti menjadi ${next.name}. Hari lain tetap.` });
              }}>Acak</button></div></div>
              {dayMessage?.date === day.dateKeyLocal && <p className="menu-day-message" role="status">{dayMessage.text}</p>}
              {editingDay === day.dateKeyLocal && <div className="menu-recipe-picker"><label>Cari resep<input type="search" className="form-input" value={search} disabled={applying} onChange={event => setSearch(event.target.value)} placeholder="Cari nama resep…" /></label><div className="menu-recipe-options">{alternatives.filter(option => option.candidate.name.toLowerCase().includes(search.trim().toLowerCase())).map(option => <button type="button" key={option.candidate.recipeId} className="menu-recipe-option" disabled={applying || option.total > WEEKLY_MENU_BUDGET_IDR} aria-pressed={option.candidate.recipeId === current.recipeId} onClick={() => {
                setOverrides(value => ({ ...value, [day.dateKeyLocal]: option.candidate.recipeId })); setEditingDay(null); setDayMessage(null); setError(null);
              }}><strong>{option.candidate.name}</strong><small>Total belanja {formatIdr(option.total)}{option.total > WEEKLY_MENU_BUDGET_IDR ? " · melebihi budget" : option.candidate.recipeId === current.recipeId ? " · dipakai" : ""}</small></button>)}</div></div>}
            </section>;
          })}</div>
          {proposal.sameAsPrevious && !Object.keys(overrides).length && <p className="menu-cost-note">Belum ada kombinasi berbeda yang sesuai budget dengan resep yang tersedia.</p>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="menu-generator-footer">
        {complete && <div className="menu-budget-total"><span>Total estimasi belanja <strong>{formatIdr(total)}</strong></span><small>{withinBudget ? `Sisa budget ${formatIdr(WEEKLY_MENU_BUDGET_IDR - total)}` : "Melebihi budget. Pilih menu lebih hemat."}</small></div>}
        <div className="menu-generator-actions"><button type="button" className="btn btn-secondary" disabled={applying} onClick={() => setOpen(false)}>Batal</button><button type="button" className="btn btn-secondary" disabled={applying || !proposal} onClick={reroll}>Ganti semua menu</button><button type="button" className="btn btn-primary" disabled={applying || !withinBudget} onClick={apply}>{applying ? "Menyetujui…" : "Setuju & lihat belanja"}</button></div>
      </footer>
    </div></div>}
  </div>;
}
