"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Themed replacement for the native <select>. The menu is positioned with `fixed`
 * so it is never clipped by modals or scrolling cards.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  ariaLabel,
  disabled,
  id,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const openMenu = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(140, Math.min(300, openUp ? spaceAbove : spaceBelow)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className={`dd${open ? " open" : ""}${disabled ? " disabled" : ""}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-autocomplete="none"
        className="dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`dd-value${selected ? "" : " placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && position && (
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          className="dd-menu"
          style={{
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
            maxHeight: position.maxHeight,
          }}
        >
          {options.length === 0 ? (
            <div className="dd-empty">Belum ada pilihan</div>
          ) : (
            options.map((option, index) => (
              <button
                key={option.value}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                className={`dd-option${index === activeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="dd-option-text">
                  <span>{option.label}</span>
                  {option.hint && <small>{option.hint}</small>}
                </span>
                {option.value === value && (
                  <svg className="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
