"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatDateTimeJakarta, getTodayRange, relativeTime } from "../lib/utils";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

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

  const todayRange = getTodayRange();

  const tasks = useQuery(
    api.tasks.list,
    statusFilter === "all" ? {} : { status: statusFilter as "pending" | "completed" | "cancelled" }
  );

  const todayTasks = useQuery(api.tasks.getTodayTasks, {
    todayStart: todayRange.start,
    todayEnd: todayRange.end,
  });

  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const completeTask = useMutation(api.tasks.complete);
  const cancelTask = useMutation(api.tasks.cancel);

  const parseDateTimeToEpoch = (date: string, time: string): number | undefined => {
    if (!date) return undefined;
    const timeStr = time || "00:00";
    return new Date(`${date}T${timeStr}:00+07:00`).getTime();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("Judul tidak boleh kosong");
      return;
    }

    try {
      const dueAt = parseDateTimeToEpoch(form.dueAt, form.dueTime);
      const remindAt = parseDateTimeToEpoch(form.remindAt, form.remindTime);

      if (modalMode === "edit" && editId) {
        await updateTask({
          id: editId,
          title: form.title,
          description: form.description || undefined,
          dueAt,
          remindAt,
          repeatRule: form.repeatRule || undefined,
        });
      } else {
        await createTask({
          title: form.title,
          description: form.description || undefined,
          dueAt,
          remindAt,
          repeatRule: form.repeatRule || undefined,
        });
      }
      setModalMode(null);
      setForm(initialForm);
      setEditId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const handleEdit = (task: NonNullable<typeof tasks>[0]) => {
    const dueDate = task.dueAt ? new Date(task.dueAt) : null;
    const remindDate = task.remindAt ? new Date(task.remindAt) : null;

    setForm({
      title: task.title,
      description: task.description ?? "",
      dueAt: dueDate ? dueDate.toISOString().split("T")[0] : "",
      dueTime: dueDate ? dueDate.toTimeString().slice(0, 5) : "",
      remindAt: remindDate ? remindDate.toISOString().split("T")[0] : "",
      remindTime: remindDate ? remindDate.toTimeString().slice(0, 5) : "",
      repeatRule: task.repeatRule ?? "",
    });
    setEditId(task._id);
    setModalMode("edit");
  };

  const handleComplete = async (id: Id<"tasks">) => {
    try {
      await completeTask({ id });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const handleCancel = async (id: Id<"tasks">) => {
    if (!confirm("Batalkan tugas ini?")) return;
    try {
      await cancelTask({ id });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
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
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Tugas</h1>
          <p className="section-subtitle">Kelola tugas dan pengingat</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(initialForm); setModalMode("create"); setEditId(null); }}>
          + Tugas Baru
        </button>
      </div>

      {/* Quick Stats */}
      {todayTasks && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-icon tasks">📋</div>
            <div className="stat-card-label">Hari Ini</div>
            <div className="stat-card-value">{todayTasks.today.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: "var(--error-bg)", color: "var(--error)" }}>⚠️</div>
            <div className="stat-card-label">Terlambat</div>
            <div className="stat-card-value" style={{ color: todayTasks.overdue.length > 0 ? "var(--error)" : undefined }}>
              {todayTasks.overdue.length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: "var(--info-bg)", color: "var(--info)" }}>📅</div>
            <div className="stat-card-label">Mendatang</div>
            <div className="stat-card-value">{todayTasks.upcoming.length}</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="tabs">
        {(["pending", "completed", "cancelled", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            className={`tab ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "pending" ? "Menunggu" : s === "completed" ? "Selesai" : s === "cancelled" ? "Dibatalkan" : "Semua"}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="card">
        {tasks && tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task._id} className={`list-item ${task.status === "cancelled" ? "voided" : ""}`}>
              {task.status === "pending" && (
                <div
                  className="checkbox"
                  onClick={() => handleComplete(task._id)}
                  title="Selesaikan"
                />
              )}
              {task.status !== "pending" && (
                <div
                  className="list-item-icon"
                  style={{
                    background: task.status === "completed" ? "var(--success-bg)" : "var(--bg-secondary)",
                    color: task.status === "completed" ? "var(--success)" : "var(--text-tertiary)",
                  }}
                >
                  {task.status === "completed" ? "✓" : "✕"}
                </div>
              )}
              <div className="list-item-content">
                <div className="list-item-title">
                  {task.title}
                  {isOverdue(task) && (
                    <span className="badge badge-overdue" style={{ marginLeft: "var(--space-sm)" }}>Terlambat</span>
                  )}
                  {task.repeatRule && (
                    <span className="badge badge-info" style={{ marginLeft: "var(--space-sm)" }}>
                      🔄 {task.repeatRule}
                    </span>
                  )}
                </div>
                <div className="list-item-subtitle">
                  {task.dueAt ? `Tenggat: ${formatDateTimeJakarta(task.dueAt)}` : "Tanpa tenggat"}
                  {task.remindAt && ` · Pengingat: ${formatDateTimeJakarta(task.remindAt)}`}
                  {task.completedAt && ` · Selesai: ${relativeTime(task.completedAt)}`}
                </div>
                {task.description && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)", marginTop: "var(--space-xs)" }}>
                    {task.description}
                  </div>
                )}
              </div>
              <div className="list-item-right" style={{ display: "flex", gap: "var(--space-xs)", alignItems: "center" }}>
                {getStatusBadge(task.status)}
                {task.status === "pending" && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(task)} title="Edit">✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(task._id)} title="Batalkan">🚫</button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : tasks ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">
              {statusFilter === "pending" ? "Tidak ada tugas menunggu" :
               statusFilter === "completed" ? "Belum ada tugas selesai" :
               statusFilter === "cancelled" ? "Tidak ada tugas dibatalkan" :
               "Belum ada tugas"}
            </div>
            <div className="empty-state-description">
              Buat tugas baru untuk mulai mengorganisir harimu.
            </div>
            <button className="btn btn-primary" onClick={() => { setForm(initialForm); setModalMode("create"); }}>
              + Tugas Baru
            </button>
          </div>
        ) : (
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="list-item">
                <div className="skeleton" style={{ width: 20, height: 20, borderRadius: "var(--radius-sm)" }} />
                <div className="list-item-content">
                  <div className="skeleton skeleton-text" style={{ width: "50%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="toast-container">
          <div className="toast error" onClick={() => setError(null)}>
            {error}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {modalMode === "create" ? "Tugas Baru" : "Edit Tugas"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Judul</label>
                <input
                  className="form-input"
                  placeholder="Apa yang perlu dilakukan?"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deskripsi (opsional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Detail tambahan..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tenggat</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dueAt}
                    onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Jam</label>
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
                  <label className="form-label">Pengingat</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.remindAt}
                    onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Jam</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.remindTime}
                    onChange={(e) => setForm({ ...form, remindTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pengulangan (opsional)</label>
                <select
                  className="form-select"
                  value={form.repeatRule}
                  onChange={(e) => setForm({ ...form, repeatRule: e.target.value })}
                >
                  <option value="">Tidak berulang</option>
                  <option value="daily">Setiap hari</option>
                  <option value="weekly">Setiap minggu</option>
                  <option value="monthly">Setiap bulan</option>
                </select>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => { setModalMode(null); setError(null); }}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === "create" ? "Buat Tugas" : "Perbarui"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
