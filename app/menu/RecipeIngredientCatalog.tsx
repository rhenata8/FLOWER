"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ActionIcon } from "../components/ActionIcon";
import { formatIdr } from "../lib/utils";
import "./ingredient-catalog.css";

type RecipeLine = { _id: Id<"recipeIngredients">; ingredientId: Id<"ingredients">; name: string; quantity: number; unit: string; costIdr: number };
type Props = {
  recipe: { _id: Id<"recipes">; name: string };
  lines: RecipeLine[] | undefined;
  ingredients: Doc<"ingredients">[] | undefined;
  onClose: () => void;
  onRemove: (id: Id<"recipeIngredients">, name: string) => void;
};
const frequencies = ["semua", "harian", "mingguan", "bulanan"] as const;

export function RecipeIngredientCatalog({ recipe, lines, ingredients, onClose, onRemove }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const quantityFocusRef = useRef<Id<"ingredients"> | null>(null);
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState<typeof frequencies[number]>("semua");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [onlySelected, setOnlySelected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const addIngredients = useMutation(api.meals.addRecipeIngredients);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      // The existing removal confirmation owns keyboard focus while it is open.
      if (document.querySelector(".confirm-modal")) return;
      if (event.key === "Escape" && !savingRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const id = quantityFocusRef.current;
    if (!id) return;
    const input = document.getElementById(`${titleId}-${id}`) as HTMLInputElement | null;
    if (!input) return;
    quantityFocusRef.current = null;
    input.focus({ preventScroll: true });
    input.select();
    input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected, onlySelected, titleId]);

  const linked = new Set(lines?.map(line => line.ingredientId));
  const available = ingredients ?? [];
  const filtered = available.filter(ingredient => onlySelected ? selected[ingredient._id] !== undefined && !linked.has(ingredient._id) :
    ingredient.name.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")) &&
    (frequency === "semua" || (ingredient.kind ?? "harian") === frequency)
  ).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const selectedIds = Object.keys(selected);
  const chosen = available.filter(ingredient => selected[ingredient._id] !== undefined && !linked.has(ingredient._id));
  const unavailable = selectedIds.length !== chosen.length;
  const valid = chosen.length > 0 && !unavailable && chosen.every(ingredient => Number.isFinite(Number(selected[ingredient._id])) && Number(selected[ingredient._id]) > 0);
  const missingQuantities = chosen.filter(ingredient => !Number.isFinite(Number(selected[ingredient._id])) || Number(selected[ingredient._id]) <= 0).length;
  const toggle = (ingredient: Doc<"ingredients">) => {
    setError(null);
    setMessage("");
    if (selected[ingredient._id] === undefined) quantityFocusRef.current = ingredient._id;
    setSelected(current => {
      const next = { ...current };
      if (next[ingredient._id] !== undefined) delete next[ingredient._id];
      else next[ingredient._id] = ingredient.usagePerCook ? String(ingredient.usagePerCook) : "";
      return next;
    });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !valid) return;
    savingRef.current = true;
    setSaving(true); setError(null); setMessage("");
    try {
      const result = await addIngredients({ recipeId: recipe._id, items: chosen.map(ingredient => ({ ingredientId: ingredient._id, quantity: Number(selected[ingredient._id]) })) });
      setSelected({});
      setOnlySelected(false);
      setMessage(`${result.addedCount} bahan ditambahkan.${result.skippedCount ? ` ${result.skippedCount} bahan sudah ada di resep.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan bahan. Coba lagi.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <div className="modal-overlay catalog-overlay">
      <div className="ingredient-catalog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <header className="catalog-header">
          <h2 id={titleId}>Kelola bahan: {recipe.name}</h2>
          <p>Centang bahan, lalu isi takaran langsung di barisnya. Satuan mengikuti data bahan.</p>
        </header>
        <form onSubmit={submit} className="catalog-form">
          <div className="catalog-body">
            <section className="catalog-current" aria-label="Bahan dalam resep">
              <h3>Dalam resep <span>{lines?.length ?? 0}</span></h3>
              {lines === undefined ? <p className="catalog-empty">Memuat bahan resep…</p> : !lines.length ? <p className="catalog-empty">Belum ada bahan. Pilih bahan dari katalog di samping.</p> : (
                <ul className="catalog-current-list">
                  {lines.map(line => <li key={line._id}>
                    <div><strong>{line.name}</strong><small>{line.quantity} {line.unit} <span>· {formatIdr(line.costIdr)}</span></small></div>
                    <ActionIcon action="delete" label={`Hapus ${line.name} dari resep`} disabled={saving} onClick={() => onRemove(line._id, line.name)} />
                  </li>)}
                </ul>
              )}
              {!!lines?.length && <div className="catalog-total"><span>Estimasi biaya resep</span><strong>{formatIdr(lines.reduce((total, line) => total + line.costIdr, 0))}</strong></div>}
            </section>
            <section className="catalog-picker" aria-label="Katalog bahan">
              <h3>Katalog bahan <span>{available.length}</span></h3>
              <label className="catalog-search-label">Cari bahan
                <input type="search" className="form-input" placeholder="Cari ayam, bawang, cabai…" value={search} onChange={event => { setSearch(event.target.value); setOnlySelected(false); }} disabled={saving} />
              </label>
              <div className="catalog-filters" role="group" aria-label="Frekuensi bahan">
                {frequencies.map(kind => <button type="button" key={kind} aria-pressed={!onlySelected && frequency === kind} onClick={() => { setFrequency(kind); setOnlySelected(false); }} disabled={saving}>{kind}</button>)}
                {selectedIds.length > 0 && <button type="button" aria-pressed={onlySelected} onClick={() => setOnlySelected(current => !current)} disabled={saving}>Dipilih ({selectedIds.length})</button>}
              </div>
              {selectedIds.length > 0 && <div className="catalog-selection-summary"><span>{selectedIds.length} bahan dipilih</span><button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setSelected({}); setOnlySelected(false); }}>Batal pilih semua</button></div>}
              {unavailable && <p className="form-error" role="alert">Ada pilihan yang sudah berubah atau dipakai. Batal pilih semua, lalu pilih kembali.</p>}
              <div className="catalog-options" tabIndex={0} aria-label="Hasil pencarian bahan" aria-busy={ingredients === undefined}>
                {ingredients === undefined ? <p className="catalog-empty">Memuat katalog…</p> : !filtered.length ? <p className="catalog-empty">{!available.length ? "Belum ada bahan. Tambahkan dahulu di tab Bahan." : "Tidak ada bahan yang cocok. Coba kata lain atau filter Semua."}</p> : filtered.map(ingredient => {
                  const used = linked.has(ingredient._id);
                  const checked = selected[ingredient._id] !== undefined;
                  return <div key={ingredient._id} className={`catalog-option${checked && !used ? " is-selected" : ""}${used ? " is-used" : ""}`}>
                    <label className="catalog-option-label">
                    <input type="checkbox" checked={used || checked} disabled={saving || used || lines === undefined} onChange={() => toggle(ingredient)} aria-label={`Pilih ${ingredient.name} (${ingredient.unit})`} />
                    <span><strong>{ingredient.name}</strong><small>{ingredient.unit} · {ingredient.kind ?? "harian"}</small></span>
                    {used && <small className="catalog-used-label">Sudah dipakai</small>}
                    </label>
                    {checked && !used && <div className="catalog-quantity">
                      <label htmlFor={`${titleId}-${ingredient._id}`}>Takaran</label>
                      <input id={`${titleId}-${ingredient._id}`} aria-label={`Takaran ${ingredient.name}`} className="form-input" type="number" step="any" min="0" required placeholder="Jumlah" value={selected[ingredient._id]} disabled={saving} onChange={event => setSelected(current => ({ ...current, [ingredient._id]: event.target.value }))} />
                      <span>{ingredient.unit}</span>
                    </div>}
                  </div>;
                })}
              </div>
            </section>
          </div>
          <footer className="catalog-footer">
            <div aria-live="polite">{error ? <p className="form-error" role="alert">{error}</p> : message ? <p className="catalog-success" role="status">{message}</p> : <p>{missingQuantities ? `${missingQuantities} takaran belum diisi · isi di baris bahan` : chosen.length ? `${chosen.length} bahan siap ditambahkan` : "Bisa pilih beberapa bahan sekaligus."}</p>}</div>
            <div className="catalog-footer-actions"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Selesai</button><button type="submit" className="btn btn-primary" disabled={!valid || saving}>{saving ? "Menambahkan…" : `Tambahkan${chosen.length ? ` ${chosen.length}` : ""} bahan`}</button></div>
          </footer>
        </form>
      </div>
    </div>
  );
}
