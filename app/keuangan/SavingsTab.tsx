"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useConfirm } from "../components/useConfirm";
import { formatDateJakarta, formatIdr, parseIdr } from "../lib/utils";

type SavingModal =
  | { mode: "create" }
  | { mode: "edit"; id: Id<"savings">; name: string; targetIdr: number }
  | null;

export function SavingsTab({ onGoBudgeting }: { onGoBudgeting: () => void }) {
  const savings = useQuery(api.savings.list);
  const contributions = useQuery(api.savings.listContributions, { limit: 12 });

  const createSaving = useMutation(api.savings.create);
  const updateSaving = useMutation(api.savings.update);
  const removeSaving = useMutation(api.savings.remove);
  const removeContribution = useMutation(api.savings.removeContribution);

  const { openConfirm, confirmModal } = useConfirm();

  const [modal, setModal] = useState<SavingModal>(null);
  const [name, setName] = useState("");
  const [targetIdr, setTargetIdr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreate = () => {
    setName("");
    setTargetIdr("");
    setError(null);
    setModal({ mode: "create" });
  };

  const openEdit = (s: NonNullable<typeof savings>[number]) => {
    setName(s.name);
    setTargetIdr(s.targetIdr.toLocaleString("id-ID"));
    setError(null);
    setModal({ mode: "edit", id: s._id, name: s.name, targetIdr: s.targetIdr });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSubmitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama kebutuhan saving harus diisi");
      return;
    }

    const amount = parseIdr(targetIdr);
    if (!amount || amount <= 0) {
      setError("Target tabungan harus bilangan bulat positif");
      return;
    }

    setIsSubmitting(true);
    try {
      if (modal?.mode === "edit") {
        await updateSaving({ id: modal.id, name: trimmed, targetIdr: amount });
      } else {
        await createSaving({ name: trimmed, targetIdr: amount });
      }
      setModal(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan target saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promptDeleteSaving = (s: NonNullable<typeof savings>[number]) => {
    openConfirm({
      title: "Hapus Target Saving",
      message: `Hapus target saving "${s.name}"? Seluruh riwayat kontribusi untuk saving ini juga akan dihapus.`,
      actionText: "Hapus Target",
      isDanger: true,
      onConfirm: async () => {
        await removeSaving({ id: s._id });
      },
    });
  };

  const promptDeleteContribution = (c: NonNullable<typeof contributions>[number]) => {
    openConfirm({
      title: "Hapus Catatan Menabung",
      message: `Hapus setoran ${formatIdr(c.amountIdr)} ke "${c.savingName}"? Saldo terkumpul akan berkurang otomatis.`,
      actionText: "Hapus Setoran",
      isDanger: true,
      onConfirm: async () => {
        await removeContribution({ id: c._id });
      },
    });
  };

  const totalTarget = savings?.reduce((sum, s) => sum + s.targetIdr, 0) ?? 0;
  const totalSaved = savings?.reduce((sum, s) => sum + s.savedIdr, 0) ?? 0;
  const totalRemaining = Math.max(0, totalTarget - totalSaved);
  const overallPercent = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
      {/* Overview Cards */}
      <div className="budget-summary-grid">
        <div className="card budget-summary-card">
          <span className="eyebrow">TOTAL TARGET</span>
          <div className="budget-summary-val">{formatIdr(totalTarget)}</div>
          <p className="budget-summary-sub">Dari {savings?.length ?? 0} pos tabungan</p>
        </div>
        <div className="card budget-summary-card">
          <span className="eyebrow">TERKUMPUL</span>
          <div className="budget-summary-val" style={{ color: "var(--accent-600)" }}>
            {formatIdr(totalSaved)}
          </div>
          <p className="budget-summary-sub">{overallPercent}% dari total impian tercapai</p>
        </div>
        <div className="card budget-summary-card">
          <span className="eyebrow">KURANG</span>
          <div className="budget-summary-val" style={{ color: totalRemaining > 0 ? "var(--warning)" : "var(--accent-600)" }}>
            {formatIdr(totalRemaining)}
          </div>
          <p className="budget-summary-sub">Sisa yang perlu dikumpulkan</p>
        </div>
      </div>

      {/* Info Banner: Saving is managed in Budgeting */}
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-md)",
          padding: "var(--space-md) var(--space-lg)",
          background: "var(--accent-50)",
          border: "1px solid var(--accent-100)",
        }}
      >
        <div>
          <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "var(--font-size-sm)" }}>
            Ingin menambah saldo tabungan?
          </strong>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Pengalokasian tabungan diatur di menu <strong>Budgeting</strong> agar terintegrasi dengan rencana kebutuhanmu.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onGoBudgeting}
          style={{ whiteSpace: "nowrap" }}
        >
          Ke Budgeting untuk Menabung &rarr;
        </button>
      </div>

      {/* Saving Goals List */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: "var(--space-md)" }}>
          <div>
            <h2 className="card-title">Daftar Target Saving</h2>
            <p className="card-subtitle">
              Tentukan kebutuhan yang ingin kamu capai dan pantau sisa kekurangannya
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Target Saving Baru
          </button>
        </div>

        {savings === undefined ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 0" }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : savings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada target saving</div>
            <div className="empty-state-description">
              Mulai buat target tabungan pertamamu, misal: Dana Darurat, Beli Laptop, atau Liburan.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "var(--space-md)" }}
              onClick={openCreate}
            >
              + Buat Target Sekarang
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-md)" }}>
            {savings.map((s) => {
              return (
                <div
                  key={s._id}
                  style={{
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-md)",
                    background: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-sm)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: 700, margin: 0 }}>
                        {s.name}
                      </h3>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
                        Target: {formatIdr(s.targetIdr)}
                      </span>
                    </div>
                    <span
                      className={`badge ${s.isDone ? "badge-accent" : "badge-neutral"}`}
                      style={{ fontSize: "11px" }}
                    >
                      {s.isDone ? "✓ Tercapai" : `${s.percent}%`}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: "var(--bg-secondary)",
                      overflow: "hidden",
                      margin: "4px 0",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${s.percent}%`,
                        background: s.isDone ? "var(--accent-600)" : "var(--accent-500)",
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  {/* Collected & Remaining figures */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "var(--font-size-xs)",
                      padding: "4px 0",
                      borderBottom: "1px dashed var(--border-light)",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>Terkumpul: </span>
                      <strong style={{ color: "var(--accent-600)" }}>{formatIdr(s.savedIdr)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>Kurang: </span>
                      <strong style={{ color: s.remainingIdr > 0 ? "var(--warning)" : "var(--accent-600)" }}>
                        {s.remainingIdr > 0 ? formatIdr(s.remainingIdr) : "Lunas"}
                      </strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--error)" }}
                      onClick={() => promptDeleteSaving(s)}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saving History */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: "var(--space-md)" }}>
          <div>
            <h2 className="card-title">Riwayat Setoran Menabung</h2>
            <p className="card-subtitle">Semua pencatatan menabung yang dilakukan dari Budgeting</p>
          </div>
        </div>

        {contributions === undefined ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 0" }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : contributions.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--space-md)" }}>
            <div className="empty-state-title">Belum ada riwayat setoran</div>
            <div className="empty-state-description">
              Setoran yang kamu catat di tab Budgeting akan tercatat di sini.
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="editorial-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Target Tabungan</th>
                  <th>Catatan</th>
                  <th style={{ textAlign: "right" }}>Jumlah</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c._id}>
                    <td style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                      {formatDateJakarta(c.occurredAt)}
                    </td>
                    <td>
                      <strong style={{ color: "var(--text-primary)" }}>{c.savingName}</strong>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                      {c.note || "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-600)" }}>
                      +{formatIdr(c.amountIdr)}
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--error)" }}
                        onClick={() => promptDeleteContribution(c)}
                        title="Hapus setoran"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create/Edit Saving Target */}
      {modal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <h3 className="card-title" style={{ marginBottom: "var(--space-xs)" }}>
              {modal.mode === "create" ? "Buat Target Saving Baru" : "Edit Target Saving"}
            </h3>
            <p className="card-subtitle" style={{ marginBottom: "var(--space-md)" }}>
              Tentukan nama kebutuhan saving dan jumlah total yang harus dikumpulkan
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nama Kebutuhan Saving</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Dana Darurat, Beli Motor, Liburan..."
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Berapa Banyak yang Harus Dikumpulkan? (Rp)</label>
                <input
                  type="text"
                  className="form-input"
                  value={targetIdr}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "");
                    setTargetIdr(clean ? parseInt(clean, 10).toLocaleString("id-ID") : "");
                  }}
                  placeholder="Contoh: 1.000.000"
                  required
                />
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions" style={{ marginTop: "var(--space-lg)" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModal(null)}
                  disabled={isSubmitting}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : modal.mode === "create" ? "Buat Target" : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal}
    </div>
  );
}
