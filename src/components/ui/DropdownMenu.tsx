import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  group?: string;
}

interface DropdownMenuProps {
  options: DropdownOption[];
  value?: string;
  values?: string[];
  onChange: (value: string) => void;
  onToggle?: (value: string) => void;
  label: string;
  placeholder?: string;
  allLabel?: string;
  className?: string;
}

export function DropdownMenu({ options, value, values, onChange, onToggle, label, placeholder, allLabel = 'All', className = '' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const multi = Boolean(onToggle);
  const selected = new Set(values ?? []);
  const selectedLabels = options.filter((option) => selected.has(option.value)).map((option) => option.label);
  const current = options.find((option) => option.value === value);
  const buttonLabel = multi
    ? selectedLabels.length === 0 ? allLabel : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} selected`
    : current?.label ?? placeholder ?? '';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  let lastGroup: string | undefined;
  return <div className={`dropdown-menu ${className}`} ref={rootRef}>
    <button className="dropdown-trigger" type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((isOpen) => !isOpen)}>
      <span className="dropdown-trigger-label">{buttonLabel}</span><ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {open && <div className={`dropdown-popover${multi ? ' is-multi' : ''}`} role="listbox" aria-label={label} aria-multiselectable={multi || undefined}>
      {multi && <>
        <button className={`dropdown-option dropdown-all-option${selected.size === 0 ? ' is-selected' : ''}`} type="button" role="option" aria-selected={selected.size === 0} onClick={() => { for (const item of selected) onToggle?.(item); }}>
          <span className="dropdown-indicator" aria-hidden="true">{selected.size === 0 && <i />}</span><span>{allLabel}</span>
        </button>
        <div className="dropdown-divider" />
      </>}
      {options.map((option) => {
        const groupHeading = option.group && option.group !== lastGroup;
        lastGroup = option.group;
        const isSelected = multi ? selected.has(option.value) : option.value === value;
        return <div className="dropdown-option-wrap" key={option.value}>
          {groupHeading && <div className="dropdown-group-label">{option.group}</div>}
          <button className={`dropdown-option${isSelected ? ' is-selected' : ''}`} type="button" role="option" aria-selected={isSelected} onClick={() => {
            if (multi) onToggle?.(option.value);
            else { onChange(option.value); setOpen(false); }
          }}>
            <span className="dropdown-indicator" aria-hidden="true">{isSelected && (multi ? <i /> : <Check size={11} strokeWidth={2.5} />)}</span><span>{option.label}</span>
          </button>
        </div>;
      })}
    </div>}
  </div>;
}
