import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function SelectShell({ children }: { children: ReactNode }) {
  return <span className="select-shell">
    {children}
    <ChevronDown className="select-chevron" size={14} strokeWidth={1.8} aria-hidden="true" />
  </span>;
}
