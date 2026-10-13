"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { FOCUS_RING_CLASS_NAME } from "./reviews/focus-ring";

export interface ComboboxOption {
  readonly value: string;
  /** Marks an option that cannot be picked, for example a seller already linked to the product. */
  readonly disabled?: boolean;
  /** Short reason shown beside a disabled option. */
  readonly hint?: string;
}

export interface MultiSelectComboboxProps {
  /** Id of the text input; the caller's <label htmlFor> points at it. */
  readonly id: string;
  readonly options: readonly ComboboxOption[];
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly placeholder: string;
  readonly noMatchText: string;
}

/**
 * A searchable multi-select following the ARIA 1.2 combobox pattern: the text input keeps focus,
 * ArrowUp/ArrowDown move through the listbox, Enter toggles the highlighted option, Escape closes,
 * Backspace on an empty input removes the last choice. Chosen values show as removable chips.
 */
export function MultiSelectCombobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  noMatchText,
}: MultiSelectComboboxProps): ReactNode {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) => option.value.toLowerCase().includes(needle));
  const pickable = visible.filter((option) => option.disabled !== true);
  const active = pickable.find((option) => option.value === activeValue) ?? null;
  // Position-based: a seller name may hold spaces, which an id used as an IDREF cannot.
  const optionId = (option: ComboboxOption): string => `${listboxId}-${String(options.indexOf(option))}`;
  const activeId = active === null ? null : optionId(active);

  // Keeps the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (open && activeId !== null) {
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeId]);

  function toggle(option: ComboboxOption): void {
    if (option.disabled === true) {
      return;
    }
    onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value]);
    setQuery("");
  }

  function move(step: 1 | -1): void {
    setOpen(true);
    if (pickable.length === 0) {
      return;
    }
    const index = active === null ? -1 : pickable.indexOf(active);
    const next = (index + step + pickable.length) % pickable.length;
    setActiveValue(pickable[next]?.value ?? null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Enter":
        // Never submits the surrounding form from the input; it picks the highlighted option.
        event.preventDefault();
        if (open && active !== null) {
          toggle(active);
        }
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case "Backspace": {
        const last = value.at(-1);
        if (query === "" && last !== undefined) {
          onChange(value.slice(0, -1));
        }
        return;
      }
      default:
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!containerRef.current?.contains(event.relatedTarget)) {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={onBlur}>
      <div
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 shadow-xs",
          "focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        )}
      >
        {value.map((selected) => (
          <span
            key={selected}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {selected}
            <button
              type="button"
              aria-label={`Remove ${selected}`}
              className={cn("rounded-sm hover:text-destructive", FOCUS_RING_CLASS_NAME)}
              onClick={() => {
                onChange(value.filter((item) => item !== selected));
              }}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeId !== null ? activeId : undefined}
          autoComplete="off"
          value={query}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveValue(null);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onClick={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </div>
      <ul
        id={listboxId}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Sellers"
        hidden={!open}
        className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-card p-1 text-sm shadow-md"
      >
        {visible.length === 0 ? (
          <li role="presentation" className="px-2 py-1.5 text-muted-foreground">
            {noMatchText}
          </li>
        ) : (
          visible.map((option) => {
            const selected = value.includes(option.value);
            const disabled = option.disabled === true;
            return (
              <li
                key={option.value}
                id={optionId(option)}
                role="option"
                aria-selected={selected}
                aria-disabled={disabled}
                // mousedown would blur the input and close the list before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  toggle(option);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5",
                  active?.value === option.value && "bg-accent text-accent-foreground",
                  disabled && "cursor-not-allowed text-muted-foreground",
                )}
              >
                <Check aria-hidden="true" className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 whitespace-pre-wrap">{option.value}</span>
                {disabled && option.hint !== undefined ? <span className="text-xs">{option.hint}</span> : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
