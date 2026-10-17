export default function Loading() {
  return (
    <div className="loading" style={{ minHeight: "50vh" }}>
      <div className="loading-spinner" />
      <span style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
        Memuat data...
      </span>
    </div>
  );
}
