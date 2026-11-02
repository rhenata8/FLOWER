"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ActionIcon } from "../components/ActionIcon";
import { formatIdr } from "../lib/utils";
import "./ingredient-catalog.css";
import { IngredientPicker } from "./IngredientPicker";

type RecipeLine = { _id: Id<"recipeIngredients">; ingredientId: Id<"ingredients">; name: string; quantity: number; unit: string; costIdr: number };
type Props = {
  recipe: { _id: Id<"recipes">; name: string };
  lines: RecipeLine[] | undefined;
  ingredients: Doc<"ingredients">[] | undefined;
  onClose: () => void;
  onRemove: (id: Id<"recipeIngredients">, name: string) => void;
};

export function RecipeIngredientCatalog({ recipe, lines, ingredients, onClose, onRemove }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
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

  const linked = new Set(lines?.map(line => line.ingredientId));
  const available = ingredients ?? [];
  const selectedIds = Object.keys(selected);
  const chosen = available.filter(ingredient => selected[ingredient._id] !== undefined && !linked.has(ingredient._id));
  const unavailable = selectedIds.length !== chosen.length;
  const valid = chosen.length > 0 && !unavailable && chosen.every(ingredient => Number.isFinite(Number(selected[ingredient._id])) && Number(selected[ingredient._id]) > 0);
  const missingQuantities = chosen.filter(ingredient => !Number.isFinite(Number(selected[ingredient._id])) || Number(selected[ingredient._id]) <= 0).length;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !valid) return;
    savingRef.current = true;
    setSaving(true); setError(null); setMessage("");
    try {
      const result = await addIngredients({ recipeId: recipe._id, items: chosen.map(ingredient => ({ ingredientId: ingredient._id, quantity: Number(selected[ingredient._id]) })) });
      setSelected({});
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
            <IngredientPicker ingredients={ingredients} selected={selected} linkedIds={lines?.map(line => line.ingredientId)} disabled={saving || lines === undefined} onChange={next => { setSelected(next); setError(null); setMessage(""); }} />
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
