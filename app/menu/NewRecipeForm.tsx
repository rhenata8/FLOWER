"use client";
import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { IngredientPicker } from "./IngredientPicker";

export function NewRecipeForm({ ingredients, onSaved, onCancel }: { ingredients: Doc<"ingredients">[] | undefined; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [instructions, setInstructions] = useState("");
  const [selected, setSelected] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const createRecipe = useMutation(api.meals.createRecipe);
  const chosen = (ingredients ?? []).filter(ingredient => selected[ingredient._id] !== undefined);
  const valid = name.trim() && Number.isInteger(Number(servings)) && Number(servings) > 0 && chosen.length > 0 && chosen.length === Object.keys(selected).length && chosen.every(ingredient => Number.isFinite(Number(selected[ingredient._id])) && Number(selected[ingredient._id]) > 0);
  return <form className="card recipe-create-form" onSubmit={async event => {
    event.preventDefault(); if (pending.current || !valid) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      await createRecipe({ name, servings: Number(servings), instructions: instructions.trim() || undefined, ingredients: chosen.map(ingredient => ({ ingredientId: ingredient._id, quantity: Number(selected[ingredient._id]) })) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan resep"); }
    finally { pending.current = false; setSaving(false); }
  }}>
    <h2 className="card-title">Tambah resep baru</h2>
    <p className="card-subtitle">Isi resep dan bahannya sekaligus. Belum tersimpan sampai kamu menekan Simpan.</p>
    <fieldset disabled={saving} className="recipe-create-fields">
      <div className="form-row">
        <label className="form-group">Nama resep<input className="form-input" value={name} onChange={event => setName(event.target.value)} placeholder="Contoh: Sayur sop" required autoFocus /></label>
        <label className="form-group">Porsi<input className="form-input" type="number" min="1" step="1" value={servings} onChange={event => setServings(event.target.value)} required /></label>
      </div>
      <label className="form-group">Instruksi / catatan memasak (opsional)<textarea className="form-textarea" value={instructions} onChange={event => setInstructions(event.target.value)} rows={2} /></label>
      <IngredientPicker ingredients={ingredients} selected={selected} onChange={setSelected} disabled={saving} />
    </fieldset>
    {!chosen.length && <p className="card-subtitle">Pilih minimal satu bahan dan isi takarannya.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving || !valid}>{saving ? "Menyimpan…" : "Simpan resep & bahan"}</button></div>
  </form>;
}
