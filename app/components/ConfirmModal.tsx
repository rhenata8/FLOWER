"use client";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  actionText?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  actionText,
  cancelLabel = "Batal",
  isDangerous,
  isDanger,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const resolvedConfirmLabel = actionText ?? confirmLabel ?? "Hapus";
  const resolvedIsDangerous = isDanger !== undefined ? isDanger : (isDangerous !== undefined ? isDangerous : true);

  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 1000 }}>
      <div
        className="modal confirm-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: resolvedIsDangerous ? "var(--error-bg)" : "var(--accent-100)",
              color: resolvedIsDangerous ? "var(--error)" : "var(--accent-600)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {resolvedIsDangerous ? "!" : "i"}
          </div>
          <h2 className="modal-title" style={{ margin: 0, fontSize: "1.25rem" }}>
            {title}
          </h2>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.5, marginBottom: 24 }}>
          {message}
        </p>

        <div className="modal-actions" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${resolvedIsDangerous ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={isLoading}
            style={resolvedIsDangerous ? { backgroundColor: "var(--error)", color: "#ffffff", borderColor: "transparent" } : undefined}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} />
                Memproses...
              </>
            ) : (
              resolvedConfirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
