"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatDateTimeJakarta, toJakartaDateKey, toJakartaTimeKey, todayKeyLocal } from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "../components/ConfirmModal";

type StatusFilter = "pending" | "completed" | "cancelled" | "all";
type ModalMode = "create" | "edit" | null;

interface TaskForm {
  title: string;
  description: string;
  dueAt: string;
  dueTime: string;
  remindAt: string;
  remindTime: string;
  repeatRule: string;
}

const initialForm: TaskForm = {
  title: "",
  description: "",
  dueAt: "",
  dueTime: "",
  remindAt: "",
  remindTime: "",
  repeatRule: "",
};

export default function TugasPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [editId, setEditId] = useState<Id<"tasks"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionText: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionText: "Hapus",
    isDanger: true,
    onConfirm: async () => {},
  });
  const [isActionLoading, setIsActionLoading] = useState(false);

  const tasks = useQuery(
    api.tasks.list,
    statusFilter === "all" ? {} : { status: statusFilter as "pending" | "completed" | "cancelled" }
  );

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  const todayTasks = useQuery(api.tasks.getTodayTasks, {
    todayStart,
    todayEnd,
  });

  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const completeTask = useMutation(api.tasks.complete);
  const cancelTask = useMutation(api.tasks.cancel);
  const removeTask = useMutation(api.tasks.remove);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSubmitting) return;

    if (!form.title.trim()) {
      setError("Judul tugas tidak boleh kosong");
      return;
    }

    let dueAtEpoch: number | undefined;
    if (form.dueAt) {
      const timeStr = form.dueTime || "23:59";
      dueAtEpoch = new Date(`${form.dueAt}T${timeStr}:00+07:00`).getTime();
    }

    let remindAtEpoch: number | undefined;
    if (form.remindAt) {
      const timeStr = form.remindTime || "09:00";
      remindAtEpoch = new Date(`${form.remindAt}T${timeStr}:00+07:00`).getTime();
    }

    setIsSubmitting(true);
    try {
      if (modalMode === "edit" && editId) {
        await updateTask({
          id: editId,
          title: form.title,
          description: form.description || undefined,
          dueAt: dueAtEpoch,
          remindAt: remindAtEpoch,
          repeatRule: form.repeatRule || undefined,
        });
      } else {
        await createTask({
          title: form.title,
          description: form.description || undefined,
          dueAt: dueAtEpoch,
          remindAt: remindAtEpoch,
          repeatRule: form.repeatRule || undefined,
        });
      }
      setModalMode(null);
      setForm(initialForm);
      setEditId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (task: NonNullable<typeof tasks>[0]) => {
    setForm({
      title: task.title,
      description: task.description ?? "",
      dueAt: task.dueAt ? toJakartaDateKey(task.dueAt) : "",
      dueTime: task.dueAt ? toJakartaTimeKey(task.dueAt) : "",
      remindAt: task.remindAt ? toJakartaDateKey(task.remindAt) : "",
      remindTime: task.remindAt ? toJakartaTimeKey(task.remindAt) : "",
      repeatRule: task.repeatRule ?? "",
    });
    setEditId(task._id);
    setModalMode("edit");
  };

  const handleComplete = async (id: Id<"tasks">) => {
    try {
      await completeTask({ id });
    } catch (err: unknown) {
      console.error("Gagal menyelesaikan tugas", err);
    }
  };

  const promptCancel = (task: { _id: Id<"tasks">; title: string }) => {
    setConfirmModal({
      isOpen: true,
      title: "Batalkan Tugas",
      message: `Tandai tugas "${task.title}" sebagai dibatalkan?`,
      actionText: "Batalkan",
      isDanger: false,
      onConfirm: async () => {
        setIsActionLoading(true);
        try {
          await cancelTask({ id: task._id });
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: unknown) {
          console.error("Gagal membatalkan tugas", err);
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  const promptDelete = (task: { _id: Id<"tasks">; title: string }) => {
    setConfirmModal({
      isOpen: true,
      title: "Hapus Tugas",
      message: `Apakah Anda yakin ingin menghapus tugas "${task.title}" secara permanen? Data yang telah dihapus tidak dapat dipulihkan.`,
      actionText: "Hapus Tugas",
      isDanger: true,
      onConfirm: async () => {
        setIsActionLoading(true);
        try {
          await removeTask({ id: task._id });
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (editId === task._id) {
            setModalMode(null);
            setEditId(null);
          }
        } catch (err: unknown) {
          console.error("Gagal menghapus tugas", err);
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="badge badge-pending">Menunggu</span>;
      case "completed": return <span className="badge badge-completed">Selesai</span>;
      case "cancelled": return <span className="badge badge-cancelled">Dibatalkan</span>;
      default: return null;
    }
  };

  const isOverdue = (task: { dueAt?: number; status: string }) => {
    return task.status === "pending" && task.dueAt && task.dueAt < Date.now();
  };

  return (
    <div className="feature-page">
      <div className="section-header">
        <div>
          <h1 className="section-title">Tugas</h1>
          <p className="section-subtitle">Kelola tugas dan pengingat harian</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({
              ...initialForm,
              dueAt: todayKeyLocal(),
              dueTime: "23:59",
              remindAt: todayKeyLocal(),
              remindTime: "09:00",
            });
            setModalMode("create");
            setEditId(null);
          }}
        >
          + Tugas Baru
        </button>
      </div>

      {/* Quick Stats with Shadow Loading */}
      <div className="stats-grid tugas-stats">
        <div className="stat-card">
          <div className="stat-card-label">Hari Ini</div>
          {todayTasks === undefined ? (
            <div className="skeleton skeleton-text" style={{ width: 44, height: 32, marginTop: 4 }} />
          ) : (
            <div className="stat-card-value">{todayTasks.today.length}</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Terlambat</div>
          {todayTasks === undefined ? (
            <div className="skeleton skeleton-text" style={{ width: 44, height: 32, marginTop: 4 }} />
          ) : (
            <div className="stat-card-value" style={{ color: todayTasks.overdue.length > 0 ? "var(--error)" : undefined }}>
              {todayTasks.overdue.length}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Mendatang</div>
          {todayTasks === undefined ? (
            <div className="skeleton skeleton-text" style={{ width: 44, height: 32, marginTop: 4 }} />
          ) : (
            <div className="stat-card-value">{todayTasks.upcoming.length}</div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="tabs tugas-filter">
        {(["pending", "completed", "cancelled"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            className={`tab ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "pending" ? "Menunggu" : s === "completed" ? "Selesai" : "Dibatalkan"}
          </button>
        ))}
      </div>

      {/* Task Table */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Daftar Tugas</h2>
          <span className="badge badge-accent">
            {tasks ? `${tasks.length} tugas` : "Memuat..."}
          </span>
        </div>

        {tasks === undefined ? (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : tasks.length > 0 ? (
          <div className="table-container">
            <table className="editorial-table">
              <thead>
                <tr>
                  <th style={{ width: 48, textAlign: "center" }}>Status</th>
                  <th>Judul Tugas</th>
                  <th>Tenggat</th>
                  <th>Pengingat</th>
                  <th>Pengulangan</th>
                  <th>Kondisi</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task._id} className={task.status === "cancelled" ? "voided" : ""}>
                    <td style={{ textAlign: "center" }}>
                      {task.status === "pending" ? (
                        <button
                          type="button"
                          className="checkbox"
                          onClick={() => handleComplete(task._id)}
                          title="Tandai selesai"
                          aria-label="Tandai selesai"
                          style={{ display: "inline-block", verticalAlign: "middle" }}
                        />
                      ) : (
                        <div
                          className="list-item-icon"
                          style={{
                            width: 26,
                            height: 26,
                            fontSize: 12,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 8,
                            margin: "0 auto",
                            background: task.status === "completed" ? "var(--success-bg)" : "var(--bg-secondary)",
                            color: task.status === "completed" ? "var(--success)" : "var(--text-tertiary)",
                          }}
                        >
                          {task.status === "completed" ? "✓" : "✕"}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="table-subtext">
                          {task.description}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {task.dueAt ? (
                        <span style={{ color: isOverdue(task) ? "var(--error)" : "inherit", fontWeight: isOverdue(task) ? 600 : 400 }}>
                          {formatDateTimeJakarta(task.dueAt)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {task.remindAt ? formatDateTimeJakarta(task.remindAt) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                    </td>
                    <td>
                      {task.repeatRule ? (
                        <span className="badge badge-info" style={{ textTransform: "capitalize" }}>
                          {task.repeatRule === "daily" ? "Harian" : task.repeatRule === "weekly" ? "Mingguan" : task.repeatRule === "monthly" ? "Bulanan" : task.repeatRule}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>Sekali</span>
                      )}
                    </td>
                    <td>
                      {getStatusBadge(task.status)}
                      {isOverdue(task) && (
                        <span className="badge badge-overdue" style={{ marginLeft: 6 }}>Terlambat</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        {task.status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleEdit(task)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => promptCancel(task)}
                            >
                              Batal
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)" }}
                          onClick={() => promptDelete(task)}
                          title="Hapus permanen"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Belum ada tugas</div>
            <div className="empty-state-description">
              Tambahkan tugas barumu untuk mulai mengatur kegiatan harian.
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalMode && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {modalMode === "create" ? "Tambah Tugas" : "Edit Tugas"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Judul Tugas</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Contoh: Bayar tagihan listrik PLN"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deskripsi (opsional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Catatan tambahan..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tanggal Tenggat</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dueAt}
                    onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Jam Tenggat</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.dueTime}
                    onChange={(e) => setForm({ ...form, dueTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tanggal Pengingat</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.remindAt}
                    onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Jam Pengingat</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.remindTime}
                    onChange={(e) => setForm({ ...form, remindTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pengulangan</label>
                <select
                  className="form-select"
                  value={form.repeatRule}
                  onChange={(e) => setForm({ ...form, repeatRule: e.target.value })}
                >
                  <option value="">Tidak berulang</option>
                  <option value="daily">Harian</option>
                  <option value="weekly">Mingguan</option>
                  <option value="monthly">Bulanan</option>
                </select>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {modalMode === "edit" && editId ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: "var(--error)" }}
                    onClick={() => {
                      const taskTitle = form.title || "tugas ini";
                      promptDelete({ _id: editId, title: taskTitle });
                    }}
                  >
                    Hapus
                  </button>
                ) : <div />}
                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModalMode(null)}
                  >
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} />
                        Menyimpan...
                      </>
                    ) : modalMode === "create" ? "Simpan" : "Perbarui"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        actionText={confirmModal.actionText}
        isDanger={confirmModal.isDanger}
        isLoading={isActionLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
