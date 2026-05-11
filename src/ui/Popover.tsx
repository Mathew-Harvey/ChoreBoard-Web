import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Minimal anchored popover. Click outside / Escape to close. No portal —
 * relies on `position: absolute` relative to the trigger's parent.
 *
 * Use it for kebab menus + small pickers; not designed for big modals.
 */
export function Popover({
  open,
  onOpenChange,
  children,
  align = 'end',
  width = 240,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) {
        onOpenChange(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    // Defer one tick so the click that opened us doesn't immediately close us.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute top-full z-30 mt-2 rounded-xl bg-paper p-1.5 ring-2 ring-ink-900 shadow-paper animate-floatIn ${
        align === 'end' ? 'right-0' : 'left-0'
      }`}
      style={{ width }}
      role="menu"
    >
      {children}
    </div>
  );
}

export function MenuItem({
  onClick,
  disabled,
  destructive,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? 'text-accent-red hover:bg-accent-red/10'
          : 'text-ink-900 hover:bg-ink-900/5'
      }`}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t-2 border-cream-200" />;
}

/**
 * Convenience wrapper: a trigger + popover pair. Manages its own open state.
 */
export function Menu({
  trigger,
  align,
  width,
  children,
}: {
  trigger: (open: boolean, setOpen: (v: boolean) => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {trigger(open, setOpen)}
      <Popover open={open} onOpenChange={setOpen} align={align} width={width}>
        {children(() => setOpen(false))}
      </Popover>
    </div>
  );
}
