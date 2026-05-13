import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Minimal anchored popover. Click outside / Escape to close.
 *
 * Renders into a portal (document.body) and positions itself with
 * `position: fixed` relative to the supplied trigger element. This keeps the
 * menu visually on top of everything else regardless of stacking contexts,
 * `overflow:hidden`, transforms, or sibling cards painted later in document
 * order — all of which used to bury the kebab menu behind neighboring
 * chore cards.
 *
 * Use it for kebab menus + small pickers; not designed for big modals.
 */
export function Popover({
  open,
  onOpenChange,
  triggerRef,
  children,
  align = 'end',
  width = 240,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Recompute position whenever the popover opens, the viewport changes, or
  // an ancestor scrolls. `useLayoutEffect` so the first paint already has the
  // right coordinates (no flash at 0,0).
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const t = triggerRef.current;
      if (!t) return;
      const rect = t.getBoundingClientRect();
      const gap = 8; // matches the previous `mt-2`
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      let left = align === 'end' ? rect.right - width : rect.left;
      left = Math.max(margin, Math.min(left, vw - width - margin));
      let top = rect.bottom + gap;
      // Flip above the trigger if there isn't room below.
      const popHeight = ref.current?.offsetHeight ?? 0;
      if (popHeight && top + popHeight + margin > vh && rect.top - gap - popHeight >= margin) {
        top = rect.top - gap - popHeight;
      }
      setPos({ top, left });
    }
    update();
    // Capture-phase scroll listener picks up scrolls on any ancestor.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, align, width, triggerRef]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (ref.current && ref.current.contains(target)) return;
      // Don't double-handle clicks on the trigger itself — the trigger's own
      // onClick will toggle the menu. Closing here would race with that and
      // immediately re-open the menu.
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      onOpenChange(false);
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
  }, [open, onOpenChange, triggerRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] rounded-xl bg-paper p-1.5 ring-2 ring-ink-900 shadow-paper animate-floatIn"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width,
        // Hide until we've measured to avoid a one-frame flash at (0,0).
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {children}
    </div>,
    document.body,
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
      className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? 'text-accent-red hover:bg-accent-red/10 active:bg-accent-red/20'
          : 'text-ink-900 hover:bg-ink-900/5 active:bg-ink-900/10'
      }`}
      style={{ minHeight: 36 }}
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
 *
 * The wrapper element is what the popover anchors against — it must be the
 * direct positioned parent of the trigger so the trigger's bounding rect
 * matches the visible button.
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
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={anchorRef} className="relative inline-flex">
      {trigger(open, setOpen)}
      <Popover
        open={open}
        onOpenChange={setOpen}
        triggerRef={anchorRef}
        align={align}
        width={width}
      >
        {children(() => setOpen(false))}
      </Popover>
    </div>
  );
}
