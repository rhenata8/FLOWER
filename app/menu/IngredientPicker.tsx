"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import "./ingredient-catalog.css";

type Props = { ingredients: Doc<"ingredients">[] | undefined; selected: Record<string, string>; onChange: (selection: Record<string, string>) => void; linkedIds?: Id<"ingredients">[]; disabled?: boolean };
const frequencies = ["semua", "harian", "mingguan", "bulanan"] as const;
export function IngredientPicker({ ingredients, selected, onChange, linkedIds = [], disabled = false }: Props) {
  const titleId = useId();
  const quantityFocusRef = useRef<Id<"ingredients"> | null>(null);
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState<typeof frequencies[number]>("semua");
  const [onlySelected, setOnlySelected] = useState(false);
  useEffect(() => {
    const id = quantityFocusRef.current;
    if (!id) return;
    const input = document.getElementById(`${titleId}-${id}`) as HTMLInputElement | null;
    if (!input) return;
    quantityFocusRef.current = null;
    input.focus({ preventScroll: true }); input.select();
    input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected, onlySelected, titleId]);
  const linked = new Set(linkedIds);
  const available = ingredients ?? [];
  const selectedView = onlySelected && Object.keys(selected).length > 0;
  const filtered = available.filter(ingredient => selectedView ? selected[ingredient._id] !== undefined && !linked.has(ingredient._id) : ingredient.name.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")) && (frequency === "semua" || (ingredient.kind ?? "harian") === frequency)).sort((a,b) => a.name.localeCompare(b.name,"id"));
  const selectedIds = Object.keys(selected);
  const unavailable = selectedIds.some(id => !available.some(ingredient => ingredient._id === id) || linked.has(id as Id<"ingredients">));
  const toggle = (ingredient: Doc<"ingredients">) => {
    const next = { ...selected };
    if (next[ingredient._id] !== undefined) delete next[ingredient._id];
    else { next[ingredient._id] = ingredient.usagePerCook ? String(ingredient.usagePerCook) : ""; quantityFocusRef.current = ingredient._id; }
    onChange(next);
  };
  return (
            <section className="catalog-picker" aria-label="Katalog bahan">
              <h3>Katalog bahan <span>{available.length}</span></h3>
              <label className="catalog-search-label">Cari bahan
                <input type="search" className="form-input" placeholder="Cari ayam, bawang, cabai…" value={search} onChange={event => { setSearch(event.target.value); setOnlySelected(false); }} disabled={disabled} />
              </label>
              <div className="catalog-filters" role="group" aria-label="Frekuensi bahan">
                {frequencies.map(kind => <button type="button" key={kind} aria-pressed={!selectedView && frequency === kind} onClick={() => { setFrequency(kind); setOnlySelected(false); }} disabled={disabled}>{kind}</button>)}
                {selectedIds.length > 0 && <button type="button" aria-pressed={selectedView} onClick={() => setOnlySelected(current => !current)} disabled={disabled}>Dipilih ({selectedIds.length})</button>}
              </div>
              {selectedIds.length > 0 && <div className="catalog-selection-summary"><span>{selectedIds.length} bahan dipilih</span><button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => { onChange({}); setOnlySelected(false); }}>Batal pilih semua</button></div>}
              {unavailable && <p className="form-error" role="alert">Ada pilihan yang sudah berubah atau dipakai. Batal pilih semua, lalu pilih kembali.</p>}
              <div className="catalog-options" tabIndex={0} aria-label="Hasil pencarian bahan" aria-busy={ingredients === undefined}>
                {ingredients === undefined ? <p className="catalog-empty">Memuat katalog…</p> : !filtered.length ? <p className="catalog-empty">{!available.length ? "Belum ada bahan. Tambahkan dahulu di tab Bahan." : "Tidak ada bahan yang cocok. Coba kata lain atau filter Semua."}</p> : filtered.map(ingredient => {
                  const used = linked.has(ingredient._id);
                  const checked = selected[ingredient._id] !== undefined;
                  return <div key={ingredient._id} className={`catalog-option${checked && !used ? " is-selected" : ""}${used ? " is-used" : ""}`}>
                    <label className="catalog-option-label">
                    <input type="checkbox" checked={used || checked} disabled={disabled || used} onChange={() => toggle(ingredient)} aria-label={`Pilih ${ingredient.name} (${ingredient.unit})`} />
                    <span><strong>{ingredient.name}</strong><small>{ingredient.unit} · {ingredient.kind ?? "harian"}</small></span>
                    {used && <small className="catalog-used-label">Sudah dipakai</small>}
                    </label>
                    {checked && !used && <div className="catalog-quantity">
                      <label htmlFor={`${titleId}-${ingredient._id}`}>Takaran</label>
                      <input id={`${titleId}-${ingredient._id}`} aria-label={`Takaran ${ingredient.name}`} className="form-input" type="number" step="any" min="0" required placeholder="Jumlah" value={selected[ingredient._id]} disabled={disabled} onChange={event => onChange({ ...selected, [ingredient._id]: event.target.value })} />
                      <span>{ingredient.unit}</span>
                    </div>}
                  </div>;
                })}
              </div>
            </section>
  );
}
